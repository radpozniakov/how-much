"""HTTP routes for rooms.

Room creation is the one action that fits request/response rather than the
real-time socket (D-5), so it lives here. Joining and all round actions move
onto the WebSocket in S6.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from app import config
from app.rooms.errors import RoomFull
from app.rooms.models import Room
from app.rooms.store import store

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


class ParticipantView(BaseModel):
    id: str
    name: str


class RoomView(BaseModel):
    """The shape every client sees: who's here and who's the host. Grows with the
    round in later slices; over the socket (S6) this is what gets broadcast."""

    code: str
    host_id: str | None
    participants: list[ParticipantView]


class JoinResponse(BaseModel):
    """Returned from both create and join: the caller's own participant id plus
    the room they're now in."""

    participant_id: str
    room: RoomView


class CreateRoomResponse(JoinResponse):
    """A join that also hands back the shareable link for the new room."""

    link: str


def _room_view(room: Room) -> RoomView:
    return RoomView(
        code=room.code,
        host_id=room.host_id,
        participants=[
            ParticipantView(id=p.id, name=p.name) for p in room.participants.values()
        ],
    )


@router.post("", status_code=201, response_model=CreateRoomResponse)
async def create_room(body: JoinRequest) -> CreateRoomResponse:
    """Create a room and join it as the host (FR-1, FR-2a).

    Creation and the creator's join are one step, so the creator is
    unambiguously the host (D-32) — no participant-less room to race over.
    """
    room = store.create()
    host = room.add_participant(body.name)
    return CreateRoomResponse(
        participant_id=host.id,
        room=_room_view(room),
        link=config.room_link(room.code),
    )


@router.post("/{code}/participants", status_code=201, response_model=JoinResponse)
async def join_room(code: str, body: JoinRequest) -> JoinResponse:
    """Join an existing room by code with a display name (FR-3)."""
    # Codes are generated uppercase; accept any casing the user types (D-17).
    room = store.get(code.strip().upper())
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    try:
        participant = room.add_participant(body.name)
    except RoomFull as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return JoinResponse(participant_id=participant.id, room=_room_view(room))
