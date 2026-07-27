"""In-memory registry of rooms.

No database (D-4): rooms live in this process and are lost on restart. A
module-level singleton, because room state *is* global process state; ``clear()``
exists so tests start clean.
"""

from __future__ import annotations

import time
from collections.abc import Callable

from app import config
from app.rooms.models import Participant, Room, generate_code

_MAX_CODE_ATTEMPTS = 10


class RoomStore:
    """A dict of rooms keyed by join code."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._rooms: dict[str, Room] = {}
        self._clock = clock

    def create(self, deck: tuple[str, ...] = config.FIBONACCI_DECK) -> Room:
        """Create, store, and return a new room with a unique join code.

        ``deck`` arrives already parsed and normalized from the create boundary
        (FR-22/D-48). A deck is fixed at creation, so this is the only place it is
        ever set.

        Raises:
            RuntimeError: if a unique code could not be allocated within the
                retry budget (effectively unreachable in practice).
        """
        self.sweep()
        for _ in range(_MAX_CODE_ATTEMPTS):
            code = generate_code(config.ROOM_CODE_LENGTH)
            if code not in self._rooms:
                room = Room(code=code, deck=deck)
                self._rooms[code] = room
                return room
        raise RuntimeError("could not allocate a unique room code")

    def get(self, code: str) -> Room | None:
        """Return the room for ``code``, or ``None`` if there is no such room."""
        self.sweep()
        return self._rooms.get(code)

    def join(self, code: str, name: str) -> tuple[Room, Participant] | None:
        """Resolve a room and add a participant in one synchronous step.

        Returns the room and new participant, or ``None`` if there is no such room.
        Propagates ``RoomFull`` at capacity (D-6).

        The resolve-then-mutate seam shared by the HTTP join route and the WS
        ``join`` handshake. Deliberately synchronous: with no ``await`` between
        lookup and mutation, the background sweeper cannot discard the room
        mid-join."""
        room = self.get(code)
        if room is None:
            return None
        participant = room.add_participant(name)
        return room, participant

    def leave(self, room: Room, participant_id: str) -> None:
        """Remove a participant and, if they were the last, start the empty-room
        grace timer (D-18). The room owns who is present; the store owns when it is
        discarded."""
        room.remove_participant(participant_id)
        if not room.participants:
            room.empty_since = self._clock()

    def sweep(self) -> None:
        """Discard rooms empty for at least ``EMPTY_ROOM_TTL_SECONDS`` (D-18/FR-6).

        Called both on store access (`get`/`create`) and by the background sweeper
        (`main._sweeper`), so an expired room is unreachable the instant grace
        passes even between scheduled sweeps; memory is reclaimed on that access
        rather than exactly at the TTL. A rejoin clears `empty_since`."""
        now = self._clock()
        expired = [
            code
            for code, room in self._rooms.items()
            if room.empty_since is not None
            and now - room.empty_since >= config.EMPTY_ROOM_TTL_SECONDS
        ]
        for code in expired:
            del self._rooms[code]

    def __contains__(self, code: object) -> bool:
        return code in self._rooms

    def __len__(self) -> int:
        return len(self._rooms)

    def clear(self) -> None:
        """Drop all rooms. Intended for tests."""
        self._rooms.clear()


store = RoomStore()
