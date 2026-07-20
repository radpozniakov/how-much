"""Live WebSocket registry (S6).

The ``ConnectionManager`` maps each room code to its connected sockets, keyed by
participant id. It is pure transport: it holds no domain state and never decides
who is *in* a room — that stays in ``store``/``Room``. Its only jobs are to fan a
frame out to a room's sockets and to track which socket currently represents a
participant.

Single-owner cleanup: removal of a socket from the map (and the domain leave that
follows) is done exactly once, in the connection handler's ``finally`` via
:meth:`unregister`. :meth:`broadcast` therefore never deletes a socket on send
failure — it skips it and lets that socket's own handler perform the cleanup, so
the handler's identity-checked ``unregister`` still reports ``True`` and the
domain ``leave`` runs.
"""

from __future__ import annotations

import contextlib
import logging
from collections.abc import Callable
from typing import Any

from fastapi import WebSocket

from app.rooms.messages import room_state_frame
from app.rooms.models import Room

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Per-room live sockets: ``code -> {participant_id -> socket}``."""

    def __init__(self) -> None:
        self._rooms: dict[str, dict[str, WebSocket]] = {}

    async def register(self, code: str, participant_id: str, ws: WebSocket) -> None:
        """Register ``ws`` as the socket for ``participant_id`` in ``code``.

        If the participant already has a live socket, the **new socket is written
        into the map first, then the old one is closed**. This ordering is
        load-bearing: closing first would yield the event loop while the map still
        pointed at the old socket, so the old handler's ``finally`` would see
        itself as still-registered and wrongly run the domain leave for a
        participant the new socket still represents."""
        room = self._rooms.setdefault(code, {})
        old = room.get(participant_id)
        room[participant_id] = ws  # write new first (ordering is load-bearing)
        if old is not None and old is not ws:
            # old socket already gone is fine; the map entry is what matters
            with contextlib.suppress(Exception):
                await old.close()

    def unregister(self, code: str, participant_id: str, ws: WebSocket) -> bool:
        """Remove ``participant_id``'s socket **iff it is still ``ws``**.

        Returns whether this call actually removed the socket. A superseded socket
        (replaced by a newer one for the same participant) is no longer the stored
        socket, so this is a no-op and returns ``False`` — the caller then skips
        the domain leave, leaving the participant live on the newer socket."""
        room = self._rooms.get(code)
        if room is None or room.get(participant_id) is not ws:
            return False
        del room[participant_id]
        if not room:
            del self._rooms[code]
        return True

    async def broadcast(self, code: str, frame: dict[str, Any]) -> None:
        """Send ``frame`` to every socket in ``code``. A socket that raises on
        send is skipped (its own handler will clean it up) so one broken client
        never aborts the fan-out. Other rooms are untouched."""
        room = self._rooms.get(code)
        if not room:
            return
        for participant_id, ws in list(room.items()):
            # Skip a concurrently-dropping client; do not abort the fan-out. The
            # send is logged at debug rather than swallowed silently, so a real
            # bug (e.g. a non-serializable frame failing for *every* client) is
            # visible in the logs instead of invisible.
            try:
                await ws.send_json(frame)
            except Exception:
                logger.debug(
                    "broadcast to %s in room %s failed; skipping",
                    participant_id,
                    code,
                    exc_info=True,
                )

    def has_room(self, code: str) -> bool:
        return code in self._rooms


# The single process-wide manager. Import this instance; do not construct another.
manager = ConnectionManager()


async def broadcast_room_state(room: Room) -> None:
    """Fan the current ``RoomView`` snapshot out to a room's sockets (D-36).

    The one place a state change becomes a broadcast; called at every presence
    mutation site (HTTP + WS). A no-op when the room has no connected sockets."""
    await manager.broadcast(room.code, room_state_frame(room))


async def apply_and_broadcast(room: Room, action: Callable[[], None]) -> None:
    """Run a domain mutation, then broadcast the new snapshot (D-36).

    ``action`` is a zero-arg closure over a synchronous ``Room`` method. The
    broadcast is bound to a *successful* mutation: if ``action`` raises (a domain
    ``RoomError``), it propagates and no broadcast is sent, so a rejected action
    never disturbs other clients. This single seam is used by both transports —
    the HTTP round routes and the WS receive loop — so broadcast can't be
    forgotten at a call site."""
    action()
    await broadcast_room_state(room)
