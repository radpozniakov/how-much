"""The room domain model and its identifier generation.

A room is identified by its ``code`` (D-29): a short, human-typeable token that
doubles as the room's unique id (D-17/D-19).
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from uuid import uuid4

from app import config
from app.rooms.errors import (
    CannotTargetSelf,
    HostNotVoting,
    InvalidCard,
    NotHost,
    RoomFull,
    RoundRevealed,
    UnknownParticipant,
)

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def generate_id() -> str:
    """A participant identifier — a uuid4 as a 32-char hex string."""
    return uuid4().hex


def generate_code(length: int) -> str:
    """A random join code of ``length`` chars from :data:`CODE_ALPHABET`.

    Uses :mod:`secrets`: the code is the only thing gating a room, so it must not
    be guessable.
    """
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


@dataclass
class Participant:
    """Someone in a room, keyed by ``id`` so duplicate names (D-10) never collide."""

    name: str
    id: str = field(default_factory=generate_id)


@dataclass(frozen=True)
class RoundResults:
    """A revealed round's outcome (FR-15/FR-16): cards, average, all-equal flag."""

    votes: dict[str, str]
    average: float | None
    consensus: bool


@dataclass
class Room:
    """An estimation room: its code, its people, and one voting round — an
    optional topic, private votes (D-11), and a revealed flag."""

    code: str
    deck: tuple[str, ...] = config.FIBONACCI_DECK
    participants: dict[str, Participant] = field(default_factory=dict)
    host_id: str | None = None
    current_item: str | None = None
    votes: dict[str, str] = field(default_factory=dict)
    host_voting: bool = True
    revealed: bool = False
    empty_since: float | None = None

    def add_participant(self, name: str) -> Participant:
        """Add a participant and return them.

        The first one added becomes the host, which is the creator (D-32).

        Raises:
            RoomFull: if the room already holds ``config.ROOM_CAPACITY`` people (D-6).
        """
        if len(self.participants) >= config.ROOM_CAPACITY:
            raise RoomFull(config.ROOM_CAPACITY)
        participant = Participant(name=name)
        self.participants[participant.id] = participant
        self.empty_since = None
        if self.host_id is None:
            self.host_id = participant.id
        return participant

    def remove_participant(self, participant_id: str) -> None:
        """Remove a participant and drop their vote (FR-6/FR-7 leave path).

        A departing host hands the role to the oldest remaining participant and
        resets ``host_voting`` (D-13/D-14); the last leaver sets ``host_id`` to
        None and the store starts the grace timer. The vote is dropped even after
        reveal, so results recompute over whoever remains.

        **Unauthorized by design** — the actor is the leaver, so there is nobody to
        authorize against. :meth:`remove_participant_by_host` guards, then delegates
        here (FR-21/D-47).

        Raises:
            UnknownParticipant: if ``participant_id`` is not in the room.
        """
        if participant_id not in self.participants:
            raise UnknownParticipant()
        del self.participants[participant_id]
        self.votes.pop(participant_id, None)
        if participant_id == self.host_id:
            self.host_id = next(iter(self.participants), None)
            self.host_voting = True

    def _require_host(self, participant_id: str) -> None:
        """Guard a host-only action (D-12).

        Raises:
            NotHost: if ``participant_id`` is not the host. Doubles as membership
                enforcement — a non-member is never the host.
        """
        if participant_id != self.host_id:
            raise NotHost()

    def set_item(self, participant_id: str, topic: str | None) -> None:
        """Set or clear the current item's topic (host-only, FR-8).

        Trimmed; blank or ``None`` clears it. One item per room, no backlog (D-11).

        Raises:
            NotHost: if the caller is not the host.
            RoundRevealed: if the round has already been revealed.
        """
        self._require_host(participant_id)
        if self.revealed:
            raise RoundRevealed()
        topic = topic.strip() if topic else ""
        self.current_item = topic or None

    def set_name(self, participant_id: str, name: str) -> None:
        """Change a participant's own display name (self-service).

        Names are non-unique by design (D-10). Like ``add_participant``, the domain
        trusts the name — trimming and length belong to the transport boundary.

        Raises:
            UnknownParticipant: if ``participant_id`` is not in the room.
        """
        if participant_id not in self.participants:
            raise UnknownParticipant()
        self.participants[participant_id].name = name

    def cast_vote(self, participant_id: str, card: str) -> None:
        """Record ``participant_id``'s vote, overwriting any prior one (FR-11).

        Stored privately, never surfaced pre-reveal (FR-10). The revealed check
        comes first: once cards are shown nobody may vote, member or not.

        Raises:
            RoundRevealed: if the round has already been revealed (FR-11).
            UnknownParticipant: if the participant is not in the room.
            HostNotVoting: if the host casts a vote while opted out (D-14).
            InvalidCard: if the card is not in this room's deck (D-8/D-48).
        """
        if self.revealed:
            raise RoundRevealed()
        if participant_id not in self.participants:
            raise UnknownParticipant()
        if participant_id == self.host_id and not self.host_voting:
            raise HostNotVoting()
        if card not in self.deck:
            raise InvalidCard(card)
        self.votes[participant_id] = card

    def set_host_voting(self, participant_id: str, voting: bool) -> None:
        """Toggle whether the host votes this round (host-only, FR-14/D-14).

        Opting out drops any vote the host has already cast.

        Raises:
            NotHost: if the caller is not the host.
            RoundRevealed: if the round has already been revealed.
        """
        self._require_host(participant_id)
        if self.revealed:
            raise RoundRevealed()
        self.host_voting = voting
        if not voting and self.host_id is not None:
            self.votes.pop(self.host_id, None)

    def transfer_host(self, participant_id: str, target_id: str) -> None:
        """Hand the host role to another participant (host-only, FR-20/D-45).

        A move, not a grant: one ``host_id`` field, so no co-host and no transient
        unowned window. ``host_voting`` resets to ``True`` so the incoming host
        never inherits an opt-out they did not choose. The outgoing host keeps
        their vote and regains the right to vote by no longer matching
        ``cast_vote``'s host guard. Legal after reveal — it touches no input to
        ``results()``.

        Raises:
            NotHost: if the caller is not the host.
            CannotTargetSelf: if the host targets themselves.
            UnknownParticipant: if the target is not in the room.
        """
        self._require_host(participant_id)
        if target_id == participant_id:
            raise CannotTargetSelf("You cannot hand the host role to yourself")
        if target_id not in self.participants:
            raise UnknownParticipant()
        self.host_id = target_id
        self.host_voting = True

    def remove_participant_by_host(self, participant_id: str, target_id: str) -> None:
        """Remove another participant from the room (host-only, FR-21/D-47).

        Guards, then delegates to :meth:`remove_participant`: same effect, host
        authority. Not a ban (D-15) — the removed person may rejoin with the code.

        The delegate's host-auto-transfer branch is unreachable from here: it fires
        only for ``host_id``, which the self-target guard rejects. Nor can this
        empty the room, since the actor remains — hence no ``empty_since`` stamp and
        no need to route through ``store.leave``. The target's vote goes with them,
        even after reveal.

        Raises:
            NotHost: if the caller is not the host.
            CannotTargetSelf: if the host targets themselves.
            UnknownParticipant: if the target is not in the room.
        """
        self._require_host(participant_id)
        if target_id == participant_id:
            raise CannotTargetSelf("You cannot remove yourself from the room")
        if target_id not in self.participants:
            raise UnknownParticipant()
        self.remove_participant(target_id)

    def reveal(self, participant_id: str) -> None:
        """Reveal the round so every vote becomes visible (host-only, FR-12).

        Unconditional (no all-voted gate) and idempotent.

        Raises:
            NotHost: if the caller is not the host.
        """
        self._require_host(participant_id)
        self.revealed = True

    def reset_round(self, participant_id: str) -> None:
        """Clear the round for a fresh start (host-only, FR-13).

        Drops all votes, clears the item, hides results. ``host_voting`` persists
        across rounds as a facilitator preference, so it is left untouched (D-14).

        Raises:
            NotHost: if the caller is not the host.
        """
        self._require_host(participant_id)
        self.votes.clear()
        self.current_item = None
        self.revealed = False

    def results(self) -> RoundResults | None:
        """The revealed round's outcome, or ``None`` until the host reveals.

        The single domain-side gate keeping card values from leaking pre-reveal
        (FR-10). Stats cover cast votes only; the average is unrounded, since
        formatting is the frontend's concern.

        ``float``, not ``int``: decks may hold decimals (D-48) and ``int("0.5")``
        would raise. Consensus compares the normalized card *strings*, not these
        floats, so its equality stays exact."""
        if not self.revealed:
            return None
        values = [float(card) for card in self.votes.values()]
        average = sum(values) / len(values) if values else None
        consensus = len(values) > 0 and len(set(self.votes.values())) == 1
        return RoundResults(
            votes=dict(self.votes),
            average=average,
            consensus=consensus,
        )
