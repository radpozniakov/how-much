"""API-level tests for the voting round: PUT /rooms/{code}/item, /vote,
/host-voting.

The room always has its creator/host from the create call (D-32). These tests
lean on the shared ``client`` fixture and the autouse store reset in conftest.
"""

from app import config


def _create(client, name: str = "Host") -> dict:
    """Create a room; return {code, host_id}."""
    body = client.post("/rooms", json={"name": name}).json()
    return {"code": body["room"]["code"], "host_id": body["participant_id"]}


def _join(client, code: str, name: str) -> str:
    """Join a room and return the new participant's id."""
    return client.post(f"/rooms/{code}/participants", json={"name": name}).json()[
        "participant_id"
    ]


def _participant(room: dict, pid: str) -> dict:
    return next(p for p in room["participants"] if p["id"] == pid)


# --- item -------------------------------------------------------------------


def test_host_sets_topic_reflected_in_view(client):
    room = _create(client)
    resp = client.put(
        f"/rooms/{room['code']}/item",
        json={"participant_id": room["host_id"], "topic": "  Login flow  "},
    )
    assert resp.status_code == 200
    assert resp.json()["current_item"] == "Login flow"


def test_blank_topic_clears_to_null(client):
    room = _create(client)
    client.put(
        f"/rooms/{room['code']}/item",
        json={"participant_id": room["host_id"], "topic": "Something"},
    )
    body = client.put(
        f"/rooms/{room['code']}/item",
        json={"participant_id": room["host_id"], "topic": "   "},
    ).json()
    assert body["current_item"] is None


def test_overlong_topic_rejected(client):
    room = _create(client)
    resp = client.put(
        f"/rooms/{room['code']}/item",
        json={
            "participant_id": room["host_id"],
            "topic": "x" * (config.MAX_TOPIC_LENGTH + 1),
        },
    )
    assert resp.status_code == 422


def test_non_host_set_item_forbidden(client):
    room = _create(client)
    other = _join(client, room["code"], "Other")
    resp = client.put(
        f"/rooms/{room['code']}/item",
        json={"participant_id": other, "topic": "nope"},
    )
    assert resp.status_code == 403


# --- voting -----------------------------------------------------------------


def test_cast_vote_sets_has_voted_only(client):
    room = _create(client)
    alice = _join(client, room["code"], "Alice")
    body = client.put(
        f"/rooms/{room['code']}/vote",
        json={"participant_id": alice, "card": "8"},
    ).json()
    assert _participant(body, alice)["has_voted"] is True
    # The host has not voted yet.
    assert _participant(body, room["host_id"])["has_voted"] is False


def test_revote_overwrites_via_api(client):
    room = _create(client)
    alice = _join(client, room["code"], "Alice")
    client.put(
        f"/rooms/{room['code']}/vote", json={"participant_id": alice, "card": "3"}
    )
    body = client.put(
        f"/rooms/{room['code']}/vote", json={"participant_id": alice, "card": "13"}
    ).json()
    # Still exactly one participant flagged as voted (Alice), value not leaked.
    voted = [p["id"] for p in body["participants"] if p["has_voted"]]
    assert voted == [alice]


def test_vote_value_never_leaked_pre_reveal(client):
    """AC-3, structural: the view exposes presence, never the card value."""
    room = _create(client)
    alice = _join(client, room["code"], "Alice")
    submitted = "13"
    body = client.put(
        f"/rooms/{room['code']}/vote",
        json={"participant_id": alice, "card": submitted},
    ).json()
    for p in body["participants"]:
        # No value/card key exists on the participant view at all...
        assert set(p) == {"id", "name", "has_voted"}
        assert "value" not in p and "card" not in p
        assert isinstance(p["has_voted"], bool)
        # ...and no field's value equals the submitted card.
        assert submitted not in p.values()
    # And the top-level room view carries no votes mapping.
    assert "votes" not in body


def test_invalid_card_rejected_via_api(client):
    from app.rooms.store import store

    room = _create(client)
    alice = _join(client, room["code"], "Alice")
    for bad in ("40", "100", "?", "4"):
        resp = client.put(
            f"/rooms/{room['code']}/vote",
            json={"participant_id": alice, "card": bad},
        )
        assert resp.status_code == 422, bad
    # Nothing was recorded.
    assert alice not in store.get(room["code"]).votes


def test_unknown_participant_vote_is_404(client):
    room = _create(client)
    resp = client.put(
        f"/rooms/{room['code']}/vote",
        json={"participant_id": "ghost-id", "card": "5"},
    )
    assert resp.status_code == 404


def test_vote_unknown_room_is_404(client):
    resp = client.put(
        "/rooms/NOPE99/vote", json={"participant_id": "whoever", "card": "5"}
    )
    assert resp.status_code == 404


# --- host voting toggle -----------------------------------------------------


def test_host_opt_out_then_vote_conflicts(client):
    room = _create(client)
    toggled = client.put(
        f"/rooms/{room['code']}/host-voting",
        json={"participant_id": room["host_id"], "voting": False},
    ).json()
    assert toggled["host_voting"] is False
    resp = client.put(
        f"/rooms/{room['code']}/vote",
        json={"participant_id": room["host_id"], "card": "5"},
    )
    assert resp.status_code == 409


def test_opting_out_drops_host_vote_via_api(client):
    room = _create(client)
    client.put(
        f"/rooms/{room['code']}/vote",
        json={"participant_id": room["host_id"], "card": "5"},
    )
    body = client.put(
        f"/rooms/{room['code']}/host-voting",
        json={"participant_id": room["host_id"], "voting": False},
    ).json()
    assert _participant(body, room["host_id"])["has_voted"] is False


def test_non_host_toggle_forbidden(client):
    room = _create(client)
    other = _join(client, room["code"], "Other")
    resp = client.put(
        f"/rooms/{room['code']}/host-voting",
        json={"participant_id": other, "voting": False},
    )
    assert resp.status_code == 403
