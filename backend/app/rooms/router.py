"""HTTP routes for rooms.

Two routes only: create a room, and join one. Both are entry points — a client
has no socket until it knows which room to open one for — which is why they fit
request/response rather than the real-time socket (D-5, D-38). Everything after
the handshake runs over the WebSocket.

The round and presence routes that used to sit here were D-35's time-boxed dual
transport, kept so the domain stayed ``curl``-testable while the socket was
unproven. They were retired once the frontend had exercised the socket path for
several slices; see D-50. Domain errors raised below are translated to status
codes by the ``RoomError`` handler registered in :mod:`app.main`.
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

    The one creation-time option a room has (FR-22/D-48). It arrives as the raw
    comma-separated string the host typed, under ``cards``, and is parsed into the
    room's canonical ``deck`` here at the boundary — so a bad deck is a ``422`` on
    creation rather than a room that is already broken. Omitted, null, or blank
    means the Fibonacci default.

    Join does **not** get this field, and cannot: the deck is fixed for the room's
    life, so only the creator ever chooses one.
    """

    # Sent as the raw comma-separated string; **held as the parsed deck**, because
    # the validator below runs `mode="before"` and returns the canonical tuple. So
    # the route reads a deck rather than re-parsing one, and there is exactly one
    # place that turns host input into card values.
    cards: tuple[str, ...] = config.FIBONACCI_DECK

    @field_validator("cards", mode="before")
    @classmethod
    def _parse_cards(cls, value: object) -> object:
        # `mode="before"` so this sees the host's string rather than pydantic's
        # attempt to coerce it into a tuple. An omitted field never arrives here —
        # defaults are not validated — so the default deck is reached two ways: by
        # omission, and by `parse_deck` resolving a blank string.
        if value is None:
            return config.FIBONACCI_DECK
        if not isinstance(value, str):
            raise ValueError("card values must be a comma-separated string")
        return parse_deck(value)


class JoinResponse(BaseModel):
    """Returned from both create and join: the caller's own participant id plus
    the room they're now in."""

    participant_id: str
    room: RoomView


class CreateRoomResponse(JoinResponse):
    """A join that also hands back the shareable link for the new room."""

    link: str


@router.post("", status_code=201, response_model=CreateRoomResponse)
async def create_room(body: CreateRoomRequest) -> CreateRoomResponse:
    """Create a room and join it as the host (FR-1, FR-2a, FR-22).

    Creation and the creator's join are one step, so the creator is
    unambiguously the host (D-32) — no participant-less room to race over. It is
    also the only moment the room's deck is chosen (D-48); ``body.cards`` is
    already the parsed, normalized deck — see ``CreateRoomRequest``.
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

    Goes through the atomic ``store.join`` (the same seam the WebSocket join uses);
    a ``None`` return means no such room -> 404. The updated roster is broadcast so
    sockets already in the room see the joiner appear — after D-50 this is the only
    surviving HTTP mutation that reaches connected clients, and so the last place
    D-36's "the broadcast hangs off the domain mutation, not the transport handler"
    is observable from outside the socket."""
    result = store.join(code.strip().upper(), body.name)
    if result is None:
        raise HTTPException(status_code=404, detail="Room not found")
    room, participant = result
    await broadcast_room_state(room)
    return JoinResponse(participant_id=participant.id, room=room_view(room))
