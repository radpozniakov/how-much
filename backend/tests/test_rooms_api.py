"""API tests for POST /rooms (create + join-as-host)."""

import pytest
from app import config
from app.rooms.errors import InvalidCard
from app.rooms.models import CODE_ALPHABET


def test_create_room_returns_201_and_expected_shape(client):
    resp = client.post("/rooms", json={"name": "Alice"})
    assert resp.status_code == 201
    body = resp.json()
    assert set(body) == {"participant_id", "room", "link"}
    assert set(body["room"]) == {
        "code",
        "deck",
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


def test_create_without_cards_gets_the_fibonacci_default(client):
    body = client.post("/rooms", json={"name": "Alice"}).json()
    assert body["room"]["deck"] == list(config.FIBONACCI_DECK)


def test_create_with_cards_sets_the_rooms_deck(client):
    from app.rooms.store import store

    body = client.post(
        "/rooms", json={"name": "Alice", "cards": "1, 2, 4, 8, 12, 16"}
    ).json()
    assert body["room"]["deck"] == ["1", "2", "4", "8", "12", "16"]
    assert store.get(body["room"]["code"]).deck == ("1", "2", "4", "8", "12", "16")


def test_a_blank_cards_field_is_the_same_as_omitting_it(client):
    body = client.post("/rooms", json={"name": "Alice", "cards": "   "}).json()
    assert body["room"]["deck"] == list(config.FIBONACCI_DECK)


def test_an_invalid_deck_is_a_422_and_creates_no_room(client):
    from app.rooms.store import store

    resp = client.post("/rooms", json={"name": "Alice", "cards": "1, 1, 2"})
    assert resp.status_code == 422
    assert "repeat" in resp.json()["detail"][0]["msg"]
    assert len(store) == 0


def test_the_deck_rides_the_room_view_for_joiners_too(client):
    created = client.post("/rooms", json={"name": "Alice", "cards": "1,2,3"}).json()
    code = created["room"]["code"]
    joined = client.post(f"/rooms/{code}/participants", json={"name": "Bob"}).json()
    assert joined["room"]["deck"] == ["1", "2", "3"]


def test_a_vote_outside_the_custom_deck_is_rejected(client):
    """The deck the create route wrote actually constrains voting.

    A wiring test: it creates over HTTP, so the path from ``cards`` to an enforced
    deck is covered end to end. The assertion is on the domain, where ``cast_vote``
    decides."""
    from app.rooms.store import store

    created = client.post("/rooms", json={"name": "Alice", "cards": "1,2,3"}).json()
    room = store.get(created["room"]["code"])
    with pytest.raises(InvalidCard):
        room.cast_vote(created["participant_id"], "8")
    room.cast_vote(created["participant_id"], "2")
