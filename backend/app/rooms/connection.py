"""Live WebSocket registry (S6).

``ConnectionManager`` maps ``code -> {participant_id -> socket}``. Pure transport:
it holds no domain state and never decides who is *in* a room.

Single-owner cleanup: a socket leaves the map exactly once, in the connection
handler's ``finally`` via :meth:`unregister`. So :meth:`broadcast` never deletes on
send failure — it skips, letting that socket's own handler do the cleanup and run
the domain leave.

:func:`apply_and_evict` (FR-21/D-47) is the one exception, and it *uses* that
property: it detaches the removed participant itself, so their handler's
``unregister`` reports ``False`` and skips a leave that already happened.
"""

from __future__ import annotations

import contextlib
import logging
from collections.abc import Callable
from typing import Any

from fastapi import WebSocket

from app.rooms.messages import removed_frame, room_state_frame
from app.rooms.models import Room

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Per-room live sockets: ``code -> {participant_id -> socket}``."""

    def __init__(self) -> None:
        self._rooms: dict[str, dict[str, WebSocket]] = {}

    async def register(self, code: str, participant_id: str, ws: WebSocket) -> None:
        """Register ``ws`` as the socket for ``participant_id`` in ``code``.

        Ordering is load-bearing: the **new socket is written first, then the old
        one closed**. Closing first would yield the event loop while the map still
        pointed at the old socket, so its handler would see itself as registered and
        wrongly run the domain leave."""
        room = self._rooms.setdefault(code, {})
        old = room.get(participant_id)
        room[participant_id] = ws
        if old is not None and old is not ws:
            with contextlib.suppress(Exception):
                await old.close()

    def detach(self, code: str, participant_id: str) -> WebSocket | None:
        """Take ``participant_id``'s socket out of the map and return it, if any.

        The identity-blind counterpart to :meth:`unregister`. Removal (FR-21/D-47)
        must cut whichever socket currently represents the target, so unlike
        ``unregister`` it does not check identity.

        Returns the socket rather than closing it, keeping this class synchronous
        and transport-only. ``None`` means no live socket — a legitimate state for
        someone who joined over HTTP and never attached."""
        room = self._rooms.get(code)
        if room is None:
            return None
        ws = room.pop(participant_id, None)
        if not room:
            del self._rooms[code]
        return ws

    def unregister(self, code: str, participant_id: str, ws: WebSocket) -> bool:
        """Remove ``participant_id``'s socket **iff it is still ``ws``**.

        Returns whether it actually removed one. A superseded socket is no longer
        the stored one, so this is a no-op returning ``False`` — the caller then
        skips the domain leave and the participant stays live on the newer socket."""
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


manager = ConnectionManager()


async def broadcast_room_state(room: Room) -> None:
    """Fan the current ``RoomView`` snapshot out to a room's sockets (D-36).

    The one place a state change becomes a broadcast, called from the WS receive
    loop and the surviving HTTP join. A no-op when nobody is connected."""
    await manager.broadcast(room.code, room_state_frame(room))


async def apply_and_broadcast(room: Room, action: Callable[[], None]) -> None:
    """Run a domain mutation, then broadcast the new snapshot (D-36).

    ``action`` is a zero-arg closure over a synchronous ``Room`` method. The
    broadcast is bound to a *successful* mutation: a raised ``RoomError``
    propagates and sends nothing, so a rejected action never disturbs other
    clients."""
    action()
    await broadcast_room_state(room)


async def apply_and_evict(
    room: Room, action: Callable[[], None], target_id: str
) -> None:
    """Run a removal, cut the removed participant's socket, then broadcast (D-47).

    The second transport seam, needed because a removal's effect exceeds "fan the
    snapshot out" and closing a socket is async, while ``apply_and_broadcast``'s
    ``action`` is synchronous by contract.

    All three steps are load-bearing in order:

    1. ``action()`` first, so a rejected removal raises before any socket is
       detached — the same guarantee ``apply_and_broadcast`` gives.
    2. ``detach`` **before** the broadcast, so the removed client never renders a
       snapshot of a room it is no longer in.
    3. Notice, then close — the frame-then-close pattern ``ws.room_socket`` already
       uses to reject a handshake, so the client's existing path is reused.

    Detaching also makes the removed socket's own ``unregister`` return ``False``,
    so its handler skips a duplicate leave and broadcast.

    Both sends are suppressed individually: a client that vanished mid-removal is
    ordinary, and a failed notice must not skip the close.
    """
    action()
    evicted = manager.detach(room.code, target_id)
    await broadcast_room_state(room)
    if evicted is None:
        return
    with contextlib.suppress(Exception):
        await evicted.send_json(removed_frame())
    with contextlib.suppress(Exception):
        await evicted.close()
