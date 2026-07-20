"""API-level tests for S6a: /ws/rooms/{code} presence over WebSocket.

Uses the synchronous ``TestClient.websocket_connect``. Two concurrent sockets in
one room are exercised via nested context managers; a broadcast issued by the
server lands in the other session's queue and is read by its ``receive_json``.

The shared ``client`` fixture is intentionally NOT context-managed (see conftest),
so the background sweeper lifespan does not run here — presence tests don't need
it, and the store is reset per test by the autouse fixture.
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
        host_ws.receive_json()  # host's own snapshot
        with client.websocket_connect(f"/ws/rooms/{code}") as joiner_ws:
            joiner_ws.send_json({"type": "join", "name": "Bob"})
            joined = joiner_ws.receive_json()
            host_update = host_ws.receive_json()
    assert joined["type"] == "room_state"
    assert any(p["name"] == "Bob" for p in joined["room"]["participants"])
    # FR-17: the already-connected host sees the new participant live.
    assert host_update["type"] == "room_state"
    assert any(p["name"] == "Bob" for p in host_update["room"]["participants"])


def test_unknown_room_rejected_and_not_created(client):
    with client.websocket_connect("/ws/rooms/NOPE99") as ws:
        ws.send_json({"type": "join", "name": "X"})
        frame = ws.receive_json()
    assert frame["type"] == "error"
    assert frame["reason"] == "room_not_found"
    assert len(store) == 0  # no room conjured by the failed join


def test_full_room_rejected(client):
    code, _ = _create(client)  # host is participant #1
    for i in range(config.ROOM_CAPACITY - 1):
        _join_http(client, code, f"P{i}")  # fill to capacity
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
        bob_ws.receive_json()  # bob's own snapshot
        with client.websocket_connect(f"/ws/rooms/{code}") as host_ws:
            host_ws.send_json({"type": "attach", "participant_id": host_id})
            host_ws.receive_json()  # host's snapshot
            bob_ws.receive_json()  # bob sees host attach
        # host socket dropped -> leave -> auto-transfer (D-13/FR-7)
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
            host_ws.receive_json()  # host sees bob attach
        update = host_ws.receive_json()  # bob dropped
    assert [p["id"] for p in update["room"]["participants"]] == [host_id]
    assert update["room"]["host_id"] == host_id  # host unchanged


def test_http_presence_reflects_to_socket(client):
    """D-36: an HTTP-driven presence change broadcasts to connected sockets."""
    code, host_id = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()  # own snapshot
        carol_id = _join_http(client, code, "Carol")  # HTTP POST
        joined = ws.receive_json()
        client.delete(f"/rooms/{code}/participants/{carol_id}")  # HTTP DELETE
        left = ws.receive_json()
    assert any(p["name"] == "Carol" for p in joined["room"]["participants"])
    assert all(p["name"] != "Carol" for p in left["room"]["participants"])


def test_duplicate_attach_keeps_participant_present(client):
    """MF1 regression: a superseded socket must NOT remove the live participant."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")
    try:
        with client.websocket_connect(f"/ws/rooms/{code}") as sock_a:
            sock_a.send_json({"type": "attach", "participant_id": bob_id})
            sock_a.receive_json()  # A's snapshot
            with client.websocket_connect(f"/ws/rooms/{code}") as sock_b:
                sock_b.send_json({"type": "attach", "participant_id": bob_id})
                frame_b = sock_b.receive_json()
                # Bob is still in the room, now represented by socket B.
                assert any(p["id"] == bob_id for p in frame_b["room"]["participants"])
                # Domain truth: A's supersession did NOT remove Bob (the MF1 fix).
                # A's finally sees unregister -> False and skips store.leave.
                assert bob_id in store.get(code).participants
    except WebSocketDisconnect:
        pass  # socket A is force-closed by the server; ignore its close on exit
    # Once the live socket B also drops, Bob legitimately leaves — the room is
    # empty of Bob but the host participant remains.
    assert bob_id not in store.get(code).participants
    assert host_id in store.get(code).participants


def test_http_delete_while_connected_net_effect(client):
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")
    with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
        bob_ws.send_json({"type": "attach", "participant_id": bob_id})
        bob_ws.receive_json()
        client.delete(f"/rooms/{code}/participants/{bob_id}")  # DELETE while connected
        frame = bob_ws.receive_json()
        assert all(p["id"] != bob_id for p in frame["room"]["participants"])
    # bob_ws then drops: its finally's store.leave raises UnknownParticipant (bob
    # already gone) and is swallowed — no crash, host still present, one removal.
    room = store.get(code)
    assert bob_id not in room.participants
    assert host_id in room.participants


def test_handshake_frame_mid_session_is_bad_request_and_stays_connected(client):
    """After the handshake, a stray join/attach is not a round frame (S6b) — it is
    rejected as bad_request without dropping the live socket."""
    code, host_id = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()  # room_state
        ws.send_json({"type": "join", "name": "Again"})
        first = ws.receive_json()
        ws.send_json({"type": "attach", "participant_id": host_id})
        second = ws.receive_json()
    assert first["type"] == "error" and first["reason"] == "bad_request"
    assert second["type"] == "error" and second["reason"] == "bad_request"


def test_room_state_carries_no_card_value_pre_reveal(client):
    """FR-10: presence snapshot exposes has_voted, never the card value."""
    code, host_id = _create(client)
    client.put(f"/rooms/{code}/vote", json={"participant_id": host_id, "card": "5"})
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        frame = ws.receive_json()
    room = frame["room"]
    assert room["results"] is None  # no results payload pre-reveal
    assert all(
        set(p.keys()) == {"id", "name", "has_voted"} for p in room["participants"]
    )
    me = next(p for p in room["participants"] if p["id"] == host_id)
    assert me["has_voted"] is True  # presence shown, value withheld
