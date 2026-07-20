"""The room domain model and its identifier generation.

A room is identified by its ``code`` (D-29): a short, human-typeable token that
users enter to join and that is embedded in the shareable link (D-17). It doubles
as the room's system-generated unique ID (D-19); a separate WebSocket-routing id
is deferred to S6, when something actually needs it.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass, field
from uuid import uuid4

from app import config
from app.rooms.errors import (
    HostNotVoting,
    InvalidCard,
    NotHost,
    RoomFull,
    RoundRevealed,
    UnknownParticipant,
)

# Unambiguous alphabet: uppercase letters + digits, minus characters that are
# easily confused when read aloud or typed (0/O, 1/I/L). Keeps join friction low.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def generate_id() -> str:
    """A participant identifier — a uuid4 as a 32-char hex string."""
    return uuid4().hex


def generate_code(length: int) -> str:
    """A random join code of ``length`` chars drawn from :data:`CODE_ALPHABET`.

    Uses :mod:`secrets` so codes aren't guessable — the only thing standing
    between a stranger and a room is the code, so it should not be predictable.
    """
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


@dataclass
class Participant:
    """Someone in a room. Identified internally by ``id`` so that duplicate
    display names (allowed — D-10) never collide."""

    name: str
    id: str = field(default_factory=generate_id)


@dataclass(frozen=True)
class RoundResults:
    """A revealed round's outcome (FR-15, FR-16): every cast card, the average of
    the numeric votes, and whether they reached consensus (all equal). Plain data
    — the domain hands this back and the router shapes it into a response DTO."""

    # participant_id -> card. Only ever built for a revealed round.
    votes: dict[str, str]
    average: float | None
    consensus: bool


@dataclass
class Room:
    """An estimation room. Holds its code, the people in it, and the current
    voting round: a single optional topic, each participant's private vote (D-11),
    and whether the round has been revealed."""

    code: str
    participants: dict[str, Participant] = field(default_factory=dict)
    host_id: str | None = None
    current_item: str | None = None
    # participant_id -> chosen card token. Values are private until reveal;
    # nothing outside the domain should expose them pre-reveal (FR-10).
    votes: dict[str, str] = field(default_factory=dict)
    # Whether the host votes this round. Others always vote; only the host may
    # opt out (D-14).
    host_voting: bool = True
    # Whether the host has revealed the round. Card values and results are only
    # ever exposed once this is True (the FR-10 gate lives in `results()`).
    revealed: bool = False
    # Marker of when the room last became empty, in the store's clock units.
    # Store-managed: the domain only CLEARS it (in add_participant, on re-occupancy)
    # and never reads or stamps it — every timestamp write and the TTL comparison
    # live in the store (RoomStore.leave / sweep). None while occupied (and freshly
    # created). Keeping all reads/writes in the store preserves domain purity
    # (Principle 1): Room stays clock-free.
    empty_since: float | None = None

    def add_participant(self, name: str) -> Participant:
        """Add a participant and return them.

        The first participant added becomes the host — which is the creator,
        since room creation adds them first (D-32). Rejects the join once the
        room is at capacity (D-6).

        Raises:
            RoomFull: if the room already holds ``config.ROOM_CAPACITY`` people.
        """
        if len(self.participants) >= config.ROOM_CAPACITY:
            raise RoomFull(config.ROOM_CAPACITY)
        participant = Participant(name=name)
        self.participants[participant.id] = participant
        self.empty_since = None  # re-occupancy cancels a pending cleanup (D-18)
        if self.host_id is None:
            self.host_id = participant.id
        return participant

    def remove_participant(self, participant_id: str) -> None:
        """Remove a participant and drop their vote (FR-6/FR-7 leave path).

        If the leaver is the host, the role auto-transfers to the oldest
        remaining participant — deterministic by insertion order (D-13/FR-7) —
        and host voting resets to on, since a fresh host votes by default (D-14)
        and must not silently inherit the previous host's opt-out. When the last
        participant leaves, ``host_id`` becomes None; the store then starts the
        empty-room grace timer.

        Dropping the vote is unconditional, including after reveal: a departed
        participant can't be held in the room to freeze the stats, so results
        recompute over whoever is still present (consistent with `results()`,
        which is defined over cast votes only).

        DELIBERATE: this method BYPASSES the ``RoundRevealed`` guard that
        ``cast_vote``/``set_item``/``set_host_voting`` enforce. Those reject
        post-reveal *mutations of the estimate*; a leave is not a re-estimate — you
        cannot force presence, so a leave is always allowed and may recompute (even
        flip) revealed stats. Do not "fix" this by adding a revealed check here.

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
            NotHost: if ``participant_id`` is not the room's host. A participant
                who is not the host — including one who is not in the room at all
                — is by definition not permitted, so this doubles as membership
                enforcement for host-only actions.
        """
        if participant_id != self.host_id:
            raise NotHost()

    def set_item(self, participant_id: str, topic: str | None) -> None:
        """Set or clear the current item's topic (host-only, FR-8).

        The topic is trimmed; a blank or ``None`` value clears it back to
        ``None``. There is no backlog — a room has a single current item (D-11).

        Locked once the round is revealed: changing the topic would leave the
        revealed cards labelled against an item nobody voted on. The host resets
        the round to start a fresh estimate.

        Raises:
            NotHost: if the caller is not the host.
            RoundRevealed: if the round has already been revealed.
        """
        self._require_host(participant_id)
        if self.revealed:
            raise RoundRevealed()
        topic = topic.strip() if topic else ""
        self.current_item = topic or None

    def cast_vote(self, participant_id: str, card: str) -> None:
        """Record ``participant_id``'s vote, overwriting any prior one (FR-11).

        Guards run in order: the round must not be revealed; the participant must
        be in the room; the host must not have opted out of voting; and the card
        must be in the deck (D-8). The value is stored privately — it is never
        surfaced pre-reveal (FR-10).

        The revealed check runs first, ahead of the per-caller guards, because it
        is a room-level state: once cards are shown, no one may vote regardless of
        who they are (so a post-reveal vote from a non-member reports the round
        state, not the missing membership).

        Raises:
            RoundRevealed: if the round has already been revealed (FR-11).
            UnknownParticipant: if the participant is not in the room.
            HostNotVoting: if the host casts a vote while opted out (D-14).
            InvalidCard: if the card is not a Fibonacci deck value.
        """
        if self.revealed:
            raise RoundRevealed()
        if participant_id not in self.participants:
            raise UnknownParticipant()
        if participant_id == self.host_id and not self.host_voting:
            raise HostNotVoting()
        if card not in config.FIBONACCI_DECK:
            raise InvalidCard(card)
        self.votes[participant_id] = card

    def set_host_voting(self, participant_id: str, voting: bool) -> None:
        """Toggle whether the host votes this round (host-only, FR-14/D-14).

        Opting out drops any vote the host has already cast, so an opted-out
        host never lingers in the voted set.

        Locked once the round is revealed: dropping the host's revealed card
        would silently recompute the already-shown average/consensus. The host
        resets the round to change this.

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

    def expected_voter_ids(self) -> set[str]:
        """Participant ids expected to vote: everyone, minus the host when the
        host has opted out (D-14).

        Reveal is deliberately *unconditional* (the host may reveal at any point),
        so this is not a reveal gate — it is here for a "who's still out" presence
        indicator on the frontend / over the socket (S6)."""
        ids = set(self.participants)
        if not self.host_voting and self.host_id is not None:
            ids.discard(self.host_id)
        return ids

    def reveal(self, participant_id: str) -> None:
        """Reveal the round so every vote becomes visible (host-only, FR-12).

        Unconditional — a host may reveal at any point, with no all-voted gate.
        Idempotent: revealing an already-revealed round is a no-op.

        Raises:
            NotHost: if the caller is not the host.
        """
        self._require_host(participant_id)
        self.revealed = True

    def reset_round(self, participant_id: str) -> None:
        """Clear the round for a fresh start (host-only, FR-13).

        Drops all votes, clears the current item, and hides results again.
        ``host_voting`` is a facilitator preference that persists across rounds,
        so it is deliberately left untouched (D-14 is silent on reset).

        Raises:
            NotHost: if the caller is not the host.
        """
        self._require_host(participant_id)
        self.votes.clear()
        self.current_item = None
        self.revealed = False

    def results(self) -> RoundResults | None:
        """The revealed round's outcome, or ``None`` until the host reveals.

        This single domain-side gate is what keeps card values from leaking
        pre-reveal (FR-10): no transport can assemble results while ``revealed``
        is False. Returns a snapshot of the votes plus the average and consensus
        (FR-15, FR-16).

        Stats are over cast votes only — reveal is unconditional (D), so a partial
        round legitimately reports the average/consensus of those who did vote.
        Every deck card is numeric (D-8); the average is unrounded, as display
        formatting is the frontend's concern."""
        if not self.revealed:
            return None
        values = [int(card) for card in self.votes.values()]
        average = sum(values) / len(values) if values else None
        consensus = len(values) > 0 and len(set(self.votes.values())) == 1
        return RoundResults(
            votes=dict(self.votes),
            average=average,
            consensus=consensus,
        )
