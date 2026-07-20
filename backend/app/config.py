"""Runtime configuration.

Only the public base URL genuinely varies per deployment, so it is the one knob
read from the environment (D-30). The rest are fixed product constants — plain
values, so a bad env override can't crash startup or break room creation.
"""

import os

# Base URL the shareable room link is built from. Points at the frontend origin
# because the link is opened in a browser, not called by the backend. Compose /
# deployment overrides this; the default matches the Vite dev server.
PUBLIC_BASE_URL: str = os.getenv(
    "HOWMUCH_PUBLIC_BASE_URL", "http://localhost:5173"
).rstrip("/")

# Length of the human-typeable join code. 6 chars over a 31-symbol alphabet is
# ~887M combinations — ample headroom against collisions for an in-memory MVP.
ROOM_CODE_LENGTH = 6

# Maximum participants per room (D-6). Bounds memory and keeps the UI legible.
ROOM_CAPACITY = 30

# Upper bound on a display name's length, applied after trimming (D-34).
MAX_DISPLAY_NAME_LENGTH = 40

# The estimation deck: Fibonacci numbers only, as string tokens (D-7, D-8). No
# 40/100, no special cards. Stored as strings so votes serialize uniformly and
# the set is the single source of truth for what counts as a valid card.
FIBONACCI_DECK: tuple[str, ...] = ("0", "1", "2", "3", "5", "8", "13", "21")

# Upper bound on the current item's topic, applied after trimming. Mirrors the
# bounded display name and keeps the in-memory room from growing unbounded.
MAX_TOPIC_LENGTH = 200

# Grace period before an empty room is discarded (D-18/FR-6). Kept short: an
# empty room holds nothing worth preserving, and a reconnect is a fresh join
# (D-15), so this only needs to survive a brief network blip / page reload.
EMPTY_ROOM_TTL_SECONDS = 60

# How often the background sweeper reclaims empty rooms (S6a). Once clients hold
# long-lived sockets they stop hitting store.get()/create(), so the lazy sweep no
# longer fires on its own; this task drives it. Reclaim latency is therefore up to
# EMPTY_ROOM_TTL_SECONDS + one interval — fine for a short-lived in-memory MVP.
SWEEP_INTERVAL_SECONDS = 15


def room_link(code: str) -> str:
    """Build the shareable link for a room code (see D-30 for the path convention)."""
    return f"{PUBLIC_BASE_URL}/room/{code}"
