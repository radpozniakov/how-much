"""Shared test fixtures.

The room store is process-global (D-4), so it must be reset around every test to
keep them independent.
"""

import pytest
from app.main import app
from app.rooms.store import store
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _clean_store():
    """Give each test an empty store, and leave a clean one behind."""
    store.clear()
    yield
    store.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
