"""Domain-level tests for S5: leave, host transfer & empty-room cleanup.

Exercises :class:`Room.remove_participant` and :class:`RoomStore`'s sweep/clock
directly (no HTTP), so the leave/transfer rules and the grace-timer math are
validated independently of any transport (S6). Cleanup timing runs against an
injected fake clock so the tests are deterministic and instant — no real sleep.
"""

import pytest
from app import config
from app.rooms.errors import UnknownParticipant
from app.rooms.models import Room, RoundResults
from app.rooms.store import RoomStore


class FakeClock:
    def __init__(self, t: float = 0.0) -> None:
        self.t = t

    def __call__(self) -> float:
        return self.t

    def advance(self, dt: float) -> None:
        self.t += dt


def _room_with(*names: str) -> tuple[Room, list[str]]:
    """A room whose first member is the host; returns the room and the ids."""
    room = Room(code="ROOM01")
    ids = [room.add_participant(n).id for n in (names or ("Host",))]
    return room, ids


# --- remove / host transfer (Room, direct) ----------------------------------


def test_leave_removes_participant_and_drops_vote():
    room, (host, alice) = _room_with("Host", "Alice")
    room.cast_vote(alice, "5")
    room.remove_participant(alice)
    assert alice not in room.participants
    assert alice not in room.votes


def test_leave_unknown_participant_raises():
    room, (host,) = _room_with("Host")
    with pytest.raises(UnknownParticipant):
        room.remove_participant("ghost-id")


def test_double_leave_raises():
    room, (host, alice) = _room_with("Host", "Alice")
    room.remove_participant(alice)
    with pytest.raises(UnknownParticipant):
        room.remove_participant(alice)


def test_non_host_leave_keeps_host():
    room, (host, alice) = _room_with("Host", "Alice")
    room.remove_participant(alice)
    assert room.host_id == host


def test_host_leaving_promotes_oldest_remaining():
    room, (host, second, third) = _room_with("Host", "Second", "Third")
    room.remove_participant(host)
    assert room.host_id == second


def test_last_participant_leaving_clears_host():
    room, (host,) = _room_with("Host")
    room.remove_participant(host)
    assert room.host_id is None
    assert room.participants == {}


def test_host_transfer_resets_host_voting():
    room, (host, alice) = _room_with("Host", "Alice")
    room.set_host_voting(host, False)
    room.remove_participant(host)
    assert room.host_voting is True


def test_leave_mid_reveal_flips_consensus():
    room, (host, alice, bob) = _room_with("Host", "Alice", "Bob")
    room.cast_vote(host, "5")
    room.cast_vote(alice, "5")
    room.cast_vote(bob, "8")
    room.reveal(host)
    assert room.results().consensus is False
    room.remove_participant(bob)
    results = room.results()
    assert results.votes == {host: "5", alice: "5"}
    assert results.average == 5.0
    assert results.consensus is True


def test_leave_mid_reveal_empties_revealed_round():
    room, (host, alice) = _room_with("Host", "Alice")
    room.cast_vote(alice, "5")
    room.reveal(host)
    room.remove_participant(alice)
    assert room.revealed is True
    assert room.votes == {}
    assert room.results() == RoundResults(votes={}, average=None, consensus=False)


def test_rejoin_clears_empty_since():
    room, (host,) = _room_with("Host")
    room.empty_since = 123.0
    room.add_participant("X")
    assert room.empty_since is None


# --- cleanup timer / sweep (fresh RoomStore(clock=FakeClock())) --------------


def test_empty_room_swept_after_ttl():
    clock = FakeClock()
    store = RoomStore(clock=clock)
    room = store.create()
    host = room.add_participant("Host").id
    store.leave(room, host)  # stamps empty_since = 0
    clock.advance(60)
    store.sweep()
    assert len(store) == 0


def test_empty_room_survives_before_ttl():
    clock = FakeClock()
    store = RoomStore(clock=clock)
    room = store.create()
    host = room.add_participant("Host").id
    store.leave(room, host)
    clock.advance(59)
    store.sweep()
    assert len(store) == 1


def test_ttl_boundary_is_inclusive():
    clock = FakeClock()
    store = RoomStore(clock=clock)
    room = store.create()
    host = room.add_participant("Host").id
    store.leave(room, host)
    clock.advance(config.EMPTY_ROOM_TTL_SECONDS)
    store.sweep()
    assert len(store) == 0


def test_reoccupancy_cancels_cleanup():
    clock = FakeClock()
    store = RoomStore(clock=clock)
    room = store.create()
    host = room.add_participant("Host").id
    store.leave(room, host)
    clock.advance(30)
    room.add_participant("Rejoiner")
    clock.advance(config.EMPTY_ROOM_TTL_SECONDS)
    store.sweep()
    assert len(store) == 1


def test_occupied_room_never_swept():
    clock = FakeClock()
    store = RoomStore(clock=clock)
    room = store.create()
    room.add_participant("Host")  # occupied -> empty_since stays None
    clock.advance(config.EMPTY_ROOM_TTL_SECONDS * 10)
    store.sweep()
    assert len(store) == 1


def test_get_triggers_sweep():
    clock = FakeClock()
    store = RoomStore(clock=clock)
    room = store.create()
    host = room.add_participant("Host").id
    store.leave(room, host)
    clock.advance(config.EMPTY_ROOM_TTL_SECONDS)
    assert store.get("ANY000") is None  # get sweeps before returning
    assert len(store) == 0


def test_create_triggers_sweep():
    clock = FakeClock()
    store = RoomStore(clock=clock)
    expired = store.create()
    host = expired.add_participant("Host").id
    store.leave(expired, host)
    clock.advance(config.EMPTY_ROOM_TTL_SECONDS)
    store.create()  # sweeps the expired room while allocating the new one
    assert expired.code not in store
    assert len(store) == 1


def test_sweep_keeps_multiple_live_rooms():
    clock = FakeClock()
    store = RoomStore(clock=clock)
    live = store.create()
    live.add_participant("Host")
    empty = store.create()
    empty_host = empty.add_participant("Host").id
    store.leave(empty, empty_host)
    clock.advance(config.EMPTY_ROOM_TTL_SECONDS)
    store.sweep()
    assert live.code in store
    assert empty.code not in store
    assert len(store) == 1
