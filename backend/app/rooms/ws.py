"""Real-time room presence over WebSocket (S6a).

One endpoint, ``/ws/rooms/{code}``, wraps the S1-S5 domain in live delivery:
connect, identify (a new ``join`` or an existing ``attach``), appear to everyone
via a broadcast, and — the moment the socket drops — leave through the same S5
``store.leave`` path (drop participant + vote, host auto-transfer per D-13,
empty-room grace per D-18) and rebroadcast. Round actions arrive in S6b.

The domain stays the single source of truth (D-36): this module only calls into
``store``/``Room`` and fans out the resulting ``RoomView`` snapshot.
"""

from __future__ import annotations

import contextlib

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.rooms.connection import broadcast_room_state, manager
from app.rooms.errors import RoomFull, UnknownParticipant
from app.rooms.messages import (
    BadFrame,
    JoinFrame,
    error_frame,
    parse_client_frame,
)
from app.rooms.store import store

ws_router = APIRouter()


@ws_router.websocket("/ws/rooms/{code}")
async def room_socket(websocket: WebSocket, code: str) -> None:
    """Presence socket for a room. See module docstring for the lifecycle."""
    await websocket.accept()
    code = code.strip().upper()  # codes are generated uppercase (D-17)

    # --- Handshake: the first frame identifies the client. ---
    try:
        raw = await websocket.receive_json()
    except WebSocketDisconnect:
        return  # dropped before identifying — nothing registered, nothing to do
    except Exception:
        await websocket.send_json(error_frame("bad_request", "expected a JSON frame"))
        await websocket.close()
        return

    try:
        frame = parse_client_frame(raw)
    except BadFrame as exc:
        await websocket.send_json(error_frame("bad_request", str(exc)))
        await websocket.close()
        return

    # Resolve the room and mutate in one synchronous block — no ``await`` between
    # lookup and mutation, so the background sweeper can't discard the room here.
    if isinstance(frame, JoinFrame):
        try:
            result = store.join(code, frame.name)
        except RoomFull as exc:
            await websocket.send_json(error_frame("room_full", str(exc)))
            await websocket.close()
            return
        if result is None:
            await websocket.send_json(error_frame("room_not_found", "Room not found"))
            await websocket.close()
            return
        room, participant = result
        participant_id = participant.id
    else:  # AttachFrame — an already-known participant (creator or HTTP joiner)
        room = store.get(code)
        if room is None:
            await websocket.send_json(error_frame("room_not_found", "Room not found"))
            await websocket.close()
            return
        if frame.participant_id not in room.participants:
            await websocket.send_json(
                error_frame("not_in_room", "Participant is not in this room")
            )
            await websocket.close()
            return
        participant_id = frame.participant_id

    # Register before broadcasting so the joiner receives its own snapshot too.
    await manager.register(code, participant_id, websocket)
    try:
        await broadcast_room_state(room)  # join/attach fan-out (FR-17)
        # S6a has no further inbound messages (round actions are S6b). Any frame
        # here is unexpected; answer and stay connected. The loop's real job is to
        # detect the disconnect that triggers the leave.
        while True:
            await websocket.receive_text()
            await websocket.send_json(
                error_frame("unsupported", "no round actions until S6b")
            )
    except WebSocketDisconnect:
        pass
    finally:
        # Only the currently-registered socket owns the leave. A socket superseded
        # by a newer one for the same participant gets False here and does nothing,
        # so it can't remove a participant the newer socket still represents (MF1).
        if manager.unregister(code, participant_id, websocket):
            room = store.get(code)
            if room is not None:
                # already removed (e.g. an HTTP DELETE for the same pid) is fine
                with contextlib.suppress(UnknownParticipant):
                    store.leave(room, participant_id)
                await broadcast_room_state(room)  # leave fan-out (FR-17)
