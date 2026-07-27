"""Runtime configuration.

Only the public base URL genuinely varies per deployment, so it is the one knob
read from the environment (D-30). The rest are fixed product constants — plain
values, so a bad env override can't crash startup or break room creation.
"""

import os

PUBLIC_BASE_URL: str = os.getenv(
    "HOWMUCH_PUBLIC_BASE_URL", "http://localhost:5173"
).rstrip("/")

ROOM_CODE_LENGTH = 6

ROOM_CAPACITY = 30

MAX_DISPLAY_NAME_LENGTH = 40

FIBONACCI_DECK: tuple[str, ...] = ("1", "2", "3", "5", "8", "13", "21")

MIN_DECK_SIZE = 2
MAX_DECK_SIZE = 12

MIN_CARD_VALUE = 1
MAX_CARD_VALUE = 999
MAX_CARD_LENGTH = 6

MAX_DECK_INPUT_LENGTH = 200

MAX_TOPIC_LENGTH = 200

EMPTY_ROOM_TTL_SECONDS = 60

SWEEP_INTERVAL_SECONDS = 15


def room_link(code: str) -> str:
    """Build the shareable link for a room code (see D-30 for the path convention)."""
    return f"{PUBLIC_BASE_URL}/room/{code}"
