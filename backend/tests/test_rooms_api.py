"""API-level tests for POST /rooms."""

from app import config
from app.rooms.models import CODE_ALPHABET


def test_create_room_returns_201_and_expected_shape(client):
    resp = client.post("/rooms")
    assert resp.status_code == 201
    body = resp.json()
    assert set(body) == {"id", "code", "link"}
    assert all(isinstance(body[k], str) for k in body)


def test_created_code_matches_configured_length_and_alphabet(client):
    body = client.post("/rooms").json()
    assert len(body["code"]) == config.ROOM_CODE_LENGTH
    assert set(body["code"]) <= set(CODE_ALPHABET)


def test_link_is_base_url_plus_code(client):
    body = client.post("/rooms").json()
    assert body["link"] == f"{config.PUBLIC_BASE_URL}/room/{body['code']}"


def test_two_creates_yield_distinct_rooms(client):
    first = client.post("/rooms").json()
    second = client.post("/rooms").json()
    assert first["id"] != second["id"]
    assert first["code"] != second["code"]


def test_created_room_is_retrievable_from_store(client):
    from app.rooms.store import store

    body = client.post("/rooms").json()
    room = store.get(body["code"])
    assert room is not None
    assert room.id == body["id"]
