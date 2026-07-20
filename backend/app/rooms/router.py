"""HTTP routes for rooms.

Room creation is the one action that fits request/response rather than the
real-time socket (D-5), so it lives here. Joining and all round actions are HTTP
for now to keep the domain testable before any transport; they move onto the
WebSocket in S6. Domain errors raised below are translated to status codes by
the ``RoomError`` handler registered in :mod:`app.main`.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from app import config
from app.rooms.models import Room
from app.rooms.store import store

router = APIRouter(prefix="/rooms", tags=["rooms"])


class JoinRequest(BaseModel):
    """Creating or joining a room carries only a display name — no auth (D-9)."""

    name: str

    @field_validator("name")
    @classmethod
    def _clean_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name must not be blank")
        if len(value) > config.MAX_DISPLAY_NAME_LENGTH:
            raise ValueError(
                f"name must be at most {config.MAX_DISPLAY_NAME_LENGTH} characters"
            )
        return value


class SetItemRequest(BaseModel):
    """Set (or clear) the current item's topic. Host-only, enforced in the
    domain via ``participant_id`` (no auth — D-9)."""

    participant_id: str
    topic: str | None = None

    @field_validator("topic")
    @classmethod
    def _check_topic_length(cls, value: str | None) -> str | None:
        # Length is the boundary's concern; trimming and blank-clearing are the
        # domain's (Room.set_item).
        if value is not None and len(value.strip()) > config.MAX_TOPIC_LENGTH:
            raise ValueError(
                f"topic must be at most {config.MAX_TOPIC_LENGTH} characters"
            )
        return value


class CastVoteRequest(BaseModel):
    """Cast or change the caller's vote. The card is validated against the deck
    in the domain (Room.cast_vote), which raises InvalidCard -> 422."""

    participant_id: str
    card: str


class HostVotingRequest(BaseModel):
    """Toggle whether the host votes this round (host-only, FR-14)."""

    participant_id: str
    voting: bool


class HostActionRequest(BaseModel):
    """A host-only command that carries no value — just who is asking. Host status
    is enforced in the domain via ``participant_id`` (no auth — D-9)."""

    participant_id: str


class ParticipantView(BaseModel):
    id: str
    name: str
    # Whether this participant has a vote in the current round. Presence only —
    # the card value is never exposed before reveal (FR-10).
    has_voted: bool


class ResultsView(BaseModel):
    """A revealed round's payload (FR-15, FR-16): every card plus the stats. Only
    present once the host has revealed — absent (``None``) otherwise, so no card
    value is reachable pre-reveal.

    ``votes`` maps participant_id -> card; names are not duplicated here — the
    roster in ``participants`` carries them, and the frontend joins by id."""

    votes: dict[str, str]
    average: float | None
    consensus: bool


class RoomView(BaseModel):
    """The shape every client sees: who's here, who's the host, the current item,
    who has voted, and whether the round is revealed — but never the vote values
    until reveal (FR-10), which arrive in ``results``. Over the socket (S6) this
    is what gets broadcast."""

    code: str
    host_id: str | None
    participants: list[ParticipantView]
    current_item: str | None
    host_voting: bool
    revealed: bool
    # Populated only for a revealed round; None hides all card values pre-reveal.
    results: ResultsView | None


class JoinResponse(BaseModel):
    """Returned from both create and join: the caller's own participant id plus
    the room they're now in."""

    participant_id: str
    room: RoomView


class CreateRoomResponse(JoinResponse):
    """A join that also hands back the shareable link for the new room."""

    link: str


def _results_view(room: Room) -> ResultsView | None:
    """Map the domain's results to the DTO. The reveal gate lives in the domain
    (`Room.results()` returns None pre-reveal), so this simply reflects it."""
    results = room.results()
    if results is None:
        return None
    return ResultsView(
        votes=results.votes,
        average=results.average,
        consensus=results.consensus,
    )


def _room_view(room: Room) -> RoomView:
    return RoomView(
        code=room.code,
        host_id=room.host_id,
        participants=[
            ParticipantView(id=p.id, name=p.name, has_voted=p.id in room.votes)
            for p in room.participants.values()
        ],
        current_item=room.current_item,
        host_voting=room.host_voting,
        revealed=room.revealed,
        results=_results_view(room),
    )


def _require_room(code: str) -> Room:
    """Resolve a room by code (case-insensitive — codes are generated uppercase,
    D-17). Raises 404 if there is no such room."""
    room = store.get(code.strip().upper())
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return room


@router.post("", status_code=201, response_model=CreateRoomResponse)
async def create_room(body: JoinRequest) -> CreateRoomResponse:
    """Create a room and join it as the host (FR-1, FR-2a).

    Creation and the creator's join are one step, so the creator is
    unambiguously the host (D-32) — no participant-less room to race over.
    """
    room = store.create()
    host = room.add_participant(body.name)
    return CreateRoomResponse(
        participant_id=host.id,
        room=_room_view(room),
        link=config.room_link(room.code),
    )


@router.post("/{code}/participants", status_code=201, response_model=JoinResponse)
async def join_room(code: str, body: JoinRequest) -> JoinResponse:
    """Join an existing room by code with a display name (FR-3)."""
    room = _require_room(code)
    participant = room.add_participant(body.name)
    return JoinResponse(participant_id=participant.id, room=_room_view(room))


@router.put("/{code}/item", response_model=RoomView)
async def set_item(code: str, body: SetItemRequest) -> RoomView:
    """Set or clear the current item's topic (host-only, FR-8)."""
    room = _require_room(code)
    room.set_item(body.participant_id, body.topic)
    return _room_view(room)


@router.put("/{code}/vote", response_model=RoomView)
async def cast_vote(code: str, body: CastVoteRequest) -> RoomView:
    """Cast or change the caller's vote (FR-9, FR-11)."""
    room = _require_room(code)
    room.cast_vote(body.participant_id, body.card)
    return _room_view(room)


@router.put("/{code}/host-voting", response_model=RoomView)
async def set_host_voting(code: str, body: HostVotingRequest) -> RoomView:
    """Toggle whether the host votes this round (host-only, FR-14)."""
    room = _require_room(code)
    room.set_host_voting(body.participant_id, body.voting)
    return _room_view(room)


@router.post("/{code}/reveal", response_model=RoomView)
async def reveal_round(code: str, body: HostActionRequest) -> RoomView:
    """Reveal the round: all cards + stats become visible (host-only, FR-12)."""
    room = _require_room(code)
    room.reveal(body.participant_id)
    return _room_view(room)


@router.post("/{code}/reset", response_model=RoomView)
async def reset_round(code: str, body: HostActionRequest) -> RoomView:
    """Reset for a fresh round: clears votes, topic, and results (host-only, FR-13)."""
    room = _require_room(code)
    room.reset_round(body.participant_id)
    return _room_view(room)


@router.delete("/{code}/participants/{participant_id}", response_model=RoomView)
async def leave_room(code: str, participant_id: str) -> RoomView:
    """Leave a room (FR-6/FR-7).

    If the host leaves, the role auto-transfers (D-13); when the last
    participant leaves, the room enters a grace period before it is discarded
    (D-18). Explicit here — real disconnect detection wires onto the socket in
    S6. Returns the updated room so remaining clients (and, in S6, the
    broadcast) see the new roster/host."""
    room = _require_room(code)
    store.leave(room, participant_id)
    return _room_view(room)
