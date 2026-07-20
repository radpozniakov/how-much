"""Domain-level tests for S4: reveal, reset, and results stats.

Exercises :class:`Room` directly (no HTTP), so the reveal/reset rules and the
average/consensus math are validated independently of any transport (S6).
"""

import pytest
from app.rooms.errors import NotHost, RoundRevealed
from app.rooms.models import Room


def _room_with(*names: str) -> tuple[Room, list[str]]:
    """A room whose first member is the host; returns the room and the ids."""
    room = Room(code="ROOM01")
    ids = [room.add_participant(n).id for n in (names or ("Host",))]
    return room, ids


# --- reveal -----------------------------------------------------------------


def test_reveal_sets_flag_and_is_idempotent():
    room, (host,) = _room_with("Host")
    assert room.revealed is False
    room.reveal(host)
    assert room.revealed is True
    room.reveal(host)  # no-op, still revealed
    assert room.revealed is True


def test_non_host_cannot_reveal():
    room, (host, other) = _room_with("Host", "Other")
    with pytest.raises(NotHost):
        room.reveal(other)
    assert room.revealed is False


def test_results_is_none_until_revealed():
    # The domain-level FR-10 gate: no results object exists pre-reveal.
    room, (host, alice) = _room_with("Host", "Alice")
    room.cast_vote(alice, "5")
    assert room.results() is None
    room.reveal(host)
    assert room.results() is not None


# --- reset ------------------------------------------------------------------


def test_reset_clears_votes_topic_and_reveal():
    room, (host, alice) = _room_with("Host", "Alice")
    room.set_item(host, "Login flow")
    room.cast_vote(alice, "8")
    room.reveal(host)
    room.reset_round(host)
    assert room.votes == {}
    assert room.current_item is None
    assert room.revealed is False
    assert room.results() is None


def test_non_host_cannot_reset():
    room, (host, other) = _room_with("Host", "Other")
    room.cast_vote(other, "3")
    with pytest.raises(NotHost):
        room.reset_round(other)
    assert room.votes  # untouched


def test_reset_preserves_host_voting():
    # host_voting is a facilitator preference that persists across rounds (D-14
    # is silent on reset); a reset must not silently re-opt the host in.
    room, (host,) = _room_with("Host")
    room.set_host_voting(host, False)
    room.reset_round(host)
    assert room.host_voting is False


def test_reveal_reset_cycle_is_clean():
    room, (host, alice) = _room_with("Host", "Alice")
    room.cast_vote(alice, "2")
    room.reveal(host)
    room.reset_round(host)
    # A fresh round runs normally after a reset.
    room.reveal(host)
    assert room.revealed is True
    room.reset_round(host)
    assert room.revealed is False


# --- post-reveal vote lock (FR-11) ------------------------------------------


def test_vote_after_reveal_is_rejected():
    room, (host, alice) = _room_with("Host", "Alice")
    room.cast_vote(alice, "5")
    room.reveal(host)
    with pytest.raises(RoundRevealed):
        room.cast_vote(alice, "8")
    assert room.votes[alice] == "5"  # unchanged


def test_reveal_checked_before_participant():
    # Guard order: the revealed state is checked ahead of membership, so a
    # post-reveal vote from a non-member is RoundRevealed, not UnknownParticipant.
    room, (host,) = _room_with("Host")
    room.reveal(host)
    with pytest.raises(RoundRevealed):
        room.cast_vote("ghost-id", "5")


def test_voting_works_again_after_reset():
    room, (host, alice) = _room_with("Host", "Alice")
    room.reveal(host)
    room.reset_round(host)
    room.cast_vote(alice, "13")
    assert room.votes[alice] == "13"


def test_set_item_after_reveal_is_rejected():
    # Revealed results must not be relabelled against a different topic.
    room, (host,) = _room_with("Host")
    room.set_item(host, "Login flow")
    room.reveal(host)
    with pytest.raises(RoundRevealed):
        room.set_item(host, "Payment flow")
    assert room.current_item == "Login flow"  # unchanged


def test_set_host_voting_after_reveal_is_rejected():
    # Toggling host voting off post-reveal would drop the host's revealed card
    # and recompute the average out from under everyone.
    room, (host,) = _room_with("Host")
    room.cast_vote(host, "5")
    room.reveal(host)
    with pytest.raises(RoundRevealed):
        room.set_host_voting(host, False)
    assert room.votes[host] == "5"  # revealed card untouched


# --- results math (FR-15, FR-16) --------------------------------------------


def _reveal(room, host):
    """Reveal as ``host`` and return the round results snapshot."""
    room.reveal(host)
    return room.results()


def test_average_of_numeric_votes():
    room, (host, a, b, c, d) = _room_with("H", "A", "B", "C", "D")
    for pid, card in zip((a, b, c, d), ("2", "3", "5", "8"), strict=True):
        room.cast_vote(pid, card)
    assert _reveal(room, host).average == 4.5


def test_average_single_vote_is_that_value():
    room, (host, alice) = _room_with("Host", "Alice")
    room.cast_vote(alice, "13")
    assert _reveal(room, host).average == 13.0


def test_average_none_when_no_votes():
    room, (host,) = _room_with("Host")
    assert _reveal(room, host).average is None


def test_consensus_true_when_all_equal():
    room, (host, a, b) = _room_with("H", "A", "B")
    room.cast_vote(a, "5")
    room.cast_vote(b, "5")
    assert _reveal(room, host).consensus is True


def test_consensus_false_when_votes_differ():
    room, (host, a, b) = _room_with("H", "A", "B")
    room.cast_vote(a, "5")
    room.cast_vote(b, "8")
    assert _reveal(room, host).consensus is False


def test_consensus_true_for_single_vote():
    room, (host, alice) = _room_with("Host", "Alice")
    room.cast_vote(alice, "3")
    assert _reveal(room, host).consensus is True


def test_consensus_false_when_no_votes():
    room, (host,) = _room_with("Host")
    assert _reveal(room, host).consensus is False


def test_reveal_with_no_votes_yields_empty_results():
    room, (host,) = _room_with("Host")
    room.set_host_voting(host, False)
    room.reveal(host)
    results = room.results()
    assert results is not None
    assert results.votes == {}
    assert results.average is None
    assert results.consensus is False


def test_results_snapshot_carries_cards_and_stats():
    room, (host, a, b) = _room_with("H", "A", "B")
    room.cast_vote(a, "3")
    room.cast_vote(b, "5")
    room.reveal(host)
    results = room.results()
    assert results.votes == {a: "3", b: "5"}
    assert results.average == 4.0
    assert results.consensus is False
