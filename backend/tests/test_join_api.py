"""API-level tests for POST /rooms/{code}/participants."""

from app import config


def _create_room(client) -> str:
    return client.post("/rooms").json()["code"]


def test_join_returns_201_with_participant_and_roster(client):
    code = _create_room(client)
    resp = client.post(f"/rooms/{code}/participants", json={"name": "Alice"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["participant_id"]
    assert body["room"]["code"] == code
    names = [p["name"] for p in body["room"]["participants"]]
    assert names == ["Alice"]


def test_first_joiner_is_host(client):
    code = _create_room(client)
    body = client.post(f"/rooms/{code}/participants", json={"name": "Alice"}).json()
    assert body["room"]["host_id"] == body["participant_id"]


def test_second_joiner_is_not_host(client):
    code = _create_room(client)
    first = client.post(f"/rooms/{code}/participants", json={"name": "Alice"}).json()
    second = client.post(f"/rooms/{code}/participants", json={"name": "Bob"}).json()
    assert second["room"]["host_id"] == first["participant_id"]
    assert second["participant_id"] != second["room"]["host_id"]
    assert len(second["room"]["participants"]) == 2


def test_join_unknown_room_is_404(client):
    resp = client.post("/rooms/NOPE99/participants", json={"name": "Alice"})
    assert resp.status_code == 404


def test_duplicate_names_allowed_via_api(client):
    code = _create_room(client)
    client.post(f"/rooms/{code}/participants", json={"name": "Sam"})
    body = client.post(f"/rooms/{code}/participants", json={"name": "Sam"}).json()
    ids = [p["id"] for p in body["room"]["participants"]]
    assert len(ids) == len(set(ids)) == 2


def test_blank_and_whitespace_names_rejected(client):
    code = _create_room(client)
    assert (
        client.post(f"/rooms/{code}/participants", json={"name": ""}).status_code == 422
    )
    assert (
        client.post(f"/rooms/{code}/participants", json={"name": "   "}).status_code
        == 422
    )


def test_name_is_trimmed(client):
    code = _create_room(client)
    body = client.post(f"/rooms/{code}/participants", json={"name": "  Alice  "}).json()
    assert body["room"]["participants"][0]["name"] == "Alice"


def test_overlong_name_rejected(client):
    code = _create_room(client)
    too_long = "x" * (config.MAX_DISPLAY_NAME_LENGTH + 1)
    resp = client.post(f"/rooms/{code}/participants", json={"name": too_long})
    assert resp.status_code == 422


def test_capacity_enforced_via_api(client):
    code = _create_room(client)
    for i in range(config.ROOM_CAPACITY):
        assert (
            client.post(
                f"/rooms/{code}/participants", json={"name": f"P{i}"}
            ).status_code
            == 201
        )
    overflow = client.post(f"/rooms/{code}/participants", json={"name": "late"})
    assert overflow.status_code == 409
    assert str(config.ROOM_CAPACITY) in overflow.json()["detail"]
