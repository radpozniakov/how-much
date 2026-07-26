"""Domain-level tests for deliberate host handover: Room.transfer_host (FR-20/D-45).

Its own file rather than an extension, because the backend split is by behavior
area and both candidate homes fit badly: test_participants_domain.py is about
membership and capacity, not authority, and test_lifecycle_domain.py is explicitly
"leave, host transfer & empty-room cleanup" whose transfer tests are all
*consequences of a leave*. A deliberate handover is not a lifecycle event.
test_rename_domain.py is the precedent — one new domain method with its own
decision entry got its own file.

Naming: every test here says **handover**, never the bare word "transfer", to keep
it distinguishable from the D-13 disconnect path in
test_lifecycle_domain.py::test_host_leave_transfer_resets_host_voting. The same
one-line effect (host_voting back to True) is reached by two different triggers,
and only this one passes through ``_require_host``.
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
    """DD-2's zero-new-code claim, asserted rather than trusted: cast_vote's guard
    keys on who is host *now*, so the outgoing host stops matching it."""
    room, (host, alice) = _room_with("Host", "Alice")
    room.set_host_voting(host, False)

    room.transfer_host(host, alice)
    room.cast_vote(host, "5")  # would raise HostNotVoting before the handover

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

    assert room.host_id == host  # a raise alone would pass a partial mutation


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
    """§A: a handover touches no input to results(), so it is not locked. The
    invariance assertion is the load-bearing half — "did not raise" is not enough."""
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
    """§A-ii: the post-reveal denominator change is *intended*. host_voting flips
    back on, so the ex-host rejoins the voter set — while results stay identical.
    Pins this so a later reader does not "fix" it."""
    room, (host, alice) = _room_with("Host", "Alice")
    room.set_host_voting(host, False)
    room.cast_vote(alice, "5")
    room.reveal(host)
    before = room.results()

    room.transfer_host(host, alice)

    # host_voting True means nobody is excluded, so the ex-host counts as a voter
    # again — and they hold no vote, which is what puts an unvoted card into an
    # already-revealed grid (rendered as the not-voted glyph, by design).
    assert room.host_voting is True
    assert host not in room.votes
    # …while the revealed round itself is untouched.
    assert room.results().votes == before.votes
    assert room.results().average == before.average


def test_incoming_host_still_cannot_vote_while_revealed():
    """§A-i: asserts the error *identity*. RoundRevealed (not HostNotVoting) proves
    the new host is blocked as a voter like everyone else, not as a host — so
    host_voting=True post-reveal is inert rather than inconsistent."""
    room, (host, alice) = _room_with("Host", "Alice")
    room.reveal(host)

    room.transfer_host(host, alice)

    with pytest.raises(RoundRevealed):
        room.cast_vote(alice, "5")


def test_handover_on_hostless_room_raises_not_host():
    """§A-iv: defensive. host_id is None only in an empty room, so this state is
    unreachable while anyone is connected — this guards the guarantee, not behavior."""
    room = Room(code="ROOM01")
    assert room.host_id is None

    with pytest.raises(NotHost):
        room.transfer_host("anyone", "someone")


def test_handover_is_repeatable():
    """ "Indefinitely, no residue": the role keeps moving and exactly one host holds
    it at every hop, including back to the original."""
    room, (a, b, c) = _room_with("A", "B", "C")

    for actor, target in ((a, b), (b, c), (c, a)):
        room.transfer_host(actor, target)
        assert room.host_id == target
        assert room.host_voting is True

    assert room.host_id == a  # full circle, and still exactly one host
