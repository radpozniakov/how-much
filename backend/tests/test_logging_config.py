"""Guard that ``app.*`` log records can actually surface.

``caplog`` proves a log *call happened*, not that anyone would ever see it. Before
D-45 there was no logging config, so root sat at ``WARNING`` with no handlers and
uvicorn's ``LOGGING_CONFIG`` left it that way — every ``app.*`` record went nowhere.

``logging.basicConfig`` is the rejected mechanism: it returns early — level included
— when root already holds a handler, and pytest attaches capture handlers before
``app.main`` imports, so it would configure nothing here. ``_configure_logging`` sets
the level unconditionally and adds a handler only to a bare root, so both paths hold.

⚠️ The first test relies on pytest's logging plugin leaving root's *level* alone,
which holds only while ``pyproject.toml`` sets neither ``log_level`` nor
``log_cli_level``. Adding either makes the plugin own the level, and this assertion
needs rechecking — a config change, not an app bug.
"""

import logging

import pytest
from app.main import _configure_logging


def test_app_logger_is_enabled_for_info():
    """The default path — the one every other test in the suite runs under."""
    assert logging.getLogger("app.rooms.ws").isEnabledFor(logging.INFO)


@pytest.fixture
def restored_root():
    """Save root's handlers and level, and put them back afterwards.

    Restores in teardown so a failing test cannot leak a mutated root. The clear
    itself belongs in the test body: pytest's logging plugin re-attaches capture
    handlers per test *phase*, so a root cleared in setup is no longer bare.
    """
    root = logging.getLogger()
    saved_handlers = root.handlers[:]
    saved_level = root.level
    try:
        yield root
    finally:
        root.handlers[:] = saved_handlers
        root.setLevel(saved_level)


def test_configure_logging_sets_level_on_a_bare_root(restored_root):
    """The uvicorn-shaped path, which the test above structurally cannot see —
    pytest is never bare, so only a cleared root exercises the handler branch."""
    restored_root.handlers.clear()

    _configure_logging()

    assert restored_root.level == logging.INFO
    assert len(restored_root.handlers) == 1
    assert logging.getLogger("app.rooms.ws").isEnabledFor(logging.INFO)
