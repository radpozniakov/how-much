"""Tests for the background empty-room sweeper.

Only the lifespan wiring: the task calls ``store.sweep`` on its interval and is
cancelled cleanly. Reclaim *timing* is covered in ``test_lifecycle_domain`` with a
FakeClock, since the singleton ``store`` uses the real ``time.monotonic``.

The task runs inside the TestClient's portal thread, so the "sweep happened" signal
is a thread-safe ``threading.Event``, not a loop-bound asyncio primitive.
"""

import threading

from app import config, main
from app.rooms.store import store
from fastapi.testclient import TestClient


def test_sweeper_task_runs_and_cancels_cleanly(monkeypatch):
    swept = threading.Event()

    def fake_sweep() -> None:
        swept.set()

    monkeypatch.setattr(store, "sweep", fake_sweep)
    monkeypatch.setattr(config, "SWEEP_INTERVAL_SECONDS", 0.01)

    with TestClient(main.app) as client:
        assert client.get("/health").json() == {"status": "ok"}
        assert swept.wait(timeout=2.0), "background sweeper never called store.sweep"
