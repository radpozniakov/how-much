"""The WebSocket message envelope (S6).

Every frame is a flat ``{"type": ..., ...payload}`` object: two server->client
frames (``room_state``, ``error``), the handshake frames (``join`` / ``attach``),
the eight round-action frames, and the parsers that validate them.

Handshake and round phases have **separate** registries — the first frame must be
a handshake frame, every later one a round frame — so a frame from the wrong phase
is unrecognised and rejected with :class:`BadFrame`.

Round frames deliberately carry **no** ``participant_id``: the socket established
the caller's identity at handshake, so no client-supplied id is trusted.

``room_state`` reuses the ``RoomView`` the HTTP layer emits (D-36), inheriting the
FR-10 pre-reveal gate on both transports.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ValidationError, field_validator

from app import config
from app.rooms.errors import (
    CannotTargetSelf,
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

    Transport-level, not a domain ``RoomError``: the *envelope* was malformed."""


def room_state_frame(room: Room) -> dict[str, Any]:
    """A full-snapshot server->client frame (D-36)."""
    return {"type": "room_state", "room": room_view(room).model_dump()}


def error_frame(reason: str, message: str) -> dict[str, Any]:
    """A server->client error frame. ``reason`` is a stable machine slug (e.g.
    ``room_not_found``); ``message`` is human-readable."""
    return {"type": "error", "reason": reason, "message": message}


_ERROR_REASONS: dict[type[RoomError], str] = {
    NotHost: "not_host",
    InvalidCard: "invalid_card",
    HostNotVoting: "host_not_voting",
    RoundRevealed: "round_revealed",
    UnknownParticipant: "not_in_room",
    CannotTargetSelf: "cannot_target_self",
}


def room_error_reason(exc: RoomError) -> str:
    """Map a domain error to its stable WS ``error`` slug (default ``internal``)."""
    return _ERROR_REASONS.get(type(exc), "internal")


REMOVED_REASON = "removed"
REMOVED_MESSAGE = "The host removed you from this room"


def removed_frame() -> dict[str, Any]:
    """The notice sent to a removed participant just before their socket closes
    (FR-21/D-47). Wording lives beside the slug it travels with."""
    return error_frame(REMOVED_REASON, REMOVED_MESSAGE)


class JoinFrame(BaseModel):
    """A new participant joining over the socket: a display name, no auth (D-9).
    Trimmed and bounded exactly like the HTTP ``JoinRequest``."""

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
    """An already-known participant attaching a socket after an HTTP create or
    join. The handler verifies membership against the room."""

    type: Literal["attach"]
    participant_id: str


HandshakeFrame = JoinFrame | AttachFrame


class SetItemFrame(BaseModel):
    """Set or clear the current item's topic (host-only in the domain, FR-8).

    Bounds the length here because ``Room.set_item`` only trims. ``None`` or blank
    clears the topic."""

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


class SetNameFrame(BaseModel):
    """Change the caller's own display name (self-service, not host-gated).

    Trimmed and bounded exactly like ``JoinFrame`` — ``Room.set_name`` trusts the
    name it is given, so this is where join/rename parity is enforced."""

    type: Literal["set_name"]
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


class CastVoteFrame(BaseModel):
    """Cast or change the caller's vote. ``Room.cast_vote`` validates the card
    against the deck and raises ``InvalidCard`` (FR-9)."""

    type: Literal["cast_vote"]
    card: str


class SetHostVotingFrame(BaseModel):
    """Toggle whether the host votes this round (host-only, FR-14/D-14)."""

    type: Literal["set_host_voting"]
    voting: bool


class TransferHostFrame(BaseModel):
    """Hand the host role to another participant (host-only, FR-20/D-45).

    ``target_id``, **not** ``participant_id``: round frames omit an actor id, and a
    field by that name would sit one typo away from being read as one.

    No validator, unlike ``topic``/``name``: ``Room.transfer_host`` matches it
    against ``room.participants``, a stricter check than any bound here.
    """

    type: Literal["transfer_host"]
    target_id: str


class RemoveParticipantFrame(BaseModel):
    """Remove another participant from the room (host-only, FR-21/D-47).

    Deliberately the same shape as ``TransferHostFrame``, its room-control sibling,
    and ``target_id`` for the same reason. Unlike that one, its transport effect
    exceeds a broadcast — the target's socket has to go — so it is the one round
    frame ``ws._apply_round`` does not dispatch; see ``apply_and_evict``.
    """

    type: Literal["remove_participant"]
    target_id: str


class RevealFrame(BaseModel):
    """Reveal the round (host-only, FR-12)."""

    type: Literal["reveal"]


class ResetFrame(BaseModel):
    """Reset for a fresh round (host-only, FR-13)."""

    type: Literal["reset"]


RoundFrame = (
    SetItemFrame
    | SetNameFrame
    | CastVoteFrame
    | SetHostVotingFrame
    | TransferHostFrame
    | RemoveParticipantFrame
    | RevealFrame
    | ResetFrame
)

_HANDSHAKE_TYPES: dict[str, type[BaseModel]] = {
    "join": JoinFrame,
    "attach": AttachFrame,
}

_ROUND_TYPES: dict[str, type[BaseModel]] = {
    "set_item": SetItemFrame,
    "set_name": SetNameFrame,
    "cast_vote": CastVoteFrame,
    "set_host_voting": SetHostVotingFrame,
    "transfer_host": TransferHostFrame,
    "remove_participant": RemoveParticipantFrame,
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
