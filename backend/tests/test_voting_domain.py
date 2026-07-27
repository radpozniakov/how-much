"""Domain tests for the voting round: item, votes, and the host toggle.

Exercises :class:`Room` directly, so the rules are validated with no transport
involved. Reveal, reset, and results stats live in test_reveal_domain.py.
"""

import pytest
from app import config
from app.rooms.deck import parse_deck
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


def test_default_deck_is_exactly_fibonacci():
    assert config.FIBONACCI_DECK == ("1", "2", "3", "5", "8", "13", "21")
    assert Room(code="ROOM01").deck == config.FIBONACCI_DECK


def test_the_default_deck_is_a_deck_a_host_could_have_typed():
    assert parse_deck(", ".join(config.FIBONACCI_DECK)) == config.FIBONACCI_DECK


def test_host_sets_and_clears_topic():
    room, (host,) = _room_with("Host")
    room.set_item(host, "  Login flow  ")
    assert room.current_item == "Login flow"
    room.set_item(host, "   ")
    assert room.current_item is None
    room.set_item(host, "Again")
    room.set_item(host, None)
    assert room.current_item is None


def test_non_host_cannot_set_item():
    room, (host, other) = _room_with("Host", "Other")
    with pytest.raises(NotHost):
        room.set_item(other, "sneaky")
    assert room.current_item is None


def test_vote_recorded():
    room, (host, alice) = _room_with("Host", "Alice")
    room.cast_vote(alice, "8")
    assert room.votes[alice] == "8"


def test_revote_overwrites():
    room, (host, alice) = _room_with("Host", "Alice")
    room.cast_vote(alice, "3")
    room.cast_vote(alice, "13")
    assert room.votes[alice] == "13"
    assert list(room.votes) == [alice]


@pytest.mark.parametrize("bad", ["40", "100", "?", "4", "", "eight"])
def test_invalid_card_rejected(bad):
    room, (host, alice) = _room_with("Host", "Alice")
    with pytest.raises(InvalidCard):
        room.cast_vote(alice, bad)
    assert alice not in room.votes


def _custom_room(deck: tuple[str, ...]) -> tuple[Room, str]:
    """A two-person room on ``deck``; returns the room and the non-host's id."""
    room = Room(code="ROOM01", deck=deck)
    room.add_participant("Host")
    return room, room.add_participant("Alice").id


def test_a_custom_deck_card_is_accepted():
    room, alice = _custom_room(("1", "2", "4", "8", "12", "16"))
    room.cast_vote(alice, "12")
    assert room.votes[alice] == "12"


def test_a_fibonacci_card_absent_from_a_custom_deck_is_rejected():
    room, alice = _custom_room(("1", "2", "4", "8", "12", "16"))
    with pytest.raises(InvalidCard):
        room.cast_vote(alice, "13")
    assert alice not in room.votes


def test_a_decimal_card_is_votable():
    room, alice = _custom_room(("1", "1.5", "2", "3"))
    room.cast_vote(alice, "1.5")
    assert room.votes[alice] == "1.5"


def test_a_card_matching_only_before_normalization_is_rejected():
    room, alice = _custom_room(("1", "1.5", "2", "3"))
    with pytest.raises(InvalidCard):
        room.cast_vote(alice, "1.50")


def test_unknown_participant_cannot_vote():
    room, (host,) = _room_with("Host")
    with pytest.raises(UnknownParticipant):
        room.cast_vote("ghost-id", "5")


def test_unknown_participant_checked_before_card():
    room, (host,) = _room_with("Host")
    with pytest.raises(UnknownParticipant):
        room.cast_vote("ghost-id", "999")


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
