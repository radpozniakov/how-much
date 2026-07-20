"""how-much backend — scaffold.

Only transport plumbing lives here for now: a health endpoint and a placeholder
WebSocket that echoes messages. Room/voting logic arrives in later backlog tasks.
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="how-much", version="0.1.0")

# Dev-permissive CORS so the Vite frontend (localhost:5173) can call the API
# from the browser. Tighten to explicit origins before any real deployment (T9).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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
