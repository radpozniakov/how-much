"""Guard that ``app.*`` log records can actually surface (S23 constraint 4).

This file exists because ``caplog`` proves a log *call happened*, not that anyone
would ever see it — and this project is what that gap looks like when nobody checks
the difference. Before D-45 there was no logging config at all, so the root logger
sat at ``WARNING`` with no handlers and uvicorn's default ``LOGGING_CONFIG`` (which
declares handlers for its own ``uvicorn*`` loggers only) left it that way. The one
existing call, ``connection.py``'s ``logger.debug`` for a failed broadcast, had
therefore never emitted anything despite the comment above it claiming a real bug
would be "visible in the logs instead of invisible."

``logging.basicConfig`` is the rejected mechanism: it returns early when root
already holds any handler, and on that path it skips the ``level`` argument too. As
pytest attaches capture handlers before this module imports ``app.main``, a
basicConfig-based setup would configure nothing under pytest — so the first test
below would fail while production worked, or pass while production was broken,
depending on the environment. ``_configure_logging`` sets the level unconditionally
and only adds a handler when root has none, which is why both paths hold.

⚠️ The first test depends on pytest's logging plugin leaving root's *level* alone,
which it does only because ``backend/pyproject.toml`` sets neither ``log_level`` nor
``log_cli_level`` — ``_pytest.logging.catching_logs`` touches the level only when
its ``level`` argument is non-``None``. If S10 adds either ini option, the plugin
takes charge of root's level and this assertion needs rechecking. That is the
likeliest future cause of a failure here, and it is not a bug in the app.
"""

import logging

import pytest
from app.main import _configure_logging


def test_app_logger_is_enabled_for_info():
    """The default path — the one every other test in the suite runs under."""
    # Importing app.main (above) ran _configure_logging at import time.
    assert logging.getLogger("app.rooms.ws").isEnabledFor(logging.INFO)


@pytest.fixture
def restored_root():
    """Save root's handlers and level, and put them back afterwards.

    Restoration is in teardown rather than after the assertions so a failing test
    cannot leak a mutated root into the rest of the session. The clear itself
    happens in the test body, not here: pytest's logging plugin re-attaches its
    capture handlers for each test *phase*, so a root cleared during setup is no
    longer bare by the time the body runs.
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
