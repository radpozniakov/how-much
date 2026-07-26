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

There is exactly one exception, and it *uses* that property rather than working
around it: :func:`apply_and_evict` (FR-21/D-47) takes a removed participant's socket
out of the map itself, so their handler's ``unregister`` reports ``False`` and
correctly skips a leave for someone the host has already removed.
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

    def detach(self, code: str, participant_id: str) -> WebSocket | None:
        """Take ``participant_id``'s socket out of the map and return it, if any.

        The identity-blind counterpart to :meth:`unregister`: that one is for a
        handler retiring *its own* socket and must not touch a newer one, so it
        checks. This one is for removing a participant (FR-21/D-47), where whichever
        socket currently represents them is the one that has to go — including a
        second socket opened by the `attach` impersonation the phase accepts as a
        known limitation, since that is precisely the socket a host removing someone
        means to cut.

        Returning the socket rather than closing it keeps this class synchronous and
        transport-only: the caller decides what to say on the way out. ``None`` when
        the participant has no live socket at all — they joined over HTTP and never
        attached one, which is a legitimate state, not an error."""
        room = self._rooms.get(code)
        if room is None:
            return None
        ws = room.pop(participant_id, None)
        if not room:
            del self._rooms[code]
        return ws

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
    mutation site — the WS receive loop and, still, the HTTP join (D-50 left that
    route standing). A no-op when the room has no connected sockets."""
    await manager.broadcast(room.code, room_state_frame(room))


async def apply_and_broadcast(room: Room, action: Callable[[], None]) -> None:
    """Run a domain mutation, then broadcast the new snapshot (D-36).

    ``action`` is a zero-arg closure over a synchronous ``Room`` method. The
    broadcast is bound to a *successful* mutation: if ``action`` raises (a domain
    ``RoomError``), it propagates and no broadcast is sent, so a rejected action
    never disturbs other clients. This was the single seam shared by both
    transports, which is how it kept broadcast from being forgotten at a call
    site; since D-50 retired the HTTP round routes its only caller is the WS
    receive loop, and the guarantee is the same one for one transport."""
    action()
    await broadcast_room_state(room)


async def apply_and_evict(
    room: Room, action: Callable[[], None], target_id: str
) -> None:
    """Run a removal, cut the removed participant's socket, then broadcast (D-47).

    The second transport seam, and the reason there is one: removing a participant is
    the first action whose effect on the transport exceeds "fan the new snapshot
    out". Their socket has to go too, and ``apply_and_broadcast``'s ``action`` is
    synchronous by contract (it is a ``Room`` method) while closing a socket is not.

    The order is load-bearing, all three steps:

    1. ``action()`` first, synchronously. It raises the domain ``RoomError`` for an
       unauthorized or badly-targeted attempt, and nothing below it runs — so a
       rejected removal cannot detach an innocent socket. Same guarantee
       ``apply_and_broadcast`` gives, for the same reason.
    2. ``detach`` **before** the broadcast, so the removed client is out of the
       fan-out when it happens. Otherwise their last frame would be a snapshot of a
       room they are no longer in, which their UI would render — a header with no
       name, a grid missing its own card — for the tick before the notice lands.
       Nothing about that state is true, so it should never reach a screen.
    3. The notice, then the close. Frame-then-close is how this codebase already
       rejects a handshake (see ``ws.room_socket``), so the client's existing
       stash-the-reason-then-report-on-close path is reused rather than extended.

    Detaching also settles the teardown hazard doc/07 flagged: the removed socket's
    own handler will still reach its ``finally``, but its ``unregister`` now finds a
    different (absent) entry and returns ``False``, so it skips the domain leave for
    a participant already gone and does not emit a second, identical broadcast. That
    is the same single-owner property (MF1) that protects a superseded socket — not
    a new mechanism, an existing one lined up to point the right way.

    Both sends are individually suppressed: a client that vanished mid-removal is
    the ordinary case, not a failure, and a failed notice must not skip the close.
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
