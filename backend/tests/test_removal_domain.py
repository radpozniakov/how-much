"""Domain tests for host-initiated removal: Room.remove_participant_by_host
(FR-21/D-47).

Its own file for the same reason test_handover_domain.py is: this is an authority
action that happens to produce a leave, so the assertions are about the guards and
about what the delegate does *not* do.

Every test says **removal** and every actor is named for its role, because these
tests exist to distinguish this from the self-service leave that shares its effect.
The two are one method apart, and the failure mode is a test that passes against
either.
"""

import pytest
from app.rooms.errors import (
    CannotTargetSelf,
    NotHost,
    UnknownParticipant,
)
from app.rooms.models import Room


def _room_with(*names: str) -> tuple[Room, list[str]]:
    """A room whose first member is the host; returns the room and the ids."""
    room = Room(code="ROOM01")
    ids = [room.add_participant(n).id for n in (names or ("Host",))]
    return room, ids


def test_removal_drops_the_target():
    room, (host, alice) = _room_with("Host", "Alice")

    room.remove_participant_by_host(host, alice)

    assert alice not in room.participants
    assert list(room.participants) == [host]


def test_removal_drops_the_targets_vote():
    """Same as the leave path: the vote goes with the person."""
    room, (host, alice) = _room_with("Host", "Alice")
    room.cast_vote(alice, "5")

    room.remove_participant_by_host(host, alice)

    assert alice not in room.votes


def test_removal_leaves_everyone_else_untouched():
    """Targeted, not a purge: pins that the delegate gets the target, not the actor."""
    room, (host, alice, bob) = _room_with("Host", "Alice", "Bob")
    room.cast_vote(alice, "3")
    room.cast_vote(bob, "8")

    room.remove_participant_by_host(host, alice)

    assert set(room.participants) == {host, bob}
    assert room.votes == {bob: "8"}


def test_removal_rejects_non_host():
    """The membership assertion is the load-bearing half: a raise alone would also
    pass if the participant were dropped first and the guard checked after."""
    room, (host, alice, bob) = _room_with("Host", "Alice", "Bob")

    with pytest.raises(NotHost):
        room.remove_participant_by_host(alice, bob)

    assert set(room.participants) == {host, alice, bob}


def test_removal_rejects_a_stranger_as_actor():
    """`_require_host` doubles as membership enforcement — asserted, not inferred."""
    room, (host, alice) = _room_with("Host", "Alice")

    with pytest.raises(NotHost):
        room.remove_participant_by_host("never-joined", alice)

    assert set(room.participants) == {host, alice}


def test_removal_rejects_self_target():
    """Also why the delegate's auto-transfer branch is dead: the only participant who
    could be the host is the one id this rejects."""
    room, (host, alice) = _room_with("Host", "Alice")

    with pytest.raises(CannotTargetSelf):
        room.remove_participant_by_host(host, host)

    assert set(room.participants) == {host, alice}
    assert room.host_id == host


def test_self_target_message_describes_removal_not_handover():
    """CannotTargetSelf exists because a message that does not describe the action is
    a defect. Two callers share the class, so this asserts the message is the
    caller's — a shared wording would pass the type check above and undo the split."""
    room, (host, _alice) = _room_with("Host", "Alice")

    with pytest.raises(CannotTargetSelf, match="remove yourself"):
        room.remove_participant_by_host(host, host)


def test_removal_rejects_unknown_target():
    """A genuine race — they left between the host's snapshot and the click."""
    room, (host, alice) = _room_with("Host", "Alice")

    with pytest.raises(UnknownParticipant):
        room.remove_participant_by_host(host, "not-a-real-id")

    assert set(room.participants) == {host, alice}


def test_removal_never_moves_the_host_role():
    """Asserts the delegate's D-13 auto-transfer is unreachable, over the case most
    likely to trip it: removing the *oldest* participant, whom that branch promotes."""
    room, (host, alice, bob) = _room_with("Host", "Alice", "Bob")

    room.remove_participant_by_host(host, alice)

    assert room.host_id == host


def test_removal_preserves_an_opted_out_hosts_choice():
    """The mirror of the handover's host_voting reset, and why it is *not* reset
    here: the role has not moved, so there is no incoming host to protect."""
    room, (host, alice, bob) = _room_with("Host", "Alice", "Bob")
    room.set_host_voting(host, False)

    room.remove_participant_by_host(host, alice)

    assert room.host_voting is False
    assert room.host_id == host


def test_removal_cannot_empty_the_room():
    """Why this needs no empty_since stamp: the actor is a member, so at least one
    participant always remains."""
    room, (host, alice) = _room_with("Host", "Alice")

    room.remove_participant_by_host(host, alice)

    assert room.participants
    assert room.empty_since is None


def test_removal_frees_capacity():
    """A removal must give the seat back, or "remove someone to make room" silently
    does not work (FR-5)."""
    room = Room(code="ROOM01")
    ids = [room.add_participant(f"P{i}").id for i in range(30)]
    host = ids[0]

    room.remove_participant_by_host(host, ids[1])
    replacement = room.add_participant("Late")

    assert replacement.id in room.participants
    assert len(room.participants) == 30


def test_removal_legal_after_reveal_and_rewrites_the_round():
    """Not locked by RoundRevealed, and — unlike the handover — it genuinely changes
    the results. That is the point: the leave path's post-reveal behaviour reached by
    a deliberate trigger, so it must neither be blocked nor leave the vote behind."""
    room, (host, alice, bob) = _room_with("Host", "Alice", "Bob")
    room.cast_vote(host, "5")
    room.cast_vote(alice, "5")
    room.cast_vote(bob, "13")
    room.reveal(host)
    assert room.results().consensus is False

    room.remove_participant_by_host(host, bob)

    after = room.results()
    assert bob not in after.votes
    assert after.average == 5
    assert after.consensus is True
    assert room.revealed is True


def test_removal_after_reveal_can_empty_the_revealed_round():
    """The extreme of the above: the last remaining vote can go, and results()
    reports an empty round rather than raising or dividing by zero."""
    room, (host, alice) = _room_with("Host", "Alice")
    room.set_host_voting(host, False)
    room.cast_vote(alice, "8")
    room.reveal(host)

    room.remove_participant_by_host(host, alice)

    after = room.results()
    assert after.votes == {}
    assert after.average is None
    assert after.consensus is False


def test_removal_is_repeatable_down_to_the_host_alone():
    """The host can clear the room and still holds the role at every step."""
    room, (host, alice, bob) = _room_with("Host", "Alice", "Bob")

    for target in (alice, bob):
        room.remove_participant_by_host(host, target)
        assert room.host_id == host

    assert list(room.participants) == [host]

    with pytest.raises(CannotTargetSelf):
        room.remove_participant_by_host(host, host)


def test_removed_participant_can_rejoin_immediately():
    """Removal is not a ban (D-15): the code still works and a rejoin is a fresh
    participant. Pinned as decided behaviour so a later reader finds a decision here
    rather than a gap."""
    room, (host, alice) = _room_with("Host", "Alice")

    room.remove_participant_by_host(host, alice)
    rejoined = room.add_participant("Alice")

    assert rejoined.id != alice
    assert rejoined.id in room.participants


def test_removal_then_handover_hands_over_the_smaller_room():
    """The two room-control actions compose: FR-21 does not disturb FR-20's
    invariants."""
    room, (host, alice, bob) = _room_with("Host", "Alice", "Bob")

    room.remove_participant_by_host(host, alice)
    room.transfer_host(host, bob)

    assert room.host_id == bob
    assert set(room.participants) == {host, bob}
    room.remove_participant_by_host(bob, host)
    assert list(room.participants) == [bob]
