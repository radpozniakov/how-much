"""Domain-level tests for self-service rename: Room.set_name.

Renaming mutates a participant's display name in place; the id (the collision-free
key, D-10) is untouched, and duplicate names stay allowed. Trimming/length are a
transport concern, so the domain trusts the passed name (parity with
add_participant) — the WS-level bounds live in test_ws_rounds.py.
"""

import pytest
from app.rooms.errors import UnknownParticipant
from app.rooms.models import Room


def test_set_name_changes_name_keeps_id():
    room = Room(code="ABCDEF")
    p = room.add_participant("Alice")

    room.set_name(p.id, "Alicia")

    assert room.participants[p.id].name == "Alicia"
    assert room.participants[p.id].id == p.id  # id is stable across a rename


def test_set_name_unknown_participant_raises():
    room = Room(code="ABCDEF")
    room.add_participant("Alice")

    with pytest.raises(UnknownParticipant):
        room.set_name("not-a-real-id", "Bob")


def test_set_name_allows_duplicate_names():
    """Names are non-unique by design (D-10); renaming onto another's name is fine."""
    room = Room(code="ABCDEF")
    alice = room.add_participant("Alice")
    bob = room.add_participant("Bob")

    room.set_name(bob.id, "Alice")

    assert room.participants[alice.id].name == "Alice"
    assert room.participants[bob.id].name == "Alice"
    assert alice.id != bob.id  # distinct ids despite identical names
