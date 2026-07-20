"""Read-side views of a room — the shape every client sees.

These DTOs and their builders are the single ``RoomView`` snapshot shared by both
transports: the HTTP router returns them, and the WebSocket layer (S6) broadcasts
the *same* shape (D-36). Keeping them here (rather than in ``router.py``) lets the
socket layer build a snapshot without importing a private helper from the router.

The FR-10 pre-reveal gate lives in the domain (``Room.results()`` returns ``None``
until reveal), so ``results`` below is populated only for a revealed round — no
card value is reachable pre-reveal, over either transport.
"""

from __future__ import annotations

from pydantic import BaseModel

from app.rooms.models import Room


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
    is what gets broadcast (D-36)."""

    code: str
    host_id: str | None
    participants: list[ParticipantView]
    current_item: str | None
    host_voting: bool
    revealed: bool
    # Populated only for a revealed round; None hides all card values pre-reveal.
    results: ResultsView | None


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


def room_view(room: Room) -> RoomView:
    """Build the client-facing snapshot of ``room`` (shared by HTTP + WS)."""
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
