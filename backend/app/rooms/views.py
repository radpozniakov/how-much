"""Read-side views of a room — the shape every client sees.

One ``RoomView`` snapshot shared by both transports (D-36): the HTTP router returns
it, the WebSocket layer broadcasts it. It lives here rather than in ``router.py``
so the socket layer need not import a private router helper.

The FR-10 pre-reveal gate is the domain's (``Room.results()`` returns ``None`` until
reveal), so ``results`` is populated only for a revealed round.
"""

from __future__ import annotations

from pydantic import BaseModel

from app.rooms.models import Room


class ParticipantView(BaseModel):
    id: str
    name: str
    has_voted: bool


class ResultsView(BaseModel):
    """A revealed round's payload (FR-15/FR-16): every card plus the stats, absent
    (``None``) until reveal.

    ``votes`` maps participant_id -> card; names live only on the ``participants``
    roster, which the frontend joins by id."""

    votes: dict[str, str]
    average: float | None
    consensus: bool


class RoomView(BaseModel):
    """The shape every client sees: who's here, who's the host, the current item,
    who has voted, and whether the round is revealed — never the vote values until
    reveal (FR-10), which arrive in ``results``."""

    code: str
    deck: list[str]
    host_id: str | None
    participants: list[ParticipantView]
    current_item: str | None
    host_voting: bool
    revealed: bool
    results: ResultsView | None


def _results_view(room: Room) -> ResultsView | None:
    """Map the domain's results to the DTO, reflecting its pre-reveal ``None``."""
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
        deck=list(room.deck),
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
