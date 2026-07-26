"""Parsing and validation for a host-chosen deck (FR-22/D-48).

The host types their card values into one free-text field, comma-separated. This
module turns that string into the canonical ``tuple[str, ...]`` a ``Room`` holds,
or raises ``ValueError`` describing what is wrong with it.

It lives at the **create boundary** and nowhere else. A deck is fixed for the
room's life (D-48), so this runs exactly once per room — before the ``Room``
exists. That is the whole point: a bad deck is a ``422`` on creation rather than a
room that is already broken, and by the time the domain sees a deck it is valid by
construction. There is no host-only frame to re-validate for, and no mid-round
invalidation to reason about.

``ValueError`` rather than a ``RoomError``: nothing here is a domain rule about a
room that exists — it is input validation, and the route model raises it exactly
as ``JoinRequest`` does for a blank name, so FastAPI renders both the same way.
"""

from __future__ import annotations

import math

from app import config


def _normalize_card(raw: str) -> str:
    """One trimmed segment -> its canonical card string.

    Canonicalization is **not cosmetic**, and consensus is why: ``Room.results()``
    compares the card *strings* (``len(set(votes.values())) == 1``), so a deck
    holding both ``1`` and ``1.0`` would let two voters who actually agree fail to
    read as consensus. Normalizing here means such a deck is rejected as the
    duplicate it is (see :func:`parse_deck`), and that every stored card has one
    spelling: ``1.0`` -> ``1``, ``01`` -> ``1``, ``.5`` -> ``0.5``.

    Parsing is Python's ``float``, which is deliberately permissive: ``1e2`` and
    ``+5`` are accepted and normalized to ``100`` and ``5``. Nothing is lost by
    that — whatever the host typed, what the room stores and shows is the plain
    number — and the bounds below are applied to the normalized form, which is
    what actually reaches a card face.

    Raises:
        ValueError: if the segment is not a finite, non-negative number, is not
            below ``MAX_CARD_VALUE``, or is longer than ``MAX_CARD_LENGTH``
            characters once normalized.
    """
    try:
        value = float(raw)
    except ValueError:
        raise ValueError(f"{raw!r} is not a number") from None
    # `inf`/`nan` parse as floats, so they need naming here rather than falling
    # through the comparisons below — `nan` fails every one of them and would
    # otherwise be reported as negative, which it is not.
    if not math.isfinite(value):
        raise ValueError(f"{raw!r} is not a number")
    if value < 0:
        raise ValueError(f"{raw!r} is negative; card values must be zero or more")
    if value >= config.MAX_CARD_VALUE:
        raise ValueError(f"{raw!r} is too large; card values must be below 1000")
    card = str(int(value)) if value.is_integer() else str(value)
    if len(card) > config.MAX_CARD_LENGTH:
        raise ValueError(
            f"{raw!r} is too long; a card value is at most "
            f"{config.MAX_CARD_LENGTH} characters"
        )
    return card


def parse_deck(cards: str | None) -> tuple[str, ...]:
    """The host's comma-separated card values -> the room's deck.

    Blank (``None``, empty, whitespace, or nothing but commas) means the host made
    no choice, so the room gets :data:`config.FIBONACCI_DECK` — the field is
    optional and this is what "left blank" does (D-48).

    Empty segments are dropped rather than rejected, so ``1, 2, ,3`` is a
    three-card deck and a trailing comma is not an error: those are typing, not
    intent. **Duplicates are the opposite call** — ``1, 1, 2`` is rejected, not
    silently deduped, because a repeated card is a typo the host wants to know
    about and a deck that quietly differs from what they typed is worse than a
    ``422``. The check runs on normalized values, so ``1, 1.0`` is caught too.

    Order is **preserved as entered**, never sorted: the host's sequence is the
    deck's sequence, and someone who types ``8, 5, 3`` meant it.

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
