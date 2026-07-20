"""how-much backend.

Transport plumbing (health + a placeholder echo WebSocket) plus the room HTTP
API. The real message protocol replaces the echo socket in S6.
"""

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.rooms.errors import (
    HostNotVoting,
    InvalidCard,
    NotHost,
    RoomError,
    RoomFull,
    UnknownParticipant,
)
from app.rooms.router import router as rooms_router

app = FastAPI(title="how-much", version="0.1.0")

# How each domain error maps to an HTTP status. 409 is a state conflict (the room
# won't accept the action as things stand), 422 an invalid value, 404 a missing
# referent, 403 a permission failure. Anything unmapped is a bug → 500.
_ROOM_ERROR_STATUS: dict[type[RoomError], int] = {
    RoomFull: 409,
    HostNotVoting: 409,
    InvalidCard: 422,
    UnknownParticipant: 404,
    NotHost: 403,
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
