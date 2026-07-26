"""API-level tests for POST /rooms (create + join-as-host)."""

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


# --- host-chosen card values (FR-22/D-48) ------------------------------------
#
# The rules themselves live in test_deck.py; these pin the *wiring* — that the
# create route parses `cards`, that the deck reaches the room and the snapshot,
# and that a rejection is a 422 rather than a broken room.


def test_create_without_cards_gets_the_fibonacci_default(client):
    body = client.post("/rooms", json={"name": "Alice"}).json()
    assert body["room"]["deck"] == list(config.FIBONACCI_DECK)


def test_create_with_cards_sets_the_rooms_deck(client):
    from app.rooms.store import store

    body = client.post(
        "/rooms", json={"name": "Alice", "cards": "1, 2, 4, 8, 12, 16"}
    ).json()
    assert body["room"]["deck"] == ["1", "2", "4", "8", "12", "16"]
    # ...and it is the room's own state, not just something in the response.
    assert store.get(body["room"]["code"]).deck == ("1", "2", "4", "8", "12", "16")


def test_a_blank_cards_field_is_the_same_as_omitting_it(client):
    body = client.post("/rooms", json={"name": "Alice", "cards": "   "}).json()
    assert body["room"]["deck"] == list(config.FIBONACCI_DECK)


def test_an_invalid_deck_is_a_422_and_creates_no_room(client):
    from app.rooms.store import store

    resp = client.post("/rooms", json={"name": "Alice", "cards": "1, 1, 2"})
    assert resp.status_code == 422
    assert "repeat" in resp.json()["detail"][0]["msg"]
    # The point of validating at the boundary: no half-built room survives it.
    assert len(store) == 0


def test_the_deck_rides_the_room_view_for_joiners_too(client):
    # It reaches every client on every snapshot (D-36), so a participant who never
    # saw the create response still knows what they are voting into.
    created = client.post("/rooms", json={"name": "Alice", "cards": "1,2,3"}).json()
    code = created["room"]["code"]
    joined = client.post(f"/rooms/{code}/participants", json={"name": "Bob"}).json()
    assert joined["room"]["deck"] == ["1", "2", "3"]


def test_a_vote_outside_the_custom_deck_is_rejected(client):
    """The deck the create route wrote actually constrains voting.

    Still a wiring test: it creates over HTTP, so the path from ``cards`` to an
    enforced deck is covered end to end. Only the assertion moved to the domain,
    where ``cast_vote`` decides — it used to go through ``PUT /vote``, which D-50
    removed. ``InvalidCard`` is what that route was mapping to its 422 anyway."""
    from app.rooms.store import store

    created = client.post("/rooms", json={"name": "Alice", "cards": "1,2,3"}).json()
    room = store.get(created["room"]["code"])
    with pytest.raises(InvalidCard):
        room.cast_vote(created["participant_id"], "8")
    room.cast_vote(created["participant_id"], "2")  # and a card in the deck is fine
