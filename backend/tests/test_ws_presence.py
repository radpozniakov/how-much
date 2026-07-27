"""API tests for /ws/rooms/{code} presence over WebSocket.

Uses the synchronous ``TestClient.websocket_connect``; two concurrent sockets in one
room are nested context managers, and a server broadcast lands in the other
session's queue.

The shared ``client`` fixture is intentionally NOT context-managed, so the sweeper
lifespan does not run here — the autouse fixture resets the store instead.
"""

from app import config
from app.rooms.store import store
from starlette.websockets import WebSocketDisconnect


def _create(client, name: str = "Host") -> tuple[str, str]:
    """Create a room; return (code, host_participant_id)."""
    body = client.post("/rooms", json={"name": name}).json()
    return body["room"]["code"], body["participant_id"]


def _join_http(client, code: str, name: str) -> str:
    return client.post(f"/rooms/{code}/participants", json={"name": name}).json()[
        "participant_id"
    ]


def test_creator_attach_sees_self_as_host(client):
    code, host_id = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        frame = ws.receive_json()
    assert frame["type"] == "room_state"
    assert frame["room"]["host_id"] == host_id
    assert [p["id"] for p in frame["room"]["participants"]] == [host_id]


def test_join_fans_out_to_already_connected_client(client):
    code, host_id = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as host_ws:
        host_ws.send_json({"type": "attach", "participant_id": host_id})
        host_ws.receive_json()
        with client.websocket_connect(f"/ws/rooms/{code}") as joiner_ws:
            joiner_ws.send_json({"type": "join", "name": "Bob"})
            joined = joiner_ws.receive_json()
            host_update = host_ws.receive_json()
    assert joined["type"] == "room_state"
    assert any(p["name"] == "Bob" for p in joined["room"]["participants"])
    assert host_update["type"] == "room_state"
    assert any(p["name"] == "Bob" for p in host_update["room"]["participants"])


def test_unknown_room_rejected_and_not_created(client):
    with client.websocket_connect("/ws/rooms/NOPE99") as ws:
        ws.send_json({"type": "join", "name": "X"})
        frame = ws.receive_json()
    assert frame["type"] == "error"
    assert frame["reason"] == "room_not_found"
    assert len(store) == 0


def test_full_room_rejected(client):
    code, _ = _create(client)
    for i in range(config.ROOM_CAPACITY - 1):
        _join_http(client, code, f"P{i}")
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "join", "name": "Overflow"})
        frame = ws.receive_json()
    assert frame["type"] == "error"
    assert frame["reason"] == "room_full"
    assert len(store.get(code).participants) == config.ROOM_CAPACITY


def test_attach_unknown_participant_rejected(client):
    code, _ = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": "ghost"})
        frame = ws.receive_json()
    assert frame["type"] == "error"
    assert frame["reason"] == "not_in_room"


def test_malformed_first_frame_rejected(client):
    code, _ = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "nonsense"})
        frame = ws.receive_json()
    assert frame["type"] == "error"
    assert frame["reason"] == "bad_request"


def test_host_disconnect_transfers_host(client):
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")
    with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
        bob_ws.send_json({"type": "attach", "participant_id": bob_id})
        bob_ws.receive_json()
        with client.websocket_connect(f"/ws/rooms/{code}") as host_ws:
            host_ws.send_json({"type": "attach", "participant_id": host_id})
            host_ws.receive_json()
            bob_ws.receive_json()
        transfer = bob_ws.receive_json()
    assert transfer["type"] == "room_state"
    assert transfer["room"]["host_id"] == bob_id
    assert transfer["room"]["host_voting"] is True


def test_non_host_disconnect_removes_leaver(client):
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")
    with client.websocket_connect(f"/ws/rooms/{code}") as host_ws:
        host_ws.send_json({"type": "attach", "participant_id": host_id})
        host_ws.receive_json()
        with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
            bob_ws.send_json({"type": "attach", "participant_id": bob_id})
            bob_ws.receive_json()
            host_ws.receive_json()
        update = host_ws.receive_json()
    assert [p["id"] for p in update["room"]["participants"]] == [host_id]
    assert update["room"]["host_id"] == host_id


def test_http_join_reflects_to_socket(client):
    """D-36 in the one place still observable from outside the socket: the surviving
    HTTP join broadcasts to sockets already in the room. Kept because a broadcast on a
    *non-socket* mutation is the part that could silently regress."""
    code, host_id = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()
        _join_http(client, code, "Carol")
        joined = ws.receive_json()
    assert any(p["name"] == "Carol" for p in joined["room"]["participants"])


def test_duplicate_attach_keeps_participant_present(client):
    """Regression: a superseded socket must NOT remove the live participant."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")
    try:
        with client.websocket_connect(f"/ws/rooms/{code}") as sock_a:
            sock_a.send_json({"type": "attach", "participant_id": bob_id})
            sock_a.receive_json()
            with client.websocket_connect(f"/ws/rooms/{code}") as sock_b:
                sock_b.send_json({"type": "attach", "participant_id": bob_id})
                frame_b = sock_b.receive_json()
                assert any(p["id"] == bob_id for p in frame_b["room"]["participants"])
                assert bob_id in store.get(code).participants
    except WebSocketDisconnect:
        pass
    assert bob_id not in store.get(code).participants
    assert host_id in store.get(code).participants


def test_handshake_frame_mid_session_is_bad_request_and_stays_connected(client):
    """After the handshake, a stray join/attach is not a round frame — rejected as
    bad_request without dropping the live socket."""
    code, host_id = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()
        ws.send_json({"type": "join", "name": "Again"})
        first = ws.receive_json()
        ws.send_json({"type": "attach", "participant_id": host_id})
        second = ws.receive_json()
    assert first["type"] == "error" and first["reason"] == "bad_request"
    assert second["type"] == "error" and second["reason"] == "bad_request"


def test_room_state_carries_no_card_value_pre_reveal(client):
    """FR-10: the presence snapshot exposes has_voted, never the card value.

    The vote goes through the domain rather than a socket because the assertion is
    about the *handshake* snapshot, so it must predate the connection."""
    code, host_id = _create(client)
    store.get(code).cast_vote(host_id, "5")
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        frame = ws.receive_json()
    room = frame["room"]
    assert room["results"] is None
    assert all(
        set(p.keys()) == {"id", "name", "has_voted"} for p in room["participants"]
    )
    me = next(p for p in room["participants"] if p["id"] == host_id)
    assert me["has_voted"] is True
