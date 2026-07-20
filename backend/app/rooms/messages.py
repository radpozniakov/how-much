"""The WebSocket message envelope (S6).

Every frame is a flat ``{"type": ..., ...payload}`` object. This module defines
the two server->client frames (``room_state`` and ``error``), the inbound
handshake frames (``join`` / ``attach``), and the S6b round-action frames
(``set_item`` / ``cast_vote`` / ``set_host_voting`` / ``reveal`` / ``reset``),
plus parsers that turn a raw decoded object into a validated frame.

The handshake and round phases have **separate** frame registries: the first
frame on a socket must be a handshake frame, and every frame after it must be a
round frame. A handshake frame arriving mid-session (or vice versa) is therefore
an unrecognised frame for that phase and rejected with :class:`BadFrame`.

Round frames deliberately carry **no** ``participant_id``: the socket already
established the caller's identity at handshake, so the handler attributes the
action to the connection rather than trusting a client-supplied id (no spoofing).

The outbound ``room_state`` reuses the exact ``RoomView`` the HTTP layer emits
(D-36), so the FR-10 pre-reveal gate is inherited: no card value appears before
the host reveals, regardless of transport.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ValidationError, field_validator

from app import config
from app.rooms.errors import (
    HostNotVoting,
    InvalidCard,
    NotHost,
    RoomError,
    RoundRevealed,
    UnknownParticipant,
)
from app.rooms.models import Room
from app.rooms.views import room_view


class BadFrame(Exception):
    """A client frame could not be parsed or was not a recognised type.

    Transport-level (not a domain ``RoomError``): it means the *envelope* was
    malformed, so the handler answers with an ``error`` frame rather than a
    domain status."""


def room_state_frame(room: Room) -> dict[str, Any]:
    """A full-snapshot server->client frame (D-36)."""
    return {"type": "room_state", "room": room_view(room).model_dump()}


def error_frame(reason: str, message: str) -> dict[str, Any]:
    """A server->client error frame. ``reason`` is a stable machine slug (e.g.
    ``room_not_found``); ``message`` is human-readable."""
    return {"type": "error", "reason": reason, "message": message}


# Stable WS reason slug per domain error — the socket's counterpart to the
# HTTP ``_ROOM_ERROR_STATUS`` map in :mod:`app.main`. Round actions can only raise
# the five below; anything unmapped is a bug, surfaced as the defensive
# ``internal`` slug (kept distinct from the frame ``type: "error"``).
_ERROR_REASONS: dict[type[RoomError], str] = {
    NotHost: "not_host",
    InvalidCard: "invalid_card",
    HostNotVoting: "host_not_voting",
    RoundRevealed: "round_revealed",
    UnknownParticipant: "not_in_room",
}


def room_error_reason(exc: RoomError) -> str:
    """Map a domain error to its stable WS ``error`` slug (default ``internal``)."""
    return _ERROR_REASONS.get(type(exc), "internal")


class JoinFrame(BaseModel):
    """A new participant joining over the socket. Carries only a display name
    (no auth, D-9); trimmed and bounded exactly like the HTTP ``JoinRequest``."""

    type: Literal["join"]
    name: str

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name must not be blank")
        if len(value) > config.MAX_DISPLAY_NAME_LENGTH:
            raise ValueError(
                f"name must be at most {config.MAX_DISPLAY_NAME_LENGTH} characters"
            )
        return value


class AttachFrame(BaseModel):
    """An already-known participant attaching a socket — the creator (who joined
    over HTTP create) or anyone who joined over HTTP. Membership is verified by
    the handler against the room."""

    type: Literal["attach"]
    participant_id: str


HandshakeFrame = JoinFrame | AttachFrame


class SetItemFrame(BaseModel):
    """Set or clear the current item's topic (host-only in the domain, FR-8).

    Bounds the topic length at the transport boundary exactly as the HTTP
    ``SetItemRequest`` does — ``Room.set_item`` only trims, so without this a
    socket could set an unbounded topic that HTTP would reject (D-36 parity).
    ``None`` or blank clears the topic."""

    type: Literal["set_item"]
    topic: str | None = None

    @field_validator("topic")
    @classmethod
    def _check_topic_length(cls, value: str | None) -> str | None:
        if value is not None and len(value.strip()) > config.MAX_TOPIC_LENGTH:
            raise ValueError(
                f"topic must be at most {config.MAX_TOPIC_LENGTH} characters"
            )
        return value


class CastVoteFrame(BaseModel):
    """Cast or change the caller's vote. The card is validated against the deck
    in the domain (``Room.cast_vote``), which raises ``InvalidCard`` (FR-9)."""

    type: Literal["cast_vote"]
    card: str


class SetHostVotingFrame(BaseModel):
    """Toggle whether the host votes this round (host-only, FR-14/D-14)."""

    type: Literal["set_host_voting"]
    voting: bool


class RevealFrame(BaseModel):
    """Reveal the round (host-only, FR-12)."""

    type: Literal["reveal"]


class ResetFrame(BaseModel):
    """Reset for a fresh round (host-only, FR-13)."""

    type: Literal["reset"]


RoundFrame = (
    SetItemFrame | CastVoteFrame | SetHostVotingFrame | RevealFrame | ResetFrame
)

_HANDSHAKE_TYPES: dict[str, type[BaseModel]] = {
    "join": JoinFrame,
    "attach": AttachFrame,
}

_ROUND_TYPES: dict[str, type[BaseModel]] = {
    "set_item": SetItemFrame,
    "cast_vote": CastVoteFrame,
    "set_host_voting": SetHostVotingFrame,
    "reveal": RevealFrame,
    "reset": ResetFrame,
}


def _parse(raw: Any, registry: dict[str, type[BaseModel]]) -> BaseModel:
    """Validate a decoded frame against ``registry``.

    Raises:
        BadFrame: if ``raw`` is not an object, its ``type`` is not in ``registry``
            (including a frame from the *other* phase), or field validation fails.
    """
    if not isinstance(raw, dict):
        raise BadFrame("frame must be a JSON object")
    frame_type = raw.get("type")
    model = registry.get(frame_type) if isinstance(frame_type, str) else None
    if model is None:
        raise BadFrame(f"unknown frame type: {frame_type!r}")
    try:
        return model.model_validate(raw)
    except ValidationError as exc:
        raise BadFrame(str(exc)) from exc


def parse_handshake_frame(raw: Any) -> HandshakeFrame:
    """Validate the first frame on a socket (``join`` / ``attach``)."""
    return _parse(raw, _HANDSHAKE_TYPES)  # type: ignore[return-value]


def parse_round_frame(raw: Any) -> RoundFrame:
    """Validate a mid-session round-action frame."""
    return _parse(raw, _ROUND_TYPES)  # type: ignore[return-value]
