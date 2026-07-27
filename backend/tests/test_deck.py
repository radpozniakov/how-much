"""The host-chosen deck's validation table (FR-22/D-48).

Exercises :func:`app.rooms.deck.parse_deck` directly — the create boundary's only
gate on card values, so everything a host can type is decided here. This file owns
the rules; ``test_rooms_api.py`` pins the API wiring around them.
"""

import pytest
from app import config
from app.rooms.deck import parse_deck


@pytest.mark.parametrize("blank", [None, "", "   ", ",", ",,,", " , , "])
def test_blank_input_yields_the_fibonacci_default(blank):
    assert parse_deck(blank) == config.FIBONACCI_DECK


def test_parses_the_documented_example():
    assert parse_deck("1, 2, 4, 8, 12, 16") == ("1", "2", "4", "8", "12", "16")


def test_empty_segments_are_dropped_not_rejected():
    assert parse_deck("1, 2, ,3") == ("1", "2", "3")
    assert parse_deck("1,2,3,") == ("1", "2", "3")


def test_order_is_preserved_never_sorted():
    assert parse_deck("8, 5, 3") == ("8", "5", "3")


def test_decimals_inside_the_range_are_legal_cards():
    assert parse_deck("1, 1.5, 2, 3") == ("1", "1.5", "2", "3")


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
    assert parse_deck(f"{raw}, 99") == (expected, "99")


def test_no_normalized_card_is_ever_in_exponent_form():
    for card in parse_deck("1, 1e2, 999, 1.5"):
        assert "e" not in card


def test_normalization_is_what_catches_spelling_duplicates():
    with pytest.raises(ValueError, match="must not repeat"):
        parse_deck("1, 1.0")


@pytest.mark.parametrize(
    "bad", ["a", "?", "five", "XL", "1/2", "1 2", "nan", "inf", "-inf"]
)
def test_non_numeric_values_are_rejected(bad):
    with pytest.raises(ValueError, match="is not a number"):
        parse_deck(f"{bad}, 1")


@pytest.mark.parametrize("big", ["1000", "999.5", "1001", "9999"])
def test_values_above_the_ceiling_are_rejected(big):
    with pytest.raises(ValueError, match="too large"):
        parse_deck(f"{big}, 1")
    assert parse_deck("999, 1") == ("999", "1")


@pytest.mark.parametrize("small", ["0", "0.5", "0.999", "-1", "-0.5", "0.00001"])
def test_values_below_the_floor_are_rejected(small):
    with pytest.raises(ValueError, match="too small"):
        parse_deck(f"{small}, 1")


def test_one_is_the_smallest_card_and_is_accepted():
    assert parse_deck("1, 2") == ("1", "2")


def test_over_long_values_are_rejected():
    with pytest.raises(ValueError, match="too long"):
        parse_deck("1.234567, 2")
    assert parse_deck("1.2345, 2") == ("1.2345", "2")
    assert len("1.2345") == config.MAX_CARD_LENGTH


def test_duplicates_are_rejected_not_deduped():
    with pytest.raises(ValueError, match="must not repeat"):
        parse_deck("1, 1, 2")


def test_a_single_card_is_not_a_deck():
    with pytest.raises(ValueError, match="between 2 and 12"):
        parse_deck("5")


def test_more_than_twelve_cards_is_rejected():
    with pytest.raises(ValueError, match="between 2 and 12"):
        parse_deck(",".join(str(n) for n in range(1, 14)))
    assert len(parse_deck(",".join(str(n) for n in range(1, 13)))) == 12


def test_two_cards_is_the_minimum_and_is_accepted():
    assert parse_deck("1, 2") == ("1", "2")


def test_an_over_long_input_string_is_rejected_before_it_is_split():
    with pytest.raises(ValueError, match="at most 200 characters"):
        parse_deck("1," * config.MAX_DECK_INPUT_LENGTH)
