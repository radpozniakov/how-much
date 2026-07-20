"""The room domain model and its identifier generation.

A room is identified by its ``code`` (D-29): a short, human-typeable token that
users enter to join and that is embedded in the shareable link (D-17). It doubles
as the room's system-generated unique ID (D-19); a separate WebSocket-routing id
is deferred to S6, when something actually needs it.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from uuid import uuid4

from app import config
from app.rooms.errors import RoomFull

# Unambiguous alphabet: uppercase letters + digits, minus characters that are
# easily confused when read aloud or typed (0/O, 1/I/L). Keeps join friction low.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def generate_id() -> str:
    """A participant identifier — a uuid4 as a 32-char hex string."""
    return uuid4().hex


def generate_code(length: int) -> str:
    """A random join code of ``length`` chars drawn from :data:`CODE_ALPHABET`.

    Uses :mod:`secrets` so codes aren't guessable — the only thing standing
    between a stranger and a room is the code, so it should not be predictable.
    """
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


@dataclass
class Participant:
    """Someone in a room. Identified internally by ``id`` so that duplicate
    display names (allowed — D-10) never collide."""

    name: str
    id: str = field(default_factory=generate_id)


@dataclass
class Room:
    """An estimation room. Holds its code plus the people in it; later slices add
    the current item and the round to this same object."""

    code: str
    participants: dict[str, Participant] = field(default_factory=dict)
    host_id: str | None = None

    def add_participant(self, name: str) -> Participant:
        """Add a participant and return them.

        The first participant added becomes the host — which is the creator,
        since room creation adds them first (D-32). Rejects the join once the
        room is at capacity (D-6).

        Raises:
            RoomFull: if the room already holds ``config.ROOM_CAPACITY`` people.
        """
        if len(self.participants) >= config.ROOM_CAPACITY:
            raise RoomFull(config.ROOM_CAPACITY)
        participant = Participant(name=name)
        self.participants[participant.id] = participant
        if self.host_id is None:
            self.host_id = participant.id
        return participant
