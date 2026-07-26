"""API-level tests for removing a participant over /ws/rooms/{code} (FR-21/D-47).

The frame mirrors ``transfer_host``: a ``target_id`` and no actor id, so the actor is
the socket's handshake identity (S23 constraint 2), authorization is the domain's
``_require_host`` (constraint 1), and both outcomes are logged (constraint 4).

What makes this file worth having beyond test_removal_domain.py is the half the
domain cannot see: the removed participant's socket has to go, they have to be told
why, and their handler's ``finally`` must not then run a second leave for someone
already gone. Those are ``apply_and_evict``'s three ordered steps, and each one has a
test below that fails if the order changes.

Uses the synchronous ``TestClient.websocket_connect``, as test_ws_handover.py does.
"""

import logging

import pytest
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


def test_removal_fans_out_the_smaller_room_to_the_survivors(client):
    """The remaining clients get one snapshot without the removed participant, and
    the domain agrees (D-36)."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")
    carol_id = _join_http(client, code, "Carol")

    with client.websocket_connect(f"/ws/rooms/{code}") as host_ws:
        host_ws.send_json({"type": "attach", "participant_id": host_id})
        host_ws.receive_json()

        with client.websocket_connect(f"/ws/rooms/{code}") as carol_ws:
            carol_ws.send_json({"type": "attach", "participant_id": carol_id})
            carol_ws.receive_json()
            host_ws.receive_json()  # Carol's join fan-out

            host_ws.send_json({"type": "remove_participant", "target_id": bob_id})
            on_host = host_ws.receive_json()
            on_carol = carol_ws.receive_json()

            for frame in (on_host, on_carol):
                assert frame["type"] == "room_state"
                ids = [p["id"] for p in frame["room"]["participants"]]
                assert bob_id not in ids
                assert set(ids) == {host_id, carol_id}

            # Checked INSIDE the sockets' scope: closing them is a leave.
            assert bob_id not in store.get(code).participants


def test_removed_participant_is_told_why_then_disconnected(client):
    """Step 3 of apply_and_evict: the notice, then the close. Both halves matter — a
    close with no frame is indistinguishable from a network drop, and a frame with no
    close leaves them holding a socket into a room they are not in."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")

    with client.websocket_connect(f"/ws/rooms/{code}") as host_ws:
        host_ws.send_json({"type": "attach", "participant_id": host_id})
        host_ws.receive_json()

        with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
            bob_ws.send_json({"type": "attach", "participant_id": bob_id})
            bob_ws.receive_json()
            host_ws.receive_json()  # Bob's join fan-out

            host_ws.send_json({"type": "remove_participant", "target_id": bob_id})

            notice = bob_ws.receive_json()
            assert notice["type"] == "error"
            assert notice["reason"] == "removed"
            assert notice["message"]  # something renderable, whatever S22 settles on

            with pytest.raises(WebSocketDisconnect):
                bob_ws.receive_json()


def test_removed_participant_gets_no_snapshot_of_a_room_without_them(client):
    """Step 2, and the reason detach comes *before* the broadcast: the notice must be
    the very next frame on that socket. If the broadcast reached them first, their UI
    would render a room they are not in — no name in the header, no card of their own
    — for the tick before the notice landed. Nothing in that state is true.

    This is the test that fails if the two lines in apply_and_evict are swapped."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")

    with client.websocket_connect(f"/ws/rooms/{code}") as host_ws:
        host_ws.send_json({"type": "attach", "participant_id": host_id})
        host_ws.receive_json()

        with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
            bob_ws.send_json({"type": "attach", "participant_id": bob_id})
            bob_ws.receive_json()
            host_ws.receive_json()

            host_ws.send_json({"type": "remove_participant", "target_id": bob_id})

            # The FIRST frame, not merely some frame: asserted as an equality on the
            # type so a leading room_state fails here rather than being skipped over.
            assert bob_ws.receive_json()["type"] == "error"


def test_removal_deregisters_the_socket_so_no_second_leave_runs(client):
    """Step 2's other half — the teardown hazard doc/07 flagged. The removed socket
    still reaches its own ``finally``, but ``unregister`` no longer finds it, so it
    skips the domain leave (already done) and emits no duplicate broadcast.

    Proven by what the host receives: exactly one snapshot for the removal, and then
    its own next action's snapshot. A stray fan-out from Bob's closing handler would
    land in between and this would read it as the reveal."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")

    with client.websocket_connect(f"/ws/rooms/{code}") as host_ws:
        host_ws.send_json({"type": "attach", "participant_id": host_id})
        host_ws.receive_json()

        with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
            bob_ws.send_json({"type": "attach", "participant_id": bob_id})
            bob_ws.receive_json()
            host_ws.receive_json()

            host_ws.send_json({"type": "remove_participant", "target_id": bob_id})
            removal = host_ws.receive_json()
            assert removal["type"] == "room_state"
            # Drain Bob's notice so the close below is not racing an unread frame.
            bob_ws.receive_json()

        # Bob's socket has now closed and its handler has run its finally.
        host_ws.send_json({"type": "reveal"})
        nxt = host_ws.receive_json()

    assert nxt["type"] == "room_state"
    assert nxt["room"]["revealed"] is True


def test_removal_of_an_http_only_participant_needs_no_socket(client):
    """``detach`` returning None is a legitimate state, not an error: someone who
    joined over HTTP and never attached a socket is still a member and still
    removable. The host's fan-out must be unaffected."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")  # never opens a socket

    with client.websocket_connect(f"/ws/rooms/{code}") as host_ws:
        host_ws.send_json({"type": "attach", "participant_id": host_id})
        snapshot = host_ws.receive_json()
        assert bob_id in [p["id"] for p in snapshot["room"]["participants"]]

        host_ws.send_json({"type": "remove_participant", "target_id": bob_id})
        after = host_ws.receive_json()

        assert after["type"] == "room_state"
        assert bob_id not in [p["id"] for p in after["room"]["participants"]]


def test_removal_uses_connection_identity_not_payload(client):
    """A spoofed ``participant_id`` in the frame must not attribute the action to the
    host: Bob's socket is Bob, so this is a non-host attempt (constraint 2)."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")
    carol_id = _join_http(client, code, "Carol")

    with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
        bob_ws.send_json({"type": "attach", "participant_id": bob_id})
        bob_ws.receive_json()

        bob_ws.send_json(
            {
                "type": "remove_participant",
                "target_id": carol_id,
                "participant_id": host_id,  # ignored — the socket decides the actor
            }
        )
        err = bob_ws.receive_json()

        assert err["type"] == "error"
        assert err["reason"] == "not_host"
        assert carol_id in store.get(code).participants


def test_non_host_removal_errors_not_host_without_broadcast(client):
    """The rejection reaches the offending socket only; nobody else is touched — and
    critically, the intended target's socket stays open."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")
    carol_id = _join_http(client, code, "Carol")

    with client.websocket_connect(f"/ws/rooms/{code}") as carol_ws:
        carol_ws.send_json({"type": "attach", "participant_id": carol_id})
        carol_ws.receive_json()

        with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
            bob_ws.send_json({"type": "attach", "participant_id": bob_id})
            bob_ws.receive_json()
            carol_ws.receive_json()  # Bob's join fan-out

            bob_ws.send_json({"type": "remove_participant", "target_id": carol_id})
            err = bob_ws.receive_json()
            assert err["type"] == "error" and err["reason"] == "not_host"

            # A failed removal detaches nothing and broadcasts nothing, so Carol's
            # next frame is the snapshot from the HOST's action — not a notice and
            # not a stray fan-out from Bob's attempt.
            with client.websocket_connect(f"/ws/rooms/{code}") as host_ws:
                host_ws.send_json({"type": "attach", "participant_id": host_id})
                host_ws.receive_json()
                host_ws.send_json({"type": "set_item", "topic": "ok"})
                host_ws.receive_json()

                on_carol = carol_ws.receive_json()  # host's join fan-out
                assert on_carol["type"] == "room_state"
                on_carol = carol_ws.receive_json()  # the set_item
                assert on_carol["room"]["current_item"] == "ok"


def test_self_removal_errors_cannot_target_self(client):
    """Constraint 3: a host who wants out hands over first (FR-20), then leaves. The
    slug is shared with the handover; the message is not."""
    code, host_id = _create(client)
    _join_http(client, code, "Bob")

    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()

        ws.send_json({"type": "remove_participant", "target_id": host_id})
        err = ws.receive_json()

        assert err["type"] == "error"
        assert err["reason"] == "cannot_target_self"
        assert "remove yourself" in err["message"]
        assert host_id in store.get(code).participants


def test_unknown_target_errors_not_in_room_and_socket_survives(client):
    """A stale target is a real race (they left between snapshot and click), so it
    reuses ``not_in_room`` — and must NOT be terminal for the *host*: the client only
    treats that slug as fatal during handshake, never mid-session."""
    code, host_id = _create(client)

    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()

        ws.send_json({"type": "remove_participant", "target_id": "gone-already"})
        err = ws.receive_json()
        assert err["type"] == "error" and err["reason"] == "not_in_room"

        ws.send_json({"type": "reveal"})  # still usable
        ok = ws.receive_json()

    assert ok["type"] == "room_state"
    assert ok["room"]["revealed"] is True


def test_removal_after_reveal_rewrites_the_results_over_ws(client):
    """End to end: not locked post-reveal, and the round genuinely recomputes — the
    inverse of the handover's byte-identical guarantee, deliberately (D-47)."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")

    with client.websocket_connect(f"/ws/rooms/{code}") as host_ws:
        host_ws.send_json({"type": "attach", "participant_id": host_id})
        host_ws.receive_json()

        with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
            bob_ws.send_json({"type": "attach", "participant_id": bob_id})
            bob_ws.receive_json()
            host_ws.receive_json()

            host_ws.send_json({"type": "set_item", "topic": "Login page"})
            host_ws.receive_json()
            bob_ws.receive_json()
            host_ws.send_json({"type": "cast_vote", "card": "5"})
            host_ws.receive_json()
            bob_ws.receive_json()
            bob_ws.send_json({"type": "cast_vote", "card": "13"})
            host_ws.receive_json()
            bob_ws.receive_json()
            host_ws.send_json({"type": "reveal"})
            revealed = host_ws.receive_json()
            bob_ws.receive_json()
            assert revealed["room"]["results"]["consensus"] is False
            assert revealed["room"]["results"]["average"] == 9

            host_ws.send_json({"type": "remove_participant", "target_id": bob_id})
            after = host_ws.receive_json()
            bob_ws.receive_json()  # drain the notice

    assert after["type"] == "room_state"  # not an error frame
    assert after["room"]["revealed"] is True
    assert after["room"]["results"]["votes"] == {host_id: "5"}
    assert after["room"]["results"]["average"] == 5
    assert after["room"]["results"]["consensus"] is True


def test_removed_participant_cannot_reattach_with_the_same_id(client):
    """What the removed client's automatic reconnect would hit if it tried: their id
    is no longer a member, so ``attach`` is rejected exactly as a stale id is. This is
    why the notice has to be terminal on the client — otherwise the reconnect loop
    replaces "the host removed you" with "not in this room" a second later."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")

    with client.websocket_connect(f"/ws/rooms/{code}") as host_ws:
        host_ws.send_json({"type": "attach", "participant_id": host_id})
        host_ws.receive_json()
        host_ws.send_json({"type": "remove_participant", "target_id": bob_id})
        host_ws.receive_json()

        with client.websocket_connect(f"/ws/rooms/{code}") as retry:
            retry.send_json({"type": "attach", "participant_id": bob_id})
            err = retry.receive_json()
            assert err["type"] == "error" and err["reason"] == "not_in_room"


def test_removal_frees_a_seat_in_a_full_room(client):
    """FR-5 end to end: "remove someone to make room" has to actually work."""
    code, host_id = _create(client)
    ids = [_join_http(client, code, f"P{i}") for i in range(29)]
    full = client.post(f"/rooms/{code}/participants", json={"name": "X"})
    assert full.status_code == 409

    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()
        ws.send_json({"type": "remove_participant", "target_id": ids[0]})
        ws.receive_json()

        seated = client.post(f"/rooms/{code}/participants", json={"name": "X"})
        assert seated.status_code == 201


def test_successful_removal_is_logged(client, caplog):
    """Constraint 4: actor, target, room, and outcome all recorded."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")

    with (
        caplog.at_level(logging.INFO, logger="app.rooms.ws"),
        client.websocket_connect(f"/ws/rooms/{code}") as ws,
    ):
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()
        ws.send_json({"type": "remove_participant", "target_id": bob_id})
        ws.receive_json()

    assert "participant removal" in caplog.text
    assert code in caplog.text
    assert host_id in caplog.text
    assert bob_id in caplog.text
    assert "outcome=ok" in caplog.text


def test_rejected_removal_is_logged(client, caplog):
    """ "Who tried" is as much of the session's history as "who succeeded" — and for
    a removal that matters more than for a handover, since this is the action a
    disgruntled member would attempt against the host."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")

    with (
        caplog.at_level(logging.INFO, logger="app.rooms.ws"),
        client.websocket_connect(f"/ws/rooms/{code}") as ws,
    ):
        ws.send_json({"type": "attach", "participant_id": bob_id})
        ws.receive_json()
        ws.send_json({"type": "remove_participant", "target_id": host_id})
        ws.receive_json()

    assert "participant removal rejected" in caplog.text
    assert code in caplog.text
    assert bob_id in caplog.text  # the actor, from the socket
    assert host_id in caplog.text  # the attempted target
    assert "NotHost" in caplog.text


def test_removal_and_handover_log_under_distinct_labels(client, caplog):
    """The two records share one wrapper, so the label is the only thing telling them
    apart in a log. Pinned: a session with both actions must stay explicable."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")
    carol_id = _join_http(client, code, "Carol")

    with (
        caplog.at_level(logging.INFO, logger="app.rooms.ws"),
        client.websocket_connect(f"/ws/rooms/{code}") as ws,
    ):
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()
        ws.send_json({"type": "remove_participant", "target_id": bob_id})
        ws.receive_json()
        ws.send_json({"type": "transfer_host", "target_id": carol_id})
        ws.receive_json()

    assert "participant removal: " in caplog.text
    assert "host handover: " in caplog.text


def test_missing_target_id_is_bad_request(client):
    """Pydantic rejects the frame at the transport boundary; the socket survives."""
    code, host_id = _create(client)

    with client.websocket_connect(f"/ws/rooms/{code}") as ws:
        ws.send_json({"type": "attach", "participant_id": host_id})
        ws.receive_json()

        ws.send_json({"type": "remove_participant"})  # no target_id
        err = ws.receive_json()
        assert err["type"] == "error" and err["reason"] == "bad_request"

        ws.send_json({"type": "reveal"})  # still usable
        ok = ws.receive_json()

    assert ok["room"]["revealed"] is True


def test_no_transport_evicts_a_participant_without_host_authority(client):
    """The D-50 regression guard: eviction requires host authority, whatever the door.

    V5's motivation was an HTTP route that reached this capability with no host check
    and no actor check, sitting beside a socket path that had three guards. Nothing in
    the suite asserted the *capability* rule transport-independently — the tests that
    happened to cover the HTTP door were about snapshot convergence and never checked
    authority, so deleting them left the rule itself unpinned. This states it directly,
    so a route re-added later fails here rather than shipping.

    Deliberately asserts on the roster, not on status codes: the point is that the
    participant survives, by whatever means the attempt is refused."""
    code, host_id = _create(client)
    bob_id = _join_http(client, code, "Bob")

    # Everything happens while Bob holds a live socket, so the attempts mirror the
    # real threat: a connected member trying to evict the host. (Bob leaves
    # legitimately when his socket closes, which is why the roster is asserted here
    # rather than after the block.)
    with client.websocket_connect(f"/ws/rooms/{code}") as bob_ws:
        bob_ws.send_json({"type": "attach", "participant_id": bob_id})
        bob_ws.receive_json()

        # 1. Over the socket, a non-host cannot evict the host.
        bob_ws.send_json({"type": "remove_participant", "target_id": host_id})
        err = bob_ws.receive_json()
        assert err["type"] == "error" and err["reason"] == "not_host"

        # 2. No HTTP verb reaches the capability at all — 404/405, never a 2xx.
        for verb in ("delete", "post", "put", "patch"):
            resp = getattr(client, verb)(f"/rooms/{code}/participants/{host_id}")
            assert resp.status_code in (404, 405), (
                f"{verb.upper()} reached a live handler"
            )

        room = store.get(code)
        assert host_id in room.participants  # survived every attempt
        assert bob_id in room.participants
        assert room.host_id == host_id  # and authority did not move
