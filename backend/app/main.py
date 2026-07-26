"""how-much backend.

Transport plumbing (health + the room WebSocket) plus the two-route room HTTP API.
Presence and the round message protocol (set_item/cast_vote/…/reveal/reset) both
run over ``ws_router``'s socket, which since D-50 is the only transport for
anything past the handshake: the HTTP round routes and the placeholder ``/ws``
echo were retired once the frontend had proven the socket path.
"""

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator

from fastapi import FastAPI, Request
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
#
# **Only ``RoomFull`` is reachable over HTTP now** (raised by ``store.join``). D-50
# left two routes standing — create and join — and every other entry below belongs
# to an action that is WS-only: the round frames, the handover (D-45), the removal
# (D-47). The table is deliberately kept complete rather than pruned to the one row
# that fires. Its value was never coverage of today's routes; it is that a domain
# error translates to a *considered* status wherever it surfaces, so adding an HTTP
# route later cannot silently fall through to a 500. Pruning would convert this from
# a statement about the error type to a statement about the current route list —
# which is exactly the coupling that made the retired routes worth retiring.
_ROOM_ERROR_STATUS: dict[type[RoomError], int] = {
    RoomFull: 409,
    HostNotVoting: 409,
    RoundRevealed: 409,
    InvalidCard: 422,
    UnknownParticipant: 404,
    NotHost: 403,
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
