"""API-level tests for POST /rooms (create + join-as-host)."""

from app import config
from app.rooms.models import CODE_ALPHABET


def test_create_room_returns_201_and_expected_shape(client):
    resp = client.post("/rooms", json={"name": "Alice"})
    assert resp.status_code == 201
    body = resp.json()
    assert set(body) == {"participant_id", "room", "link"}
    assert set(body["room"]) == {
        "code",
        "host_id",
        "participants",
        "current_item",
        "host_voting",
        "revealed",
        "results",
    }


def test_created_code_matches_configured_length_and_alphabet(client):
    body = client.post("/rooms", json={"name": "Alice"}).json()
    code = body["room"]["code"]
    assert len(code) == config.ROOM_CODE_LENGTH
    assert set(code) <= set(CODE_ALPHABET)


def test_link_is_base_url_plus_code(client):
    body = client.post("/rooms", json={"name": "Alice"}).json()
    code = body["room"]["code"]
    assert body["link"] == f"{config.PUBLIC_BASE_URL}/room/{code}"


def test_creator_becomes_host_and_is_in_the_room(client):
    body = client.post("/rooms", json={"name": "Alice"}).json()
    participants = body["room"]["participants"]
    assert body["room"]["host_id"] == body["participant_id"]
    assert [p["name"] for p in participants] == ["Alice"]
    assert participants[0]["id"] == body["participant_id"]


def test_two_creates_yield_distinct_rooms(client):
    first = client.post("/rooms", json={"name": "Alice"}).json()
    second = client.post("/rooms", json={"name": "Bob"}).json()
    assert first["room"]["code"] != second["room"]["code"]
    assert first["participant_id"] != second["participant_id"]


def test_create_requires_a_name(client):
    assert client.post("/rooms").status_code == 422
    assert client.post("/rooms", json={"name": "  "}).status_code == 422


def test_created_room_is_retrievable_from_store(client):
    from app.rooms.store import store

    body = client.post("/rooms", json={"name": "Alice"}).json()
    room = store.get(body["room"]["code"])
    assert room is not None
    assert room.host_id == body["participant_id"]
