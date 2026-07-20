"""The WebSocket message envelope (S6).

Every frame is a flat ``{"type": ..., ...payload}`` object. This module defines
the two server->client frames S6a needs (``room_state`` and ``error``) plus the
inbound handshake frames (``join`` / ``attach``) and a parser that turns a raw
decoded object into a validated frame. Round-action frames arrive in S6b.

The outbound ``room_state`` reuses the exact ``RoomView`` the HTTP layer emits
(D-36), so the FR-10 pre-reveal gate is inherited: no card value appears before
the host reveals, regardless of transport.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ValidationError, field_validator

from app import config
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


ClientFrame = JoinFrame | AttachFrame

_FRAME_TYPES: dict[str, type[BaseModel]] = {
    "join": JoinFrame,
    "attach": AttachFrame,
}


def parse_client_frame(raw: Any) -> ClientFrame:
    """Validate a decoded client frame into a :data:`ClientFrame`.

    Raises:
        BadFrame: if ``raw`` is not an object, lacks a known ``type``, or fails
            field validation for that type.
    """
    if not isinstance(raw, dict):
        raise BadFrame("frame must be a JSON object")
    frame_type = raw.get("type")
    model = _FRAME_TYPES.get(frame_type) if isinstance(frame_type, str) else None
    if model is None:
        raise BadFrame(f"unknown frame type: {frame_type!r}")
    try:
        return model.model_validate(raw)  # type: ignore[return-value]
    except ValidationError as exc:
        raise BadFrame(str(exc)) from exc
