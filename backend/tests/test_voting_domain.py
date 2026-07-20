"""Domain-level tests for the voting round: item, votes, and the host toggle.

Exercises :class:`Room` directly (no HTTP), so the round rules are validated
independently of any transport (S6). Reveal, reset, and results stats are S4.
"""

import pytest
from app import config
from app.rooms.errors import (
    HostNotVoting,
    InvalidCard,
    NotHost,
    UnknownParticipant,
)
from app.rooms.models import Room


def _room_with(*names: str) -> tuple[Room, list[str]]:
    """A room whose first member is the host; returns the room and the ids."""
    room = Room(code="ROOM01")
    ids = [room.add_participant(n).id for n in (names or ("Host",))]
    return room, ids


def test_deck_is_exactly_fibonacci():
    # Guards D-8: numbers only, no 40/100, no special cards.
    assert config.FIBONACCI_DECK == ("0", "1", "2", "3", "5", "8", "13", "21")


# --- item -------------------------------------------------------------------


def test_host_sets_and_clears_topic():
    room, (host,) = _room_with("Host")
    room.set_item(host, "  Login flow  ")
    assert room.current_item == "Login flow"  # trimmed
    room.set_item(host, "   ")
    assert room.current_item is None  # blank clears
    room.set_item(host, "Again")
    room.set_item(host, None)
    assert room.current_item is None


def test_non_host_cannot_set_item():
    room, (host, other) = _room_with("Host", "Other")
    with pytest.raises(NotHost):
        room.set_item(other, "sneaky")
    assert room.current_item is None


# --- voting -----------------------------------------------------------------


def test_vote_recorded():
    room, (host, alice) = _room_with("Host", "Alice")
    room.cast_vote(alice, "8")
    assert room.votes[alice] == "8"


def test_revote_overwrites():
    room, (host, alice) = _room_with("Host", "Alice")
    room.cast_vote(alice, "3")
    room.cast_vote(alice, "13")
    assert room.votes[alice] == "13"
    assert list(room.votes) == [alice]  # one entry, not two


@pytest.mark.parametrize("bad", ["40", "100", "?", "4", "", "eight"])
def test_invalid_card_rejected(bad):
    room, (host, alice) = _room_with("Host", "Alice")
    with pytest.raises(InvalidCard):
        room.cast_vote(alice, bad)
    assert alice not in room.votes


def test_unknown_participant_cannot_vote():
    room, (host,) = _room_with("Host")
    with pytest.raises(UnknownParticipant):
        room.cast_vote("ghost-id", "5")


def test_unknown_participant_checked_before_card():
    # Guard order: identity is checked before the card value.
    room, (host,) = _room_with("Host")
    with pytest.raises(UnknownParticipant):
        room.cast_vote("ghost-id", "999")


# --- host voting toggle (D-14) ----------------------------------------------


def test_host_opted_out_is_excluded_from_expected_voters():
    room, (host, alice) = _room_with("Host", "Alice")
    assert room.expected_voter_ids() == {host, alice}
    room.set_host_voting(host, False)
    assert room.expected_voter_ids() == {alice}


def test_host_cannot_vote_while_opted_out():
    room, (host,) = _room_with("Host")
    room.set_host_voting(host, False)
    with pytest.raises(HostNotVoting):
        room.cast_vote(host, "5")


def test_opting_out_drops_existing_host_vote():
    room, (host,) = _room_with("Host")
    room.cast_vote(host, "5")
    assert host in room.votes
    room.set_host_voting(host, False)
    assert host not in room.votes


def test_host_can_opt_back_in_and_vote():
    room, (host,) = _room_with("Host")
    room.set_host_voting(host, False)
    room.set_host_voting(host, True)
    room.cast_vote(host, "2")
    assert room.votes[host] == "2"


def test_non_host_cannot_toggle_host_voting():
    room, (host, other) = _room_with("Host", "Other")
    with pytest.raises(NotHost):
        room.set_host_voting(other, False)
    assert room.host_voting is True
