"""Real-time room presence and round actions over WebSocket (S6).

One endpoint, ``/ws/rooms/{code}``: connect, identify (``join`` or ``attach``),
broadcast, then run a round in real time — each frame dispatches to the matching
``Room`` method and rebroadcasts the snapshot. On disconnect it leaves through
``store.leave`` (D-13/D-18) and rebroadcasts.

The domain stays the single source of truth (D-36). Round frames carry no
``participant_id``: the handler uses the socket's handshake identity, so a client
cannot act as anyone else. A rejected action returns an ``error`` frame to the
offending socket only.

``transfer_host`` (FR-20/D-45) and ``remove_participant`` (FR-21/D-47) are the
room-control pair — the only actions a ``reset`` does not undo, so both log either
outcome (see ``_logged``). Removal also closes the target's socket, so it alone
goes through ``apply_and_evict`` rather than ``_apply_round``.
"""

from __future__ import annotations

import contextlib
import functools
import json
import logging
from collections.abc import Callable

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.rooms.connection import (
    apply_and_broadcast,
    apply_and_evict,
    broadcast_room_state,
    manager,
)
from app.rooms.errors import RoomError, RoomFull, UnknownParticipant
from app.rooms.messages import (
    BadFrame,
    CastVoteFrame,
    JoinFrame,
    RemoveParticipantFrame,
    ResetFrame,
    RevealFrame,
    RoundFrame,
    SetHostVotingFrame,
    SetItemFrame,
    SetNameFrame,
    TransferHostFrame,
    error_frame,
    parse_handshake_frame,
    parse_round_frame,
    room_error_reason,
)
from app.rooms.models import Room
from app.rooms.store import store

ws_router = APIRouter()

logger = logging.getLogger(__name__)


def _logged(
    label: str, room: Room, actor_id: str, target_id: str, action: Callable[[], None]
) -> None:
    """Apply a host-on-participant action and log its outcome, either way.

    Here rather than in the domain: this is the one point holding all four fields
    (actor, target, room, outcome), and it keeps ``models.py`` logger-free. Wrapped
    rather than logged at the shared ``except RoomError`` in the receive loop, which
    would need an isinstance check on both branches.
    """
    try:
        action()
    except RoomError as exc:
        logger.info(
            "%s rejected: room=%s actor=%s target=%s reason=%s",
            label,
            room.code,
            actor_id,
            target_id,
            type(exc).__name__,
        )
        raise
    logger.info(
        "%s: room=%s actor=%s target=%s outcome=ok",
        label,
        room.code,
        actor_id,
        target_id,
    )


def _transfer_host(room: Room, actor_id: str, target_id: str) -> None:
    """A logged handover (FR-20/D-45)."""
    _logged(
        "host handover",
        room,
        actor_id,
        target_id,
        functools.partial(room.transfer_host, actor_id, target_id),
    )


def _remove_participant(room: Room, actor_id: str, target_id: str) -> None:
    """The synchronous half of a logged removal (FR-21/D-47) — guard, drop, record.

    ``apply_and_evict`` owns the other half (cut the socket, say why). Split on the
    sync/async line so this can raise *before* anything is detached.
    """
    _logged(
        "participant removal",
        room,
        actor_id,
        target_id,
        functools.partial(room.remove_participant_by_host, actor_id, target_id),
    )


def _apply_round(room: Room, participant_id: str, frame: RoundFrame) -> None:
    """Apply a validated round frame to the domain (S6b).

    ``participant_id`` is the socket's own identity, so a client can only act as
    itself. Synchronous, like every ``Room`` method.

    Handles seven of the eight round frames — and *because* of that synchronous
    contract, not in spite of it: ``remove_participant`` must close a socket, so the
    receive loop routes it through ``apply_and_evict``. Reaching it here is a
    routing bug, which the final ``AssertionError`` guards."""
    if isinstance(frame, SetItemFrame):
        room.set_item(participant_id, frame.topic)
    elif isinstance(frame, SetNameFrame):
        room.set_name(participant_id, frame.name)
    elif isinstance(frame, CastVoteFrame):
        room.cast_vote(participant_id, frame.card)
    elif isinstance(frame, SetHostVotingFrame):
        room.set_host_voting(participant_id, frame.voting)
    elif isinstance(frame, TransferHostFrame):
        _transfer_host(room, participant_id, frame.target_id)
    elif isinstance(frame, RevealFrame):
        room.reveal(participant_id)
    elif isinstance(frame, ResetFrame):
        room.reset_round(participant_id)
    else:
        raise AssertionError(f"unhandled round frame: {frame!r}")


@ws_router.websocket("/ws/rooms/{code}")
async def room_socket(websocket: WebSocket, code: str) -> None:
    """Presence socket for a room. See module docstring for the lifecycle."""
    await websocket.accept()
    code = code.strip().upper()

    try:
        raw = await websocket.receive_json()
    except WebSocketDisconnect:
        return
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
    else:
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

    await manager.register(code, participant_id, websocket)
    try:
        await broadcast_room_state(room)
        while True:
            try:
                frame = parse_round_frame(await websocket.receive_json())
            except (json.JSONDecodeError, BadFrame) as exc:
                await websocket.send_json(error_frame("bad_request", str(exc)))
                continue

            room = store.get(code)
            if room is None:
                await websocket.send_json(
                    error_frame("room_not_found", "Room not found")
                )
                continue

            try:
                if isinstance(frame, RemoveParticipantFrame):
                    await apply_and_evict(
                        room,
                        functools.partial(
                            _remove_participant,
                            room,
                            participant_id,
                            frame.target_id,
                        ),
                        frame.target_id,
                    )
                else:
                    await apply_and_broadcast(
                        room,
                        functools.partial(_apply_round, room, participant_id, frame),
                    )
            except RoomError as exc:
                await websocket.send_json(error_frame(room_error_reason(exc), str(exc)))
    except WebSocketDisconnect:
        pass
    finally:
        if manager.unregister(code, participant_id, websocket):
            room = store.get(code)
            if room is not None:
                with contextlib.suppress(UnknownParticipant):
                    store.leave(room, participant_id)
                await broadcast_room_state(room)
