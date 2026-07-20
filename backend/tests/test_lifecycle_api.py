"""API-level tests for S5: DELETE /rooms/{code}/participants/{participant_id}.

Lean on the shared ``client`` fixture and the autouse store reset in conftest.
The singleton keeps the default (real) clock; these tests never fast-forward
time — timing is covered at the store level (see test_lifecycle_domain).
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


def _leave(client, code: str, pid: str):
    return client.delete(f"/rooms/{code}/participants/{pid}")


def test_leave_removes_participant_from_roster(client):
    room = _create(client)
    alice = _join(client, room["code"], "Alice")
    body = _leave(client, room["code"], alice).json()
    ids = [p["id"] for p in body["participants"]]
    assert alice not in ids
    assert room["host_id"] in ids
    assert all(set(p) == {"id", "name", "has_voted"} for p in body["participants"])


def test_leave_returns_200_and_room_view(client):
    room = _create(client)
    alice = _join(client, room["code"], "Alice")
    resp = _leave(client, room["code"], alice)
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {
        "code",
        "host_id",
        "participants",
        "current_item",
        "host_voting",
        "revealed",
        "results",
    }


def test_host_leave_transfers_host(client):
    room = _create(client)
    alice = _join(client, room["code"], "Alice")
    body = _leave(client, room["code"], room["host_id"]).json()
    assert body["host_id"] == alice


def test_leave_last_participant_empties_room(client):
    room = _create(client)
    body = _leave(client, room["code"], room["host_id"]).json()
    assert body["participants"] == []
    assert body["host_id"] is None


def test_leave_unknown_room_is_404(client):
    resp = client.delete("/rooms/NOPE99/participants/whoever")
    assert resp.status_code == 404


def test_leave_unknown_participant_is_404(client):
    room = _create(client)
    resp = _leave(client, room["code"], "ghost-id")
    assert resp.status_code == 404


def test_double_leave_is_404(client):
    room = _create(client)
    alice = _join(client, room["code"], "Alice")
    assert _leave(client, room["code"], alice).status_code == 200
    assert _leave(client, room["code"], alice).status_code == 404


def test_rejoin_within_grace_succeeds(client):
    room = _create(client)
    _leave(client, room["code"], room["host_id"])
    resp = client.post(f"/rooms/{room['code']}/participants", json={"name": "Rejoiner"})
    assert resp.status_code == 201
    rejoiner = resp.json()["participant_id"]
    view = client.post(
        f"/rooms/{room['code']}/reveal", json={"participant_id": rejoiner}
    )
    assert view.status_code == 200
