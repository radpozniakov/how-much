"""Parsing and validation for a host-chosen deck (FR-22/D-48).

Turns the host's comma-separated free-text field into the canonical
``tuple[str, ...]`` a ``Room`` holds, or raises ``ValueError``.

Runs at the **create boundary** only: a deck is fixed for the room's life, so a
bad one is a ``422`` on creation rather than a room that is already broken, and
the domain only ever sees a deck valid by construction.

``ValueError`` rather than ``RoomError`` — this is input validation, raised exactly
as ``JoinRequest`` does for a blank name, so FastAPI renders both alike.
"""

from __future__ import annotations

import math

from app import config


def _normalize_card(raw: str) -> str:
    """One trimmed segment -> its canonical card string.

    Canonicalization is **not cosmetic**: ``Room.results()`` decides consensus by
    comparing card strings, so a deck holding both ``1`` and ``1.0`` would let
    agreeing voters fail to read as consensus. One spelling per value — ``1.0`` and
    ``01`` -> ``1``, ``1.50`` -> ``1.5`` — also lets :func:`parse_deck` catch such a
    deck as the duplicate it is.

    Parsing is ``float``, deliberately permissive (``1e2`` -> ``100``, ``+5`` ->
    ``5``); bounds apply to the normalized form, which is what reaches a card face.
    ``str`` only uses exponent notation below ``1e-4``, which ``MIN_CARD_VALUE``
    puts out of reach, so no accepted card can be spelled ``1e-05`` (D-49).

    Raises:
        ValueError: if the segment is not a finite number, is outside
            ``MIN_CARD_VALUE``..``MAX_CARD_VALUE`` inclusive, or is longer than
            ``MAX_CARD_LENGTH`` characters once normalized.
    """
    try:
        value = float(raw)
    except ValueError:
        raise ValueError(f"{raw!r} is not a number") from None
    if not math.isfinite(value):
        raise ValueError(f"{raw!r} is not a number")
    if value < config.MIN_CARD_VALUE:
        raise ValueError(
            f"{raw!r} is too small; card values must be {config.MIN_CARD_VALUE} or more"
        )
    if value > config.MAX_CARD_VALUE:
        raise ValueError(
            f"{raw!r} is too large; card values must be {config.MAX_CARD_VALUE} or less"
        )
    card = str(int(value)) if value.is_integer() else str(value)
    if len(card) > config.MAX_CARD_LENGTH:
        raise ValueError(
            f"{raw!r} is too long; a card value is at most "
            f"{config.MAX_CARD_LENGTH} characters"
        )
    return card


def parse_deck(cards: str | None) -> tuple[str, ...]:
    """The host's comma-separated card values -> the room's deck.

    Blank (``None``, empty, whitespace, or only commas) means no choice, so the room
    gets :data:`config.FIBONACCI_DECK` (D-48).

    Empty segments are dropped as typing rather than intent, so ``1, 2, ,3`` is a
    three-card deck. **Duplicates go the other way** — ``1, 1, 2`` is rejected, not
    deduped, since a deck that quietly differs from what the host typed is worse
    than a ``422``. Checked on normalized values, so ``1, 1.0`` is caught too.

    Order is **preserved as entered**, never sorted.

    Raises:
        ValueError: if the input is over ``MAX_DECK_INPUT_LENGTH`` characters, if
            any segment fails :func:`_normalize_card`, if two cards are equal, or
            if the deck is not between ``MIN_DECK_SIZE`` and ``MAX_DECK_SIZE``
            cards.
    """
    if cards is None:
        return config.FIBONACCI_DECK
    if len(cards) > config.MAX_DECK_INPUT_LENGTH:
        raise ValueError(
            f"card values must be at most {config.MAX_DECK_INPUT_LENGTH} characters"
        )
    segments = [segment.strip() for segment in cards.split(",")]
    deck = tuple(_normalize_card(segment) for segment in segments if segment)
    if not deck:
        return config.FIBONACCI_DECK
    if len(set(deck)) != len(deck):
        raise ValueError("card values must not repeat")
    if not config.MIN_DECK_SIZE <= len(deck) <= config.MAX_DECK_SIZE:
        raise ValueError(
            f"a deck must hold between {config.MIN_DECK_SIZE} and "
            f"{config.MAX_DECK_SIZE} cards"
        )
    return deck
