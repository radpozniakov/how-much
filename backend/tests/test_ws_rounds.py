"""API tests for round actions over /ws/rooms/{code}.

Round frames dispatch to the domain and rebroadcast the RoomView (D-36). A frame
carries no participant_id — the action is attributed to the socket's handshake
identity — and a rejected action errors the offending socket only. Since D-50 this
is the only transport for a round action.

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
        ws.receive_json()

        ws.send_json({"type": "set_item", "topic": "Login page"})
        item = ws.receive_json()
        assert item["room"]["current_item"] == "Login page"

        ws.send_json({"type": "cast_vote", "card": "5"})
        voted = ws.receive_json()
        me = next(p for p in voted["room"]["participants"] if p["id"] == host_id)
        assert me["has_voted"] is True
        assert voted["room"]["results"] is None

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
    """A round frame carries no participant_id; a spoofed one is ignored and the vote
    is attributed to the connected socket."""
    code, host_id = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()
        ws.send_json({"type": "cast_vote", "card": "8", "participant_id": "evil"})
        ws.receive_json()
        room = store.get(code)
        assert room.votes.get(host_id) == "8"
        assert "evil" not in room.votes


def test_rejected_action_errors_sender_only(client):
    """A non-host reveal errors the sender; the other socket sees no broadcast and
    the domain is unchanged (no broadcast-on-failure)."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")
    with client.websocket_connect(f"/ws/rooms/{code}") as host_ws:
        host_ws.send_json({"type": "attach", "participant_id": host_id})
        host_ws.receive_json()
        with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
            bob_ws.send_json({"type": "attach", "participant_id": bob_id})
            bob_ws.receive_json()
            host_ws.receive_json()

            bob_ws.send_json({"type": "reveal"})
            err = bob_ws.receive_json()
            assert err["type"] == "error" and err["reason"] == "not_host"
            assert store.get(code).revealed is False

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
        ws.receive_json()
        ws.send_json({"type": "cast_vote", "card": "5"})
        err = ws.receive_json()
    assert err["type"] == "error" and err["reason"] == "host_not_voting"


def test_ws_reveal_reflects_to_second_socket(client):
    """D-36 other direction: a WS reveal reaches a second socket and the domain."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")
    with client.websocket_connect(f"/ws/rooms/{code}") as host_ws:
        host_ws.send_json({"type": "attach", "participant_id": host_id})
        host_ws.receive_json()
        with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
            bob_ws.send_json({"type": "attach", "participant_id": bob_id})
            bob_ws.receive_json()
            host_ws.receive_json()

            host_ws.send_json({"type": "reveal"})
            host_ws.receive_json()
            bob_frame = bob_ws.receive_json()
    assert bob_frame["room"]["revealed"] is True
    assert store.get(code).revealed is True


def test_over_long_topic_over_ws_is_bad_request(client):
    """`messages.SetItemFrame` enforces MAX_TOPIC_LENGTH at the frame boundary, since
    `Room.set_item` only trims. The over-long topic is a bad_request and the socket
    stays connected."""
    code, host_id = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()
        ws.send_json({"type": "set_item", "topic": "x" * 5000})
        err = ws.receive_json()
        assert err["type"] == "error" and err["reason"] == "bad_request"
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
        ws.send_json({"type": "reveal"})
        ok = ws.receive_json()
    assert ok["room"]["revealed"] is True


def test_action_after_participant_vanishes_errors_not_in_room(client):
    """A participant who left while its socket stays open gets a not_in_room error on
    its next action rather than crashing.

    Goes through ``store.leave`` directly because that is now the only way to reach
    this state: a host removal (D-47) detaches the socket as it goes. What matters is
    the dispatch path being handed a stale identity, not how it went stale."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")
    with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
        bob_ws.send_json({"type": "attach", "participant_id": bob_id})
        bob_ws.receive_json()
        store.leave(store.get(code), bob_id)
        bob_ws.send_json({"type": "cast_vote", "card": "5"})
        err = bob_ws.receive_json()
    assert err["type"] == "error" and err["reason"] == "not_in_room"
    assert host_id in store.get(code).participants


def test_set_name_over_ws_fans_out_to_other_socket(client):
    """A participant renames itself over the socket; the new name appears in the
    room_state snapshot every connected client receives (self-service rename)."""
    code, host_id = _create(client, "Alice")
    bob_id = _join_http(client, code, "Bob")
    with client.websocket_connect(f"/ws/rooms/{code}") as host_ws:
        host_ws.send_json({"type": "attach", "participant_id": host_id})
        host_ws.receive_json()
        with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
            bob_ws.send_json({"type": "attach", "participant_id": bob_id})
            bob_ws.receive_json()
            host_ws.receive_json()

            bob_ws.send_json({"type": "set_name", "name": "Bobby"})
            bob_ws.receive_json()
            host_frame = host_ws.receive_json()
            bob = next(
                p for p in host_frame["room"]["participants"] if p["id"] == bob_id
            )
            assert host_frame["type"] == "room_state" and bob["name"] == "Bobby"
            assert store.get(code).participants[bob_id].name == "Bobby"


def test_set_name_uses_connection_identity_not_payload(client):
    """set_name carries no participant_id; a spoofed one is ignored — the rename
    applies to the connected socket's own identity, never someone else's."""
    code, host_id = _create(client, "Alice")
    bob_id = _join_http(client, code, "Bob")
    with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
        bob_ws.send_json({"type": "attach", "participant_id": bob_id})
        bob_ws.receive_json()
        bob_ws.send_json(
            {"type": "set_name", "name": "Hacker", "participant_id": host_id}
        )
        bob_ws.receive_json()
        room = store.get(code)
        assert room.participants[bob_id].name == "Hacker"
        assert room.participants[host_id].name == "Alice"


def test_set_name_trims_and_bounds_over_ws(client):
    """The set_name frame trims like JoinFrame; a blank/whitespace name is a
    bad_request and does not disconnect the socket."""
    code, host_id = _create(client, "Alice")
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()

        ws.send_json({"type": "set_name", "name": "   "})
        err = ws.receive_json()
        assert err["type"] == "error" and err["reason"] == "bad_request"

        ws.send_json({"type": "set_name", "name": "  Ada  "})
        ok = ws.receive_json()
    me = next(p for p in ok["room"]["participants"] if p["id"] == host_id)
    assert me["name"] == "Ada"


def test_over_long_name_over_ws_is_bad_request(client):
    """The set_name frame enforces MAX_DISPLAY_NAME_LENGTH; an over-long name is
    rejected as bad_request and the socket stays usable."""
    code, host_id = _create(client, "Alice")
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()
        ws.send_json({"type": "set_name", "name": "x" * 5000})
        err = ws.receive_json()
        assert err["type"] == "error" and err["reason"] == "bad_request"
        ws.send_json({"type": "set_name", "name": "ok"})
        ok = ws.receive_json()
    me = next(p for p in ok["room"]["participants"] if p["id"] == host_id)
    assert me["name"] == "ok"


def test_action_after_room_swept_errors_room_not_found(client):
    """If the room is gone mid-session, a round action is answered room_not_found
    rather than dispatching on None."""
    code, host_id = _create(client)
    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()
        store.clear()
        ws.send_json({"type": "reveal"})
        err = ws.receive_json()
    assert err["type"] == "error" and err["reason"] == "room_not_found"
