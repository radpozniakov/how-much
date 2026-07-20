"""The room domain model and its identifier generation.

A room has two identifiers (D-29):
  * ``id``   — an opaque uuid4 hex string; the canonical, non-guessable identity
               used internally and, later, for WebSocket routing (D-19).
  * ``code`` — a short, human-typeable token users enter to join, and the token
               embedded in the shareable link (D-17).
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from uuid import uuid4

# Unambiguous alphabet: uppercase letters + digits, minus characters that are
# easily confused when read aloud or typed (0/O, 1/I/L). Keeps join friction low.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def generate_id() -> str:
    """Canonical room identity — a uuid4 as a 32-char hex string."""
    return uuid4().hex


def generate_code(length: int) -> str:
    """A random join code of ``length`` chars drawn from :data:`CODE_ALPHABET`.

    Uses :mod:`secrets` so codes aren't guessable — the only thing standing
    between a stranger and a room is the code, so it should not be predictable.
    """
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


@dataclass
class Room:
    """An estimation room. In S1 it is just its identity; later slices add
    participants, the current item, and the round to this same object."""

    code: str
    id: str = field(default_factory=generate_id)
