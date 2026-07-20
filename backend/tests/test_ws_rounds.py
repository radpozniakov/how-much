"""API-level tests for S6b: round actions over /ws/rooms/{code}.

Round frames (set_item, cast_vote, set_host_voting, reveal, reset) dispatch to
the domain and rebroadcast the RoomView (D-36). A frame carries no participant_id
— the action is attributed to the socket's own identity (established at
handshake). A rejected action returns an ``error`` frame to the offending socket
only. The S3/S4 HTTP round routes are retained (D-35) and now broadcast too, so a
``curl`` action reflects to connected sockets.

Uses the synchronous ``TestClient.websocket_connect``; a server broadcast lands in
a session's queue and is read by its ``receive_json``.
"""

from app.rooms.store import store


def _create(client, name: str = "Host") -> tuple[str, str]:
    """Create a room; return (code, host_participant_id)."""
    body = client.post("/rooms", json={"name": name}).json()
    return body["room"]["code"], body["participant_id"]


def _join_http(client, code: str, name: str) -> str:
    return client.post(f"/rooms/{code}/participants", json={"name": name}).json()[
        "participant_id"
    ]


def test_full_round_over_socket(client):
    """item -> vote -> reveal (cards + stats) -> reset, entirely over the socket."""
    code, host_id = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()  # own snapshot

        ws.send_json({"type": "set_item", "topic": "Login page"})
        item = ws.receive_json()
        assert item["room"]["current_item"] == "Login page"

        ws.send_json({"type": "cast_vote", "card": "5"})
        voted = ws.receive_json()
        me = next(p for p in voted["room"]["participants"] if p["id"] == host_id)
        assert me["has_voted"] is True
        assert voted["room"]["results"] is None  # value withheld pre-reveal (FR-10)

        ws.send_json({"type": "reveal"})
        revealed = ws.receive_json()
        assert revealed["room"]["revealed"] is True
        results = revealed["room"]["results"]
        assert results["votes"][host_id] == "5"
        assert results["average"] == 5.0
        assert results["consensus"] is True

        ws.send_json({"type": "reset"})
        reset = ws.receive_json()
    assert reset["room"]["revealed"] is False
    assert reset["room"]["current_item"] is None
    assert reset["room"]["results"] is None
    assert all(not p["has_voted"] for p in reset["room"]["participants"])


def test_frame_uses_connection_identity_not_payload(client):
    """A round frame carries no participant_id; a spoofed one is ignored — the
    vote is attributed to the connected socket (F2)."""
    code, host_id = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()
        # A bogus participant_id in the frame must not redirect the action.
        ws.send_json({"type": "cast_vote", "card": "8", "participant_id": "evil"})
        ws.receive_json()
        # Assert while still connected — the socket's leave on close drops the vote.
        room = store.get(code)
        assert room.votes.get(host_id) == "8"  # attributed to the socket's identity
        assert "evil" not in room.votes


def test_rejected_action_errors_sender_only(client):
    """A non-host reveal errors the sender; the other socket sees no broadcast and
    the domain is unchanged (no broadcast-on-failure)."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")
    with client.websocket_connect(f"/ws/rooms/{code}") as host_ws:
        host_ws.send_json({"type": "attach", "participant_id": host_id})
        host_ws.receive_json()  # own snapshot
        with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
            bob_ws.send_json({"type": "attach", "participant_id": bob_id})
            bob_ws.receive_json()  # bob's snapshot
            host_ws.receive_json()  # host sees bob attach

            bob_ws.send_json({"type": "reveal"})  # non-host
            err = bob_ws.receive_json()
            assert err["type"] == "error" and err["reason"] == "not_host"
            assert store.get(code).revealed is False  # rejected: no mutation

            # The host's NEXT frame must be a real broadcast, not a stray one from
            # bob's rejected reveal: host reveals legitimately and sees revealed.
            host_ws.send_json({"type": "reveal"})
            nxt = host_ws.receive_json()
    assert nxt["type"] == "room_state" and nxt["room"]["revealed"] is True


def test_bad_card_errors_with_invalid_card(client):
    code, host_id = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()
        ws.send_json({"type": "cast_vote", "card": "999"})
        err = ws.receive_json()
    assert err["type"] == "error" and err["reason"] == "invalid_card"


def test_post_reveal_vote_errors_with_round_revealed(client):
    code, host_id = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()
        ws.send_json({"type": "reveal"})
        ws.receive_json()
        ws.send_json({"type": "cast_vote", "card": "5"})
        err = ws.receive_json()
    assert err["type"] == "error" and err["reason"] == "round_revealed"


def test_host_not_voting_errors_with_host_not_voting(client):
    code, host_id = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()
        ws.send_json({"type": "set_host_voting", "voting": False})
        ws.receive_json()  # host_voting now False
        ws.send_json({"type": "cast_vote", "card": "5"})
        err = ws.receive_json()
    assert err["type"] == "error" and err["reason"] == "host_not_voting"


def test_http_vote_reflects_to_socket(client):
    """D-36: an HTTP PUT /vote reflects live to a connected socket."""
    code, host_id = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()  # own snapshot
        client.put(f"/rooms/{code}/vote", json={"participant_id": host_id, "card": "3"})
        frame = ws.receive_json()
    me = next(p for p in frame["room"]["participants"] if p["id"] == host_id)
    assert frame["type"] == "room_state" and me["has_voted"] is True


def test_all_http_round_routes_broadcast(client):
    """F1 regression: the 5 HTTP round routes each broadcast to a connected socket."""
    code, host_id = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()

        client.put(
            f"/rooms/{code}/item", json={"participant_id": host_id, "topic": "T"}
        )
        assert ws.receive_json()["room"]["current_item"] == "T"

        client.put(f"/rooms/{code}/vote", json={"participant_id": host_id, "card": "2"})
        assert any(p["has_voted"] for p in ws.receive_json()["room"]["participants"])

        client.put(
            f"/rooms/{code}/host-voting",
            json={"participant_id": host_id, "voting": False},
        )
        assert ws.receive_json()["room"]["host_voting"] is False

        client.post(f"/rooms/{code}/reveal", json={"participant_id": host_id})
        assert ws.receive_json()["room"]["revealed"] is True

        client.post(f"/rooms/{code}/reset", json={"participant_id": host_id})
        assert ws.receive_json()["room"]["revealed"] is False


def test_ws_reveal_reflects_to_second_socket(client):
    """D-36 other direction: a WS reveal reaches a second socket and the domain."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")
    with client.websocket_connect(f"/ws/rooms/{code}") as host_ws:
        host_ws.send_json({"type": "attach", "participant_id": host_id})
        host_ws.receive_json()
        with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
            bob_ws.send_json({"type": "attach", "participant_id": bob_id})
            bob_ws.receive_json()  # bob snapshot
            host_ws.receive_json()  # host sees bob attach

            host_ws.send_json({"type": "reveal"})
            host_ws.receive_json()  # host's own reveal broadcast
            bob_frame = bob_ws.receive_json()  # bob sees the reveal too
    assert bob_frame["room"]["revealed"] is True
    assert store.get(code).revealed is True  # domain is the source of truth


def test_over_long_topic_over_ws_is_bad_request(client):
    """F3: the WS set_item frame enforces MAX_TOPIC_LENGTH like the HTTP route; the
    over-long topic is rejected as bad_request (a frame validation failure) and the
    socket stays connected."""
    code, host_id = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()
        ws.send_json({"type": "set_item", "topic": "x" * 5000})
        err = ws.receive_json()
        assert err["type"] == "error" and err["reason"] == "bad_request"
        # still connected: a valid action still works
        ws.send_json({"type": "set_item", "topic": "ok"})
        ok = ws.receive_json()
    assert ok["room"]["current_item"] == "ok"


def test_malformed_round_frame_keeps_socket_alive(client):
    code, host_id = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()
        ws.send_json({"type": "not_a_round_action"})
        err = ws.receive_json()
        assert err["type"] == "error" and err["reason"] == "bad_request"
        ws.send_json({"type": "reveal"})  # still usable
        ok = ws.receive_json()
    assert ok["room"]["revealed"] is True


def test_action_after_http_delete_errors_not_in_room(client):
    """A participant removed over HTTP while its socket stays open gets a
    not_in_room error on its next action — no crash (risk R6)."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")
    with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
        bob_ws.send_json({"type": "attach", "participant_id": bob_id})
        bob_ws.receive_json()  # bob snapshot
        client.delete(f"/rooms/{code}/participants/{bob_id}")  # removed over HTTP
        bob_ws.receive_json()  # the delete broadcast
        bob_ws.send_json({"type": "cast_vote", "card": "5"})
        err = bob_ws.receive_json()
    assert err["type"] == "error" and err["reason"] == "not_in_room"
    assert host_id in store.get(code).participants  # host untouched


def test_action_after_room_swept_errors_room_not_found(client):
    """If the room is gone mid-session, a round action is answered room_not_found
    rather than dispatching on None (risk R1)."""
    code, host_id = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()
        store.clear()  # simulate the room being reclaimed while the socket is open
        ws.send_json({"type": "reveal"})
        err = ws.receive_json()
    assert err["type"] == "error" and err["reason"] == "room_not_found"
