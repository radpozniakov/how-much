"""Real-time room presence and round actions over WebSocket (S6).

One endpoint, ``/ws/rooms/{code}``, wraps the S1-S5 domain in live delivery:
connect, identify (a new ``join`` or an existing ``attach``), appear to everyone
via a broadcast, then run a full estimation round in real time — ``set_item``,
``cast_vote``, ``set_host_voting``, ``reveal``, ``reset`` frames dispatch to the
matching ``Room`` method and rebroadcast the new snapshot (S6b). The moment the
socket drops, it leaves through the same S5 ``store.leave`` path (drop
participant + vote, host auto-transfer per D-13, empty-room grace per D-18) and
rebroadcasts.

The domain stays the single source of truth (D-36): this module only calls into
``store``/``Room`` and fans out the resulting ``RoomView`` snapshot. A round frame
carries no ``participant_id`` — the handler attributes the action to the socket's
own identity, established at handshake, so a client can't act as anyone else. A
rejected action (a domain ``RoomError``) returns an ``error`` frame to the
offending socket only; every other client is untouched.
"""

from __future__ import annotations

import contextlib
import functools
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.rooms.connection import apply_and_broadcast, broadcast_room_state, manager
from app.rooms.errors import RoomError, RoomFull, UnknownParticipant
from app.rooms.messages import (
    BadFrame,
    CastVoteFrame,
    JoinFrame,
    ResetFrame,
    RevealFrame,
    RoundFrame,
    SetHostVotingFrame,
    SetItemFrame,
    error_frame,
    parse_handshake_frame,
    parse_round_frame,
    room_error_reason,
)
from app.rooms.models import Room
from app.rooms.store import store

ws_router = APIRouter()


def _apply_round(room: Room, participant_id: str, frame: RoundFrame) -> None:
    """Apply a validated round frame to the domain (S6b).

    Frames carry no ``participant_id`` — the caller passes the socket's own
    identity, so a client can only act as itself. Synchronous, like every ``Room``
    method; a rejected action raises the domain ``RoomError``, which the loop turns
    into an ``error`` frame for the sender alone."""
    if isinstance(frame, SetItemFrame):
        room.set_item(participant_id, frame.topic)
    elif isinstance(frame, CastVoteFrame):
        room.cast_vote(participant_id, frame.card)
    elif isinstance(frame, SetHostVotingFrame):
        room.set_host_voting(participant_id, frame.voting)
    elif isinstance(frame, RevealFrame):
        room.reveal(participant_id)
    elif isinstance(frame, ResetFrame):
        room.reset_round(participant_id)
    else:  # unreachable: parse_round_frame only yields the five frames above
        raise AssertionError(f"unhandled round frame: {frame!r}")


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
        frame = parse_handshake_frame(raw)
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
        # Round-action loop. Each frame mutates the domain and rebroadcasts the
        # new snapshot; a bad frame is answered without dropping the socket, and a
        # WebSocketDisconnect propagates to the finally below (the leave path).
        while True:
            try:
                frame = parse_round_frame(await websocket.receive_json())
            except (json.JSONDecodeError, BadFrame) as exc:
                # A malformed or unrecognised frame (including a stray handshake
                # frame) is answered but does not disconnect a live client.
                await websocket.send_json(error_frame("bad_request", str(exc)))
                continue

            # Re-resolve each action: a connected room can't be swept, but an HTTP
            # DELETE of the last participant can leave this socket open on a room
            # the sweeper later reclaims — guard against dispatching on None.
            room = store.get(code)
            if room is None:
                await websocket.send_json(
                    error_frame("room_not_found", "Room not found")
                )
                continue

            # Dispatch to the domain using THIS socket's identity (frames carry no
            # participant_id). apply_and_broadcast fans out only on success; a
            # domain error goes back to this socket alone.
            try:
                await apply_and_broadcast(
                    room, functools.partial(_apply_round, room, participant_id, frame)
                )
            except RoomError as exc:
                await websocket.send_json(error_frame(room_error_reason(exc), str(exc)))
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
