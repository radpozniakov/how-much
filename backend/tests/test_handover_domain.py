"""Domain tests for deliberate host handover: Room.transfer_host (FR-20/D-45).

Its own file because this is authority, not membership (test_participants_domain)
and not a lifecycle consequence of a leave (test_lifecycle_domain).

Every test says **handover**, never bare "transfer", to keep it distinct from the
D-13 disconnect path: the same effect reached by a different trigger, and only this
one passes through ``_require_host``.
"""

import pytest
from app.rooms.errors import (
    CannotTargetSelf,
    NotHost,
    RoundRevealed,
    UnknownParticipant,
)
from app.rooms.models import Room


def _room_with(*names: str) -> tuple[Room, list[str]]:
    """A room whose first member is the host; returns the room and the ids."""
    room = Room(code="ROOM01")
    ids = [room.add_participant(n).id for n in (names or ("Host",))]
    return room, ids


def test_handover_moves_host_and_never_nulls_host_id():
    """Contrast D-13: a deliberate handover has no transient unowned window."""
    room, (host, alice) = _room_with("Host", "Alice")

    room.transfer_host(host, alice)

    assert room.host_id == alice
    assert room.host_id is not None


def test_handover_resets_host_voting_to_true():
    """The incoming host must not inherit an opt-out they never chose."""
    room, (host, alice) = _room_with("Host", "Alice")
    room.set_host_voting(host, False)

    room.transfer_host(host, alice)

    assert room.host_voting is True


def test_outgoing_host_may_vote_after_handover():
    """cast_vote's guard keys on who is host *now*, so the outgoing host stops
    matching it — asserted rather than trusted."""
    room, (host, alice) = _room_with("Host", "Alice")
    room.set_host_voting(host, False)

    room.transfer_host(host, alice)
    room.cast_vote(host, "5")

    assert room.votes[host] == "5"


def test_handover_keeps_outgoing_hosts_vote():
    """Nothing is popped: they stay a member, and results() covers cast votes."""
    room, (host, alice) = _room_with("Host", "Alice")
    room.cast_vote(host, "8")

    room.transfer_host(host, alice)

    assert room.votes[host] == "8"


def test_handover_rejects_non_host():
    room, (host, alice, bob) = _room_with("Host", "Alice", "Bob")

    with pytest.raises(NotHost):
        room.transfer_host(alice, bob)

    assert room.host_id == host


def test_handover_rejects_self_target():
    room, (host, alice) = _room_with("Host", "Alice")

    with pytest.raises(CannotTargetSelf):
        room.transfer_host(host, host)

    assert room.host_id == host


def test_handover_rejects_unknown_target():
    room, (host, alice) = _room_with("Host", "Alice")

    with pytest.raises(UnknownParticipant):
        room.transfer_host(host, "not-a-real-id")

    assert room.host_id == host


def test_handover_legal_after_reveal():
    """A handover touches no input to results(), so it is not locked. The invariance
    assertion is the load-bearing half — "did not raise" is not enough."""
    room, (host, alice, bob) = _room_with("Host", "Alice", "Bob")
    room.cast_vote(host, "5")
    room.cast_vote(alice, "5")
    room.cast_vote(bob, "8")
    room.reveal(host)
    before = room.results()

    room.transfer_host(host, alice)

    after = room.results()
    assert after.votes == before.votes
    assert after.average == before.average
    assert after.consensus == before.consensus


def test_handover_after_reveal_grows_voter_roster():
    """The post-reveal denominator change is *intended*: host_voting flips back on
    so the ex-host rejoins the voter set, while results stay identical. Pinned so a
    later reader does not "fix" it."""
    room, (host, alice) = _room_with("Host", "Alice")
    room.set_host_voting(host, False)
    room.cast_vote(alice, "5")
    room.reveal(host)
    before = room.results()

    room.transfer_host(host, alice)

    assert room.host_voting is True
    assert host not in room.votes
    assert room.results().votes == before.votes
    assert room.results().average == before.average


def test_incoming_host_still_cannot_vote_while_revealed():
    """Asserts the error *identity*: RoundRevealed, not HostNotVoting, proves the new
    host is blocked as a voter like everyone else — so host_voting=True post-reveal
    is inert rather than inconsistent."""
    room, (host, alice) = _room_with("Host", "Alice")
    room.reveal(host)

    room.transfer_host(host, alice)

    with pytest.raises(RoundRevealed):
        room.cast_vote(alice, "5")


def test_handover_on_hostless_room_raises_not_host():
    """Defensive: host_id is None only in an empty room, so this state is unreachable
    while anyone is connected. Guards the guarantee, not behaviour."""
    room = Room(code="ROOM01")
    assert room.host_id is None

    with pytest.raises(NotHost):
        room.transfer_host("anyone", "someone")


def test_handover_is_repeatable():
    """No residue: exactly one host at every hop, including back to the original."""
    room, (a, b, c) = _room_with("A", "B", "C")

    for actor, target in ((a, b), (b, c), (c, a)):
        room.transfer_host(actor, target)
        assert room.host_id == target
        assert room.host_voting is True

    assert room.host_id == a
