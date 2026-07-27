"""how-much backend.

Transport plumbing (health + the room WebSocket) plus the two-route room HTTP API.
Presence and the round protocol both run over ``ws_router``'s socket, the only
transport for anything past the handshake (D-50).
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
    """Make ``app.*`` log records actually surface.

    Without this nothing in ``app.*`` is emitted: root defaults to ``WARNING`` with
    no handlers, and uvicorn's ``LOGGING_CONFIG`` touches only its own loggers.

    The level is set **unconditionally**; the handler is added **only** when root
    has none. Deliberately not ``logging.basicConfig``, which returns early — level
    included — if root already holds a handler, so under pytest (whose plugin
    attaches capture handlers first) it would configure nothing and silently defeat
    ``tests/test_logging_config.py``. The conditional handler leaves a test
    harness's capture in place while the level still applies.
    """
    root = logging.getLogger()
    root.setLevel(level)
    if not root.handlers:
        root.addHandler(logging.StreamHandler())


_configure_logging()


async def _sweeper(interval: float) -> None:
    """Periodically reclaim empty rooms past their grace period (D-18).

    Resolves ``store.sweep`` **by attribute each iteration**, so a test monkeypatch
    takes effect rather than a reference frozen at import time."""
    while True:
        await asyncio.sleep(interval)
        store.sweep()


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Run the background room sweeper for the app's lifetime."""
    task = asyncio.create_task(_sweeper(config.SWEEP_INTERVAL_SECONDS))
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="how-much", version="0.1.0", lifespan=lifespan)

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
    """Translate a domain error to its status code with a ``detail`` body, matching
    FastAPI's ``HTTPException`` shape. Registered on the base class, so it catches
    every :class:`RoomError` subtype."""
    status = _ROOM_ERROR_STATUS.get(type(exc), 500)
    return JSONResponse(status_code=status, content={"detail": str(exc)})


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
