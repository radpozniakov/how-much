"""API-level tests for POST /rooms/{code}/participants.

Every room already has one participant — its creator/host — from the create call
(D-32), so join tests build on a room that is not empty.
"""

from app import config


def _new_room(client, host_name: str = "Creator") -> dict:
    """Create a room and return the create response (has room.code + host id)."""
    return client.post("/rooms", json={"name": host_name}).json()


def test_join_returns_201_with_participant_and_roster(client):
    code = _new_room(client)["room"]["code"]
    resp = client.post(f"/rooms/{code}/participants", json={"name": "Alice"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["participant_id"]
    assert body["room"]["code"] == code
    names = [p["name"] for p in body["room"]["participants"]]
    assert names == ["Creator", "Alice"]


def test_joiner_is_not_host(client):
    created = _new_room(client)
    host_id = created["participant_id"]
    body = client.post(
        f"/rooms/{created['room']['code']}/participants", json={"name": "Alice"}
    ).json()
    assert body["room"]["host_id"] == host_id
    assert body["participant_id"] != host_id
    assert len(body["room"]["participants"]) == 2


def test_join_unknown_room_is_404(client):
    resp = client.post("/rooms/NOPE99/participants", json={"name": "Alice"})
    assert resp.status_code == 404


def test_join_code_is_case_insensitive(client):
    code = _new_room(client)["room"]["code"]  # codes are generated uppercase
    resp = client.post(f"/rooms/{code.lower()}/participants", json={"name": "Alice"})
    assert resp.status_code == 201
    assert resp.json()["room"]["code"] == code


def test_duplicate_names_allowed_via_api(client):
    code = _new_room(client)["room"]["code"]
    client.post(f"/rooms/{code}/participants", json={"name": "Sam"})
    body = client.post(f"/rooms/{code}/participants", json={"name": "Sam"}).json()
    sams = [p for p in body["room"]["participants"] if p["name"] == "Sam"]
    assert len(sams) == 2
    assert len({p["id"] for p in sams}) == 2


def test_blank_and_whitespace_names_rejected(client):
    code = _new_room(client)["room"]["code"]
    assert (
        client.post(f"/rooms/{code}/participants", json={"name": ""}).status_code == 422
    )
    assert (
        client.post(f"/rooms/{code}/participants", json={"name": "   "}).status_code
        == 422
    )


def test_name_is_trimmed(client):
    code = _new_room(client)["room"]["code"]
    body = client.post(f"/rooms/{code}/participants", json={"name": "  Alice  "}).json()
    joined = next(
        p for p in body["room"]["participants"] if p["id"] == body["participant_id"]
    )
    assert joined["name"] == "Alice"


def test_overlong_name_rejected(client):
    code = _new_room(client)["room"]["code"]
    too_long = "x" * (config.MAX_DISPLAY_NAME_LENGTH + 1)
    resp = client.post(f"/rooms/{code}/participants", json={"name": too_long})
    assert resp.status_code == 422


def test_capacity_enforced_via_api(client):
    code = _new_room(client)["room"]["code"]  # creator already occupies one slot
    for i in range(config.ROOM_CAPACITY - 1):
        assert (
            client.post(
                f"/rooms/{code}/participants", json={"name": f"P{i}"}
            ).status_code
            == 201
        )
    overflow = client.post(f"/rooms/{code}/participants", json={"name": "late"})
    assert overflow.status_code == 409
    assert str(config.ROOM_CAPACITY) in overflow.json()["detail"]
