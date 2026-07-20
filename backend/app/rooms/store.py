"""In-memory registry of rooms.

There is no database (D-4): every room lives in this process's memory and is
lost on restart. The store is a module-level singleton — honest about the fact
that room state *is* global process state — and exposes ``clear()`` so tests can
start from a clean slate.
"""

from __future__ import annotations

import time
from collections.abc import Callable

from app import config
from app.rooms.models import Room, generate_code

# Bound on collision retries when allocating a code. With ~887M possible codes a
# single retry is already astronomically unlikely; this is a safety valve, not a
# hot path.
_MAX_CODE_ATTEMPTS = 10


class RoomStore:
    """A dict of rooms keyed by join code."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._rooms: dict[str, Room] = {}
        self._clock = clock

    def create(self) -> Room:
        """Create, store, and return a new room with a unique join code.

        Raises:
            RuntimeError: if a unique code could not be allocated within the
                retry budget (effectively unreachable in practice).
        """
        self.sweep()
        for _ in range(_MAX_CODE_ATTEMPTS):
            code = generate_code(config.ROOM_CODE_LENGTH)
            if code not in self._rooms:
                room = Room(code=code)
                self._rooms[code] = room
                return room
        raise RuntimeError("could not allocate a unique room code")

    def get(self, code: str) -> Room | None:
        """Return the room for ``code``, or ``None`` if there is no such room."""
        self.sweep()
        return self._rooms.get(code)

    def leave(self, room: Room, participant_id: str) -> None:
        """Remove a participant and, if it was the last one, start the empty-room
        grace timer (D-18). Coordinates the room's membership with the store's
        clock — the room owns who's present, the store owns when it's discarded."""
        room.remove_participant(participant_id)
        if not room.participants:
            room.empty_since = self._clock()

    def sweep(self) -> None:
        """Discard rooms empty for at least ``EMPTY_ROOM_TTL_SECONDS`` (D-18/FR-6).

        Lazy, not scheduled: we're HTTP-only until S6, so cleanup piggybacks on
        the next store access (`get`/`create`) rather than a background task.
        A rejoin clears `empty_since` (see `Room.add_participant`), so a
        re-occupied room is never swept.

        Total-quiescence retention is by design and does not violate FR-6: an
        abandoned room's memory is reclaimed on the NEXT store access after the
        TTL, not at exactly the TTL. This defers *reclamation* only, never
        *liveness* — `get()` sweeps before returning, so the instant grace
        passes the room is unreachable (a lookup 404s and drops it). A process
        with zero traffic holds one dead room until the next request; that is the
        explicit FR-6 reading, not a leak."""
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


# The single process-wide store. Import this instance; do not construct another.
store = RoomStore()
