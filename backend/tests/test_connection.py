"""Unit tests for the WebSocket ConnectionManager (S6a).

No async pytest plugin is installed, so the manager's async methods are driven
with ``asyncio.run``. The manager holds no loop-bound state, so a fresh loop per
call is fine. Fake sockets stand in for real WebSockets.
"""

import asyncio

from app.rooms.connection import ConnectionManager


class FakeSocket:
    """Minimal stand-in for a WebSocket: records sends, tracks close, can fail."""

    def __init__(self, *, fail: bool = False) -> None:
        self.sent: list[dict] = []
        self.closed = False
        self._fail = fail

    async def send_json(self, data: dict) -> None:
        if self._fail:
            raise RuntimeError("send failed")
        self.sent.append(data)

    async def close(self) -> None:
        self.closed = True


def test_broadcast_reaches_all_sockets_in_room():
    m = ConnectionManager()
    a, b = FakeSocket(), FakeSocket()
    asyncio.run(m.register("ROOM1", "a", a))
    asyncio.run(m.register("ROOM1", "b", b))
    asyncio.run(m.broadcast("ROOM1", {"type": "x"}))
    assert a.sent == [{"type": "x"}]
    assert b.sent == [{"type": "x"}]


def test_broadcast_isolated_per_room():
    m = ConnectionManager()
    a, b = FakeSocket(), FakeSocket()
    asyncio.run(m.register("R1", "a", a))
    asyncio.run(m.register("R2", "b", b))
    asyncio.run(m.broadcast("R1", {"n": 1}))
    assert a.sent == [{"n": 1}]
    assert b.sent == []


def test_unregister_live_socket_returns_true_and_drops_empty_map():
    m = ConnectionManager()
    a = FakeSocket()
    asyncio.run(m.register("R", "a", a))
    assert m.unregister("R", "a", a) is True
    assert m.has_room("R") is False  # empty per-room map cleaned up


def test_unregister_stale_socket_is_noop_returns_false():
    m = ConnectionManager()
    a, b = FakeSocket(), FakeSocket()
    asyncio.run(m.register("R", "p", a))
    asyncio.run(m.register("R", "p", b))  # b supersedes a
    assert a.closed is True
    # a is no longer the stored socket -> its unregister must be a no-op / False,
    # so the disconnect handler for a will skip the domain leave (MF1 guard).
    assert m.unregister("R", "p", a) is False
    asyncio.run(m.broadcast("R", {"k": 1}))
    assert b.sent == [{"k": 1}]  # b still registered
    assert m.unregister("R", "p", b) is True  # the live socket removes cleanly


def test_duplicate_register_closes_and_replaces_old():
    m = ConnectionManager()
    a, b = FakeSocket(), FakeSocket()
    asyncio.run(m.register("R", "p", a))
    asyncio.run(m.register("R", "p", b))
    assert a.closed is True
    asyncio.run(m.broadcast("R", {"z": 9}))
    assert b.sent == [{"z": 9}]
    assert a.sent == []  # a received nothing after being replaced


def test_dead_socket_skipped_without_aborting_fanout():
    m = ConnectionManager()
    dead, good = FakeSocket(fail=True), FakeSocket()
    asyncio.run(m.register("R", "d", dead))
    asyncio.run(m.register("R", "g", good))
    asyncio.run(m.broadcast("R", {"ok": 1}))
    assert good.sent == [{"ok": 1}]  # a broken socket didn't abort the fan-out
    # broadcast does not remove sockets — the handler's finally owns removal, so
    # the identity-checked unregister still reports True and the domain leave runs.
    assert m.has_room("R") is True


def test_broadcast_unknown_room_is_noop():
    m = ConnectionManager()
    asyncio.run(m.broadcast("NOPE", {"x": 1}))  # no room, no error
    assert m.has_room("NOPE") is False


# --- detach: removing a participant's socket, whichever one it is (FR-21/D-47) ---


def test_detach_returns_the_socket_and_takes_it_out_of_the_fanout():
    m = ConnectionManager()
    a, b = FakeSocket(), FakeSocket()
    asyncio.run(m.register("R", "a", a))
    asyncio.run(m.register("R", "b", b))

    assert m.detach("R", "a") is a
    asyncio.run(m.broadcast("R", {"n": 1}))

    assert a.sent == []  # detached before the fan-out, so it saw nothing
    assert b.sent == [{"n": 1}]  # everyone else is untouched


def test_detach_does_not_close_the_socket_it_returns():
    """Deliberately synchronous and transport-only: the caller decides what to say on
    the way out (a removal notice, in apply_and_evict's case)."""
    m = ConnectionManager()
    a = FakeSocket()
    asyncio.run(m.register("R", "a", a))

    m.detach("R", "a")

    assert a.closed is False


def test_detach_drops_the_empty_per_room_map():
    m = ConnectionManager()
    a = FakeSocket()
    asyncio.run(m.register("R", "a", a))

    m.detach("R", "a")

    assert m.has_room("R") is False  # same cleanup unregister does


def test_detach_is_identity_blind_unlike_unregister():
    """The one behavioral difference, and the reason both exist. ``unregister`` is a
    handler retiring its OWN socket and must not touch a newer one; ``detach`` is a
    host removing a participant, where whichever socket represents them right now is
    the one that has to go — including a second one opened by the `attach`
    impersonation this phase accepts as a known limitation."""
    m = ConnectionManager()
    old, new = FakeSocket(), FakeSocket()
    asyncio.run(m.register("R", "p", old))
    asyncio.run(m.register("R", "p", new))  # new supersedes old

    assert m.unregister("R", "p", old) is False  # identity check refuses
    assert m.detach("R", "p") is new  # detach takes the live one regardless


def test_detach_after_detach_returns_none():
    """Idempotent, so a removal racing a disconnect cannot raise."""
    m = ConnectionManager()
    a = FakeSocket()
    asyncio.run(m.register("R", "a", a))

    assert m.detach("R", "a") is a
    assert m.detach("R", "a") is None


def test_detach_unknown_participant_or_room_returns_none():
    """A member who joined over HTTP and never attached a socket is a legitimate
    state, not an error — the host must still be able to remove them."""
    m = ConnectionManager()
    a = FakeSocket()
    asyncio.run(m.register("R", "a", a))

    assert m.detach("R", "never-attached") is None
    assert m.detach("NOPE", "a") is None
    assert m.has_room("R") is True  # and nothing else was disturbed
