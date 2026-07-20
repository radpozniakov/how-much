"""Runtime configuration, read from the environment.

Kept deliberately tiny — plain ``os.getenv`` rather than a settings library —
because the MVP has only a handful of knobs. See D-30.
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
ROOM_CODE_LENGTH: int = int(os.getenv("HOWMUCH_ROOM_CODE_LENGTH", "6"))


def room_link(code: str) -> str:
    """Build the shareable link for a room code (see D-30 for the path convention)."""
    return f"{PUBLIC_BASE_URL}/room/{code}"
