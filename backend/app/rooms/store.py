"""In-memory registry of rooms.

There is no database (D-4): every room lives in this process's memory and is
lost on restart. The store is a module-level singleton — honest about the fact
that room state *is* global process state — and exposes ``clear()`` so tests can
start from a clean slate.
"""

from __future__ import annotations

from app import config
from app.rooms.models import Room, generate_code

# Bound on collision retries when allocating a code. With ~887M possible codes a
# single retry is already astronomically unlikely; this is a safety valve, not a
# hot path.
_MAX_CODE_ATTEMPTS = 10


class RoomStore:
    """A dict of rooms keyed by join code."""

    def __init__(self) -> None:
        self._rooms: dict[str, Room] = {}

    def create(self) -> Room:
        """Create, store, and return a new room with a unique join code.

        Raises:
            RuntimeError: if a unique code could not be allocated within the
                retry budget (effectively unreachable in practice).
        """
        for _ in range(_MAX_CODE_ATTEMPTS):
            code = generate_code(config.ROOM_CODE_LENGTH)
            if code not in self._rooms:
                room = Room(code=code)
                self._rooms[code] = room
                return room
        raise RuntimeError("could not allocate a unique room code")

    def get(self, code: str) -> Room | None:
        """Return the room for ``code``, or ``None`` if there is no such room."""
        return self._rooms.get(code)

    def __contains__(self, code: object) -> bool:
        return code in self._rooms

    def __len__(self) -> int:
        return len(self._rooms)

    def clear(self) -> None:
        """Drop all rooms. Intended for tests."""
        self._rooms.clear()


# The single process-wide store. Import this instance; do not construct another.
store = RoomStore()
