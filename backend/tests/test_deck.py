"""The host-chosen deck's validation table (FR-22/D-48).

Exercises :func:`app.rooms.deck.parse_deck` directly. It is the create boundary's
only gate on card values, so everything a host can type is decided here — the
domain never sees an unvalidated deck. The API-level wiring (that a rejection is a
``422`` on ``POST /rooms``, and that an accepted deck reaches the ``RoomView``) is
pinned in ``test_rooms_api.py``; this file owns the rules themselves.
"""

import pytest
from app import config
from app.rooms.deck import parse_deck

# --- blank means the default (D-48) -----------------------------------------


@pytest.mark.parametrize("blank", [None, "", "   ", ",", ",,,", " , , "])
def test_blank_input_yields_the_fibonacci_default(blank):
    # "Left blank the room gets the Fibonacci deck it has always had." A string
    # of nothing but separators is blank in every sense that matters: the host
    # named no values.
    assert parse_deck(blank) == config.FIBONACCI_DECK


# --- the happy path ----------------------------------------------------------


def test_parses_the_documented_example():
    assert parse_deck("1, 2, 4, 8, 12, 16") == ("1", "2", "4", "8", "12", "16")


def test_empty_segments_are_dropped_not_rejected():
    # `1, 2, ,3` is a three-card deck, and a trailing comma is not an error.
    assert parse_deck("1, 2, ,3") == ("1", "2", "3")
    assert parse_deck("1,2,3,") == ("1", "2", "3")


def test_order_is_preserved_never_sorted():
    # A host who types `8, 5, 3` meant it: the host's sequence is the deck's.
    assert parse_deck("8, 5, 3") == ("8", "5", "3")


def test_decimals_are_legal_cards():
    # D-8 survives V4 — cards are numbers — and numbers include halves.
    assert parse_deck("0, 0.5, 1, 2") == ("0", "0.5", "1", "2")


# --- normalization (load-bearing, not cosmetic) ------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("1.0", "1"),
        ("01", "1"),
        (".5", "0.5"),
        ("0.50", "0.5"),
        ("+5", "5"),
        ("1e2", "100"),
        ("2.", "2"),
    ],
)
def test_each_value_is_normalized_to_a_canonical_string(raw, expected):
    # Consensus compares card *strings* (`Room.results()`), so a deck holding two
    # spellings of one number would let agreeing voters fail to read as consensus.
    # Canonicalizing here is what makes that impossible.
    assert parse_deck(f"{raw}, 99") == (expected, "99")


def test_normalization_is_what_catches_spelling_duplicates():
    # The pair that motivates normalization: `1` and `1.0` are one card, so this
    # is a duplicate rather than a two-card deck.
    with pytest.raises(ValueError, match="must not repeat"):
        parse_deck("1, 1.0")


# --- rejections --------------------------------------------------------------


@pytest.mark.parametrize(
    "bad", ["a", "?", "five", "XL", "1/2", "1 2", "nan", "inf", "-inf"]
)
def test_non_numeric_values_are_rejected(bad):
    # No `?`, no coffee card, no T-shirt sizes: V4 is numbers-only. `nan`/`inf`
    # are in the table because they *do* parse as floats — they are rejected by an
    # explicit finiteness check, not by falling through the range comparisons,
    # which `nan` would pass off as "not negative, not too large".
    with pytest.raises(ValueError, match="is not a number"):
        parse_deck(f"{bad}, 1")


def test_negative_values_are_rejected():
    with pytest.raises(ValueError, match="negative"):
        parse_deck("-1, 2")


@pytest.mark.parametrize("big", ["1000", "1001", "9999"])
def test_values_at_or_above_the_ceiling_are_rejected(big):
    # The bound is exclusive: 1000 is out, 999 is the largest card.
    with pytest.raises(ValueError, match="too large"):
        parse_deck(f"{big}, 1")
    assert parse_deck("999, 1") == ("999", "1")


def test_over_long_values_are_rejected():
    # Applied to the *normalized* form, which is what reaches a card face.
    with pytest.raises(ValueError, match="too long"):
        parse_deck("0.1234567, 1")
    assert parse_deck("0.1234, 1") == ("0.1234", "1")


def test_duplicates_are_rejected_not_deduped():
    # The debatable call, pinned as decided: `1, 1, 2` is a typo, not an intent,
    # and a deck that quietly differs from what the host typed is worse than a 422.
    with pytest.raises(ValueError, match="must not repeat"):
        parse_deck("1, 1, 2")


def test_a_single_card_is_not_a_deck():
    with pytest.raises(ValueError, match="between 2 and 15"):
        parse_deck("5")


def test_more_than_fifteen_cards_is_rejected():
    with pytest.raises(ValueError, match="between 2 and 15"):
        parse_deck(",".join(str(n) for n in range(16)))
    # Fifteen exactly is fine — the bound is inclusive at both ends.
    assert len(parse_deck(",".join(str(n) for n in range(15)))) == 15


def test_two_cards_is_the_minimum_and_is_accepted():
    assert parse_deck("1, 2") == ("1", "2")


def test_an_over_long_input_string_is_rejected_before_it_is_split():
    # Bounds the parsing work on a hostile input, the way MAX_TOPIC_LENGTH does.
    with pytest.raises(ValueError, match="at most 200 characters"):
        parse_deck("1," * config.MAX_DECK_INPUT_LENGTH)
