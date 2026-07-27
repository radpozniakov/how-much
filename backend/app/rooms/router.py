"""HTTP routes for rooms: create one, join one.

Both are entry points — a client has no socket until it knows which room to open
one for — which is why they fit request/response (D-5/D-38). Everything after the
handshake runs over the WebSocket; the dual-transport round routes are retired
(D-50). :mod:`app.main` translates the domain errors raised below to status codes.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from app import config
from app.rooms.connection import broadcast_room_state
from app.rooms.deck import parse_deck
from app.rooms.store import store
from app.rooms.views import RoomView, room_view

router = APIRouter(prefix="/rooms", tags=["rooms"])


class JoinRequest(BaseModel):
    """Creating or joining a room carries only a display name — no auth (D-9)."""

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


class CreateRoomRequest(JoinRequest):
    """Creating a room: a display name, plus the host's optional card values.

    The one creation-time option a room has (FR-22/D-48). ``cards`` is the raw
    comma-separated string the host typed, parsed into the canonical deck here at
    the boundary; omitted, null, or blank means the Fibonacci default.

    Join cannot have this field: the deck is fixed for the room's life, so only the
    creator ever chooses one.
    """

    cards: tuple[str, ...] = config.FIBONACCI_DECK

    @field_validator("cards", mode="before")
    @classmethod
    def _parse_cards(cls, value: object) -> object:
        if value is None:
            return config.FIBONACCI_DECK
        if not isinstance(value, str):
            raise ValueError("card values must be a comma-separated string")
        return parse_deck(value)


class JoinResponse(BaseModel):
    """The caller's own participant id plus the room they are now in."""

    participant_id: str
    room: RoomView


class CreateRoomResponse(JoinResponse):
    """A join that also hands back the shareable link for the new room."""

    link: str


@router.post("", status_code=201, response_model=CreateRoomResponse)
async def create_room(body: CreateRoomRequest) -> CreateRoomResponse:
    """Create a room and join it as the host (FR-1/FR-2a/FR-22).

    One step, so the creator is unambiguously the host and there is no
    participant-less room to race over (D-32). Also the only moment a deck is
    chosen (D-48); ``body.cards`` is already parsed and normalized.
    """
    room = store.create(deck=body.cards)
    host = room.add_participant(body.name)
    return CreateRoomResponse(
        participant_id=host.id,
        room=room_view(room),
        link=config.room_link(room.code),
    )


@router.post("/{code}/participants", status_code=201, response_model=JoinResponse)
async def join_room(code: str, body: JoinRequest) -> JoinResponse:
    """Join an existing room by code with a display name (FR-3).

    Goes through the atomic ``store.join``, the same seam the WebSocket join uses;
    ``None`` means no such room -> 404. Broadcasts the updated roster so sockets
    already in the room see the joiner appear — the only surviving HTTP mutation
    that reaches connected clients (D-36/D-50)."""
    result = store.join(code.strip().upper(), body.name)
    if result is None:
        raise HTTPException(status_code=404, detail="Room not found")
    room, participant = result
    await broadcast_room_state(room)
    return JoinResponse(participant_id=participant.id, room=room_view(room))
