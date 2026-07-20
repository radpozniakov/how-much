"""Domain-level tests for room identity and the in-memory store."""

from app.rooms.models import CODE_ALPHABET, Room, generate_code, generate_id
from app.rooms.store import RoomStore


def test_generate_code_length_and_alphabet():
    code = generate_code(6)
    assert len(code) == 6
    assert set(code) <= set(CODE_ALPHABET)


def test_code_alphabet_excludes_ambiguous_characters():
    # Guards the join-friction promise in D-29.
    for ambiguous in "01OIL":
        assert ambiguous not in CODE_ALPHABET


def test_generate_id_is_32_char_hex():
    room_id = generate_id()
    assert len(room_id) == 32
    int(room_id, 16)  # raises ValueError if not hex


def test_ids_are_unique():
    ids = {generate_id() for _ in range(1000)}
    assert len(ids) == 1000


def test_create_stores_and_returns_room():
    store = RoomStore()
    room = store.create()
    assert isinstance(room, Room)
    assert store.get(room.code) is room
    assert room.code in store
    assert len(store) == 1


def test_get_unknown_code_returns_none():
    store = RoomStore()
    assert store.get("NOPE99") is None
    assert "NOPE99" not in store


def test_create_allocates_unique_codes():
    store = RoomStore()
    rooms = [store.create() for _ in range(1000)]
    codes = {room.code for room in rooms}
    assert len(codes) == 1000
    assert len(store) == 1000


def test_clear_empties_the_store():
    store = RoomStore()
    store.create()
    store.clear()
    assert len(store) == 0
