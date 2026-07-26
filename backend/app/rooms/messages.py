"""The WebSocket message envelope (S6).

Every frame is a flat ``{"type": ..., ...payload}`` object. This module defines
the two server->client frames (``room_state`` and ``error``), the inbound
handshake frames (``join`` / ``attach``), and the round-action frames
(``set_item`` / ``set_name`` / ``cast_vote`` / ``set_host_voting`` /
``transfer_host`` / ``remove_participant`` / ``reveal`` / ``reset``), plus parsers
that turn a raw decoded object into a validated frame.

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
# the six below; anything unmapped is a bug, surfaced as the defensive
# ``internal`` slug (kept distinct from the frame ``type: "error"``).
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


# The one ``error`` frame that is nobody's rejection (FR-21/D-47). Every other slug
# above answers a frame the recipient sent; this one is *unsolicited* — it tells a
# participant why the socket they are about to lose is going away. It therefore has
# no domain error to map from and cannot appear in ``_ERROR_REASONS``.
#
# It also occupies a category the client did not previously have: an error that
# arrives mid-session (so the socket already has a snapshot) and is nonetheless
# terminal. Handshake rejections are terminal because no snapshot ever arrived;
# round rejections are non-terminal because the socket stays open. This is neither,
# which is why the frontend's ``roomSocket`` has to name the slug explicitly rather
# than infer terminality from the connection phase.
REMOVED_REASON = "removed"
REMOVED_MESSAGE = "The host removed you from this room"


def removed_frame() -> dict[str, Any]:
    """The notice sent to a removed participant, immediately before their socket is
    closed (FR-21/D-47). Wording lives here, beside the slug it travels with; S22
    owns the final copy and can change it without touching the protocol."""
    return error_frame(REMOVED_REASON, REMOVED_MESSAGE)


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


class SetNameFrame(BaseModel):
    """Change the caller's own display name (self-service, not host-gated).

    Trimmed and bounded exactly like the handshake ``JoinFrame`` — ``Room.set_name``
    trusts the passed name, so without this a socket could set an unbounded/blank
    name the join path would reject (join/rename parity)."""

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
    """Cast or change the caller's vote. The card is validated against the deck
    in the domain (``Room.cast_vote``), which raises ``InvalidCard`` (FR-9)."""

    type: Literal["cast_vote"]
    card: str


class SetHostVotingFrame(BaseModel):
    """Toggle whether the host votes this round (host-only, FR-14/D-14)."""

    type: Literal["set_host_voting"]
    voting: bool


class TransferHostFrame(BaseModel):
    """Hand the host role to another participant (host-only, FR-20/D-45).

    The field is ``target_id``, **not** ``participant_id`` — deliberately. Every
    round frame pointedly omits an actor id so a client cannot attribute an action
    to someone else; a field literally named ``participant_id`` here would sit one
    typo away from being read as that actor id by the next person to touch this
    file. The name says which end of the action it is.

    No length or format validator, unlike ``topic``/``name``: those are values the
    domain trusts, so the frame is their only bound. This one is matched against
    ``room.participants`` in ``Room.transfer_host``, which is a stricter check than
    any transport-boundary bound could express.
    """

    type: Literal["transfer_host"]
    target_id: str


class RemoveParticipantFrame(BaseModel):
    """Remove another participant from the room (host-only, FR-21/D-47).

    ``target_id`` for the same reason ``TransferHostFrame`` uses it: an actor id is
    what every round frame pointedly omits, so the field name has to say which end
    of the action it is. The two frames are deliberately the same shape — they are
    the room-control pair, host-on-participant rather than host-on-round.

    The one way it is *not* like its sibling: this frame's effect on the transport
    exceeds a broadcast, because the removed participant's own socket has to go. So
    it is the one round frame ``ws._apply_round`` does not dispatch — see the
    ``apply_and_evict`` seam in ``connection.py``.
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
