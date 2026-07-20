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
from app.rooms.models import Participant, Room, generate_code

# Bound on collision retries when allocating a code — a safety valve, given
# collisions over the ~887M code space are already astronomically unlikely.
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

    def join(self, code: str, name: str) -> tuple[Room, Participant] | None:
        """Resolve a room and add a participant in one synchronous step.

        Returns the room plus the new participant, or ``None`` if there is no such
        room (including one just discarded by the ``get`` sweep). Propagates
        ``RoomFull`` from :meth:`Room.add_participant` at capacity (D-6).

        This is the single resolve-then-mutate seam shared by the HTTP join route
        and the WebSocket ``join`` handshake. It is deliberately synchronous with
        no ``await`` between the lookup and the mutation, so a concurrent
        background sweep (S6) — which can only run at an ``await`` point on the
        same event loop — cannot discard the room mid-join."""
        room = self.get(code)
        if room is None:
            return None
        participant = room.add_participant(name)
        return room, participant

    def leave(self, room: Room, participant_id: str) -> None:
        """Remove a participant and, if it was the last one, start the empty-room
        grace timer (D-18). Coordinates the room's membership with the store's
        clock — the room owns who's present, the store owns when it's discarded."""
        room.remove_participant(participant_id)
        if not room.participants:
            room.empty_since = self._clock()

    def sweep(self) -> None:
        """Discard rooms empty for at least ``EMPTY_ROOM_TTL_SECONDS`` (D-18/FR-6).

        Lazy, not scheduled: cleanup piggybacks on store access (`get`/`create`)
        rather than a background task while we're HTTP-only (until S6). `get()`
        sweeps before returning, so an expired room is unreachable the instant
        grace passes; its memory is reclaimed on that next access, not at exactly
        the TTL. A rejoin clears `empty_since`, so a re-occupied room is spared."""
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
