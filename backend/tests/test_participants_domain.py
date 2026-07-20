"""Domain-level tests for participants, host assignment, and capacity."""

import pytest
from app import config
from app.rooms.errors import RoomFull
from app.rooms.models import Room


def _room() -> Room:
    return Room(code="ROOM01")


def test_add_participant_returns_named_participant():
    room = _room()
    alice = room.add_participant("Alice")
    assert alice.name == "Alice"
    assert room.participants[alice.id] is alice
    assert len(room.participants) == 1


def test_first_participant_becomes_host():
    room = _room()
    alice = room.add_participant("Alice")
    assert room.host_id == alice.id


def test_later_participants_are_not_host():
    room = _room()
    alice = room.add_participant("Alice")
    bob = room.add_participant("Bob")
    assert room.host_id == alice.id
    assert room.host_id != bob.id


def test_duplicate_names_coexist_with_distinct_ids():
    room = _room()
    first = room.add_participant("Sam")
    second = room.add_participant("Sam")
    assert first.id != second.id
    assert len(room.participants) == 2


def test_room_fills_to_capacity_then_rejects():
    room = _room()
    for i in range(config.ROOM_CAPACITY):
        room.add_participant(f"P{i}")
    assert len(room.participants) == config.ROOM_CAPACITY
    with pytest.raises(RoomFull):
        room.add_participant("one-too-many")
    assert len(room.participants) == config.ROOM_CAPACITY


def test_room_full_error_reports_capacity():
    err = RoomFull(30)
    assert err.capacity == 30
    assert "30" in str(err)
