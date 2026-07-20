"""API-level tests for S4: POST /rooms/{code}/reveal and /reset.

Lean on the shared ``client`` fixture and the autouse store reset in conftest.
The room always has its creator/host from the create call (D-32).
"""


def _create(client, name: str = "Host") -> dict:
    """Create a room; return {code, host_id}."""
    body = client.post("/rooms", json={"name": name}).json()
    return {"code": body["room"]["code"], "host_id": body["participant_id"]}


def _join(client, code: str, name: str) -> str:
    """Join a room and return the new participant's id."""
    return client.post(f"/rooms/{code}/participants", json={"name": name}).json()[
        "participant_id"
    ]


def _vote(client, code: str, pid: str, card: str):
    return client.put(f"/rooms/{code}/vote", json={"participant_id": pid, "card": card})


# --- reveal -----------------------------------------------------------------


def test_host_reveal_exposes_cards_and_stats(client):
    room = _create(client)
    alice = _join(client, room["code"], "Alice")
    bob = _join(client, room["code"], "Bob")
    _vote(client, room["code"], room["host_id"], "5")
    _vote(client, room["code"], alice, "5")
    _vote(client, room["code"], bob, "8")

    body = client.post(
        f"/rooms/{room['code']}/reveal",
        json={"participant_id": room["host_id"]},
    ).json()

    assert body["revealed"] is True
    results = body["results"]
    assert results is not None
    assert results["votes"] == {room["host_id"]: "5", alice: "5", bob: "8"}
    assert results["average"] == 6.0
    assert results["consensus"] is False


def test_reveal_reaches_consensus(client):
    room = _create(client)
    alice = _join(client, room["code"], "Alice")
    _vote(client, room["code"], room["host_id"], "3")
    _vote(client, room["code"], alice, "3")
    body = client.post(
        f"/rooms/{room['code']}/reveal", json={"participant_id": room["host_id"]}
    ).json()
    assert body["results"]["consensus"] is True
    assert body["results"]["average"] == 3.0


def test_non_host_reveal_forbidden(client):
    room = _create(client)
    other = _join(client, room["code"], "Other")
    resp = client.post(f"/rooms/{room['code']}/reveal", json={"participant_id": other})
    assert resp.status_code == 403


def test_reveal_unknown_room_is_404(client):
    resp = client.post("/rooms/NOPE99/reveal", json={"participant_id": "whoever"})
    assert resp.status_code == 404


# --- pre-reveal privacy (FR-10) ---------------------------------------------


def test_results_absent_and_no_values_pre_reveal(client):
    room = _create(client)
    alice = _join(client, room["code"], "Alice")
    submitted = "13"
    body = _vote(client, room["code"], alice, submitted).json()
    assert body["revealed"] is False
    assert body["results"] is None
    # The participant view is unchanged — presence only, never the value.
    for p in body["participants"]:
        assert set(p) == {"id", "name", "has_voted"}
        assert submitted not in p.values()


def test_vote_after_reveal_conflicts(client):
    room = _create(client)
    alice = _join(client, room["code"], "Alice")
    _vote(client, room["code"], alice, "5")
    client.post(
        f"/rooms/{room['code']}/reveal", json={"participant_id": room["host_id"]}
    )
    resp = _vote(client, room["code"], alice, "8")
    assert resp.status_code == 409


def test_set_item_after_reveal_conflicts(client):
    room = _create(client)
    client.post(
        f"/rooms/{room['code']}/reveal", json={"participant_id": room["host_id"]}
    )
    resp = client.put(
        f"/rooms/{room['code']}/item",
        json={"participant_id": room["host_id"], "topic": "Payment flow"},
    )
    assert resp.status_code == 409


def test_host_voting_after_reveal_conflicts(client):
    room = _create(client)
    client.post(
        f"/rooms/{room['code']}/reveal", json={"participant_id": room["host_id"]}
    )
    resp = client.put(
        f"/rooms/{room['code']}/host-voting",
        json={"participant_id": room["host_id"], "voting": False},
    )
    assert resp.status_code == 409


# --- reset ------------------------------------------------------------------


def test_reset_returns_clean_round(client):
    room = _create(client)
    alice = _join(client, room["code"], "Alice")
    client.put(
        f"/rooms/{room['code']}/item",
        json={"participant_id": room["host_id"], "topic": "Login flow"},
    )
    _vote(client, room["code"], alice, "8")
    client.post(
        f"/rooms/{room['code']}/reveal", json={"participant_id": room["host_id"]}
    )

    body = client.post(
        f"/rooms/{room['code']}/reset", json={"participant_id": room["host_id"]}
    ).json()

    assert body["current_item"] is None
    assert body["revealed"] is False
    assert body["results"] is None
    assert all(p["has_voted"] is False for p in body["participants"])


def test_non_host_reset_forbidden(client):
    room = _create(client)
    other = _join(client, room["code"], "Other")
    resp = client.post(f"/rooms/{room['code']}/reset", json={"participant_id": other})
    assert resp.status_code == 403


def test_reset_unknown_room_is_404(client):
    resp = client.post("/rooms/NOPE99/reset", json={"participant_id": "whoever"})
    assert resp.status_code == 404
