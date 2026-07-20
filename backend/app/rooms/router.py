"""HTTP routes for rooms.

Room creation is the one action that fits request/response rather than the
real-time socket (D-5), so it lives here. Joining and all round actions move
onto the WebSocket in S6.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app import config
from app.rooms.store import store

router = APIRouter(prefix="/rooms", tags=["rooms"])


class CreateRoomResponse(BaseModel):
    """Everything a creator needs to share a room: its identity, the code others
    type to join, and the ready-to-share link."""

    id: str
    code: str
    link: str


@router.post("", status_code=201, response_model=CreateRoomResponse)
async def create_room() -> CreateRoomResponse:
    """Create a fresh room and return its code + shareable link (FR-1, FR-2a)."""
    room = store.create()
    return CreateRoomResponse(
        id=room.id,
        code=room.code,
        link=config.room_link(room.code),
    )
