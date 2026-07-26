"""how-much backend.

Transport plumbing (health + the room WebSocket + a placeholder echo socket) plus
the room HTTP API. Real-time presence lands in S6a via ``ws_router``, and the round
message protocol (set_item/cast_vote/…/reveal/reset) lands over the same socket in
S6b — the HTTP round routes stay alongside it (D-35) until the frontend exercises
the socket path. The placeholder ``/ws`` echo stays until S10.
"""

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import config
from app.rooms.errors import (
    CannotTargetSelf,
    HostNotVoting,
    InvalidCard,
    NotHost,
    RoomError,
    RoomFull,
    RoundRevealed,
    UnknownParticipant,
)
from app.rooms.router import router as rooms_router
from app.rooms.store import store
from app.rooms.ws import ws_router


def _configure_logging(level: int = logging.INFO) -> None:
    """Make ``app.*`` log records actually surface (S23 constraint 4).

    Without this nothing in ``app.*`` is ever emitted: the root logger defaults to
    ``WARNING`` with no handlers, and uvicorn's default ``LOGGING_CONFIG`` declares
    handlers for its own ``uvicorn*`` loggers only — it sets no root handler and
    does not touch the root level. So the handover audit trail would exist in the
    source and nowhere else. (This is why ``connection.py``'s ``logger.debug`` has
    never emitted anything either, despite its comment.)

    The level is set **unconditionally** and the handler added **only** when root
    has none. That split is what makes this work in both environments, and it is
    deliberately *not* ``logging.basicConfig``: basicConfig returns early when root
    already holds any handler, and on that path it skips the level too — so under
    pytest, whose plugin attaches capture handlers before this module is imported,
    it would configure nothing at all and silently defeat the guard in
    ``tests/test_logging_config.py``. Here the conditional handler leaves a test
    harness's own capture in place while the level still applies.

    One stream at one level is all this app has to say; a real config with an
    env-read level knob belongs to S10's deployment work, per D-30 (only
    genuinely-varying values become env-read).
    """
    root = logging.getLogger()
    root.setLevel(level)
    if not root.handlers:  # uvicorn leaves root bare; pytest does not
        root.addHandler(logging.StreamHandler())


_configure_logging()


async def _sweeper(interval: float) -> None:
    """Periodically reclaim empty rooms past their grace period (S6a).

    Calls ``store.sweep`` **by attribute each iteration** — not via a captured
    default argument — so it always uses the live ``store.sweep`` (and any test
    monkeypatch of it) rather than a reference frozen at import time."""
    while True:
        await asyncio.sleep(interval)
        store.sweep()


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Run the background room sweeper for the app's lifetime (S6a)."""
    task = asyncio.create_task(_sweeper(config.SWEEP_INTERVAL_SECONDS))
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="how-much", version="0.1.0", lifespan=lifespan)

# How each domain error maps to an HTTP status. 409 is a state conflict (the room
# won't accept the action as things stand), 422 an invalid value, 404 a missing
# referent, 403 a permission failure. Anything unmapped is a bug → 500.
_ROOM_ERROR_STATUS: dict[type[RoomError], int] = {
    RoomFull: 409,
    HostNotVoting: 409,
    RoundRevealed: 409,
    InvalidCard: 422,
    UnknownParticipant: 404,
    NotHost: 403,
    # Unreachable over HTTP today — handover is WS-only (there is no HTTP route for
    # it, and D-35's dual-transport period is spent). Mapped anyway so this table
    # stays a complete statement of how domain errors translate, rather than one a
    # future HTTP route would silently fall through to 500.
    CannotTargetSelf: 422,
}


@app.exception_handler(RoomError)
async def _room_error_handler(_request: Request, exc: RoomError) -> JSONResponse:
    """Translate any domain error to its status code with a ``detail`` body,
    matching the shape FastAPI uses for ``HTTPException``. Registered on the base
    class, so it catches every :class:`RoomError` subtype."""
    status = _ROOM_ERROR_STATUS.get(type(exc), 500)
    return JSONResponse(status_code=status, content={"detail": str(exc)})


# Dev-permissive CORS so the Vite frontend (localhost:5173) can call the API
# from the browser. Tighten to explicit origins before any real deployment (T9).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rooms_router)
app.include_router(ws_router)


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness check used by the frontend and compose."""
    return {"status": "ok"}


@app.websocket("/ws")
async def ws(websocket: WebSocket) -> None:
    """Placeholder WebSocket: accepts a connection and echoes each message.

    Proves the transport works end to end. Replaced by the real message
    protocol in T2.
    """
    await websocket.accept()
    await websocket.send_json({"type": "hello", "message": "how-much ws connected"})
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_json({"type": "echo", "message": data})
    except WebSocketDisconnect:
        pass
