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


def test_decimals_inside_the_range_are_legal_cards():
    # D-8 survives V4 — cards are numbers — and numbers include halves. The floor
    # of 1 (D-49) bounds how *small* a card is, not how round: `1.5` is a card even
    # though `0.5` is no longer one.
    assert parse_deck("1, 1.5, 2, 3") == ("1", "1.5", "2", "3")


# --- normalization (load-bearing, not cosmetic) ------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("1.0", "1"),
        ("01", "1"),
        ("1.50", "1.5"),
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


def test_no_normalized_card_is_ever_in_exponent_form():
    # What the table above is really pinning: whatever the host typed, what the room
    # stores and shows is a *plain* number. `str` breaks that promise below 1e-4 —
    # a live bug when the floor was 0.0001 (D-49) — and the range now excludes it
    # rather than guarding against it. Pinned because the floor is what enforces it,
    # so lowering the floor must fail here rather than ship a `1e-05` button.
    for card in parse_deck("1, 1e2, 999, 1.5"):
        assert "e" not in card


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
    # which `nan` would pass off as "not too small, not too large".
    with pytest.raises(ValueError, match="is not a number"):
        parse_deck(f"{bad}, 1")


@pytest.mark.parametrize("big", ["1000", "999.5", "1001", "9999"])
def test_values_above_the_ceiling_are_rejected(big):
    # The bound is inclusive: 999 is the largest card, and 999.5 is over it — the
    # range is on the value, not on how round it is.
    with pytest.raises(ValueError, match="too large"):
        parse_deck(f"{big}, 1")
    assert parse_deck("999, 1") == ("999", "1")


@pytest.mark.parametrize("small", ["0", "0.5", "0.999", "-1", "-0.5", "0.00001"])
def test_values_below_the_floor_are_rejected(small):
    # 1 is the smallest card (D-49), so zero, fractions under one, and negatives all
    # fail one rule with one message — the floor subsumes the old negative check.
    with pytest.raises(ValueError, match="too small"):
        parse_deck(f"{small}, 1")


def test_one_is_the_smallest_card_and_is_accepted():
    # The bound is inclusive at the bottom too.
    assert parse_deck("1, 2") == ("1", "2")


def test_over_long_values_are_rejected():
    # Applied to the *normalized* form, which is what reaches a card face. The
    # value range does not imply this bound: `1.23456` is inside 1..999 and still
    # too long to print on a card.
    with pytest.raises(ValueError, match="too long"):
        parse_deck("1.234567, 2")
    assert parse_deck("1.2345, 2") == ("1.2345", "2")
    assert len("1.2345") == config.MAX_CARD_LENGTH


def test_duplicates_are_rejected_not_deduped():
    # The debatable call, pinned as decided: `1, 1, 2` is a typo, not an intent,
    # and a deck that quietly differs from what the host typed is worse than a 422.
    with pytest.raises(ValueError, match="must not repeat"):
        parse_deck("1, 1, 2")


def test_a_single_card_is_not_a_deck():
    with pytest.raises(ValueError, match="between 2 and 12"):
        parse_deck("5")


def test_more_than_twelve_cards_is_rejected():
    # Counted from 1, not 0: zero is no longer a card (D-49), so a deck built from
    # `range(0, n)` would fail the value floor and never reach the size check.
    with pytest.raises(ValueError, match="between 2 and 12"):
        parse_deck(",".join(str(n) for n in range(1, 14)))
    # Twelve exactly is fine — the bound is inclusive at both ends.
    assert len(parse_deck(",".join(str(n) for n in range(1, 13)))) == 12


def test_two_cards_is_the_minimum_and_is_accepted():
    assert parse_deck("1, 2") == ("1", "2")


def test_an_over_long_input_string_is_rejected_before_it_is_split():
    # Bounds the parsing work on a hostile input, the way MAX_TOPIC_LENGTH does.
    with pytest.raises(ValueError, match="at most 200 characters"):
        parse_deck("1," * config.MAX_DECK_INPUT_LENGTH)
