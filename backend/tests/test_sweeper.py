"""Tests for the background empty-room sweeper (S6a).

The singleton ``store`` uses the real ``time.monotonic`` clock, so reclaim
*timing* is covered elsewhere with a FakeClock (``test_lifecycle_domain``). Here
we only prove the lifespan wiring: the background task actually calls
``store.sweep`` on its interval and is cancelled cleanly on shutdown. No real
TTL-length sleep.

The task runs inside the TestClient's portal thread, so the "sweep happened"
signal is a thread-safe ``threading.Event``, not a loop-bound asyncio primitive.
"""

import threading

from app import config, main
from app.rooms.store import store
from fastapi.testclient import TestClient


def test_sweeper_task_runs_and_cancels_cleanly(monkeypatch):
    swept = threading.Event()

    def fake_sweep() -> None:
        swept.set()

    # Patch by attribute so the by-attribute call in _sweeper picks this up, and
    # shrink the interval so the task fires promptly (no real TTL wait).
    monkeypatch.setattr(store, "sweep", fake_sweep)
    monkeypatch.setattr(config, "SWEEP_INTERVAL_SECONDS", 0.01)

    # Entering the context manager runs the lifespan, which starts the sweeper.
    with TestClient(main.app) as client:
        assert client.get("/health").json() == {"status": "ok"}
        assert swept.wait(timeout=2.0), "background sweeper never called store.sweep"
    # Leaving the context ran the lifespan shutdown: the task was cancelled and
    # awaited. Reaching here without hanging or raising is the clean-cancel proof.
