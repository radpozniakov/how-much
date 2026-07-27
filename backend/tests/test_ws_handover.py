"""API tests for host handover over /ws/rooms/{code} (FR-20/D-45).

The ``transfer_host`` frame carries a ``target_id`` and no actor id, so the actor is
the socket's handshake identity and authorization is the domain's ``_require_host``,
never the frontend's ``isHost``. The logging assertions cover the call and its four
fields; whether records surface at all is test_logging_config.py's job.
"""

import logging

from app.rooms.store import store


def _create(client, name: str = "Host") -> tuple[str, str]:
    """Create a room; return (code, host_participant_id)."""
    body = client.post("/rooms", json={"name": name}).json()
    return body["room"]["code"], body["participant_id"]


def _join_http(client, code: str, name: str) -> str:
    return client.post(f"/rooms/{code}/participants", json={"name": name}).json()[
        "participant_id"
    ]


def test_handover_over_ws_fans_out_to_both_sockets(client):
    """Both clients see the new host_id, and the domain agrees (D-36)."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")

    with client.websocket_connect(f"/ws/rooms/{code}") as host_ws:
        host_ws.send_json({"type": "attach", "participant_id": host_id})
        host_ws.receive_json()

        with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
            bob_ws.send_json({"type": "attach", "participant_id": bob_id})
            bob_ws.receive_json()
            host_ws.receive_json()

            host_ws.send_json({"type": "transfer_host", "target_id": bob_id})
            on_host = host_ws.receive_json()
            on_bob = bob_ws.receive_json()

            assert on_host["room"]["host_id"] == bob_id
            assert on_bob["room"]["host_id"] == bob_id
            assert store.get(code).host_id == bob_id


def test_handover_uses_connection_identity_not_payload(client):
    """A spoofed ``participant_id`` must not attribute the action to the host: Bob's
    socket is Bob, so this is a non-host attempt."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")

    with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
        bob_ws.send_json({"type": "attach", "participant_id": bob_id})
        bob_ws.receive_json()

        bob_ws.send_json(
            {
                "type": "transfer_host",
                "target_id": bob_id,
                "participant_id": host_id,
            }
        )
        err = bob_ws.receive_json()

        assert err["type"] == "error"
        assert err["reason"] == "not_host"
        assert store.get(code).host_id == host_id


def test_non_host_transfer_errors_not_host_without_broadcast(client):
    """The rejection reaches the offending socket only; nobody else is touched."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")

    with client.websocket_connect(f"/ws/rooms/{code}") as host_ws:
        host_ws.send_json({"type": "attach", "participant_id": host_id})
        host_ws.receive_json()

        with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
            bob_ws.send_json({"type": "attach", "participant_id": bob_id})
            bob_ws.receive_json()
            host_ws.receive_json()

            bob_ws.send_json({"type": "transfer_host", "target_id": host_id})
            err = bob_ws.receive_json()
            assert err["type"] == "error" and err["reason"] == "not_host"

            host_ws.send_json({"type": "set_item", "topic": "ok"})
            nxt = host_ws.receive_json()

    assert nxt["type"] == "room_state"
    assert nxt["room"]["current_item"] == "ok"


def test_self_target_errors_cannot_target_self(client):
    code, host_id = _create(client)
    _join_http(client, code, "Bob")

    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()

        ws.send_json({"type": "transfer_host", "target_id": host_id})
        err = ws.receive_json()

        assert err["type"] == "error"
        assert err["reason"] == "cannot_target_self"
        assert store.get(code).host_id == host_id


def test_unknown_target_errors_not_in_room_and_socket_survives(client):
    """A stale target is a real race, so it reuses ``not_in_room`` — and must NOT be
    terminal: the client treats that slug as fatal only at handshake."""
    code, host_id = _create(client)

    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()

        ws.send_json({"type": "transfer_host", "target_id": "gone-already"})
        err = ws.receive_json()
        assert err["type"] == "error" and err["reason"] == "not_in_room"

        ws.send_json({"type": "reveal"})
        ok = ws.receive_json()

    assert ok["type"] == "room_state"
    assert ok["room"]["revealed"] is True


def test_handover_after_reveal_succeeds_over_ws(client):
    """End to end: legal post-reveal, and the revealed results are unchanged."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")

    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()
        ws.send_json({"type": "set_item", "topic": "Login page"})
        ws.receive_json()
        ws.send_json({"type": "cast_vote", "card": "5"})
        ws.receive_json()
        ws.send_json({"type": "reveal"})
        revealed = ws.receive_json()
        before = revealed["room"]["results"]

        ws.send_json({"type": "transfer_host", "target_id": bob_id})
        after = ws.receive_json()

    assert after["type"] == "room_state"
    assert after["room"]["host_id"] == bob_id
    assert after["room"]["revealed"] is True
    assert after["room"]["results"] == before
    assert after["room"]["host_voting"] is True


def test_successful_handover_is_logged(client, caplog):
    """Actor, target, room, and outcome all recorded."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")

    with (
        caplog.at_level(logging.INFO, logger="app.rooms.ws"),
        client.websocket_connect(f"/ws/rooms/{code}") as ws,
    ):
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()
        ws.send_json({"type": "transfer_host", "target_id": bob_id})
        ws.receive_json()

    assert code in caplog.text
    assert host_id in caplog.text
    assert bob_id in caplog.text
    assert "outcome=ok" in caplog.text


def test_rejected_handover_is_logged(client, caplog):
    """Who tried is as much of the session's history as who succeeded."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")

    with (
        caplog.at_level(logging.INFO, logger="app.rooms.ws"),
        client.websocket_connect(f"/ws/rooms/{code}") as ws,
    ):
        ws.send_json({"type": "attach", "participant_id": bob_id})
        ws.receive_json()
        ws.send_json({"type": "transfer_host", "target_id": host_id})
        ws.receive_json()

    assert "rejected" in caplog.text
    assert code in caplog.text
    assert bob_id in caplog.text
    assert host_id in caplog.text
    assert "NotHost" in caplog.text


def test_missing_target_id_is_bad_request(client):
    """Pydantic rejects the frame at the transport boundary; the socket survives."""
    code, host_id = _create(client)

    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()

        ws.send_json({"type": "transfer_host"})
        err = ws.receive_json()
        assert err["type"] == "error" and err["reason"] == "bad_request"

        ws.send_json({"type": "reveal"})
        ok = ws.receive_json()

    assert ok["room"]["revealed"] is True
