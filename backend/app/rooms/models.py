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


@dataclass
class Room:
    """An estimation room. Holds its code, the people in it, and the current
    voting round (a single optional topic plus each participant's private vote —
    D-11). Reveal, reset, and results stats are added in a later slice."""

    code: str
    participants: dict[str, Participant] = field(default_factory=dict)
    host_id: str | None = None
    current_item: str | None = None
    # participant_id -> chosen card token. Values are private until reveal (S4);
    # nothing outside the domain should expose them (FR-10).
    votes: dict[str, str] = field(default_factory=dict)
    # Whether the host votes this round. Others always vote; only the host may
    # opt out (D-14).
    host_voting: bool = True

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
        if self.host_id is None:
            self.host_id = participant.id
        return participant

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

        Raises:
            NotHost: if the caller is not the host.
        """
        self._require_host(participant_id)
        topic = topic.strip() if topic else ""
        self.current_item = topic or None

    def cast_vote(self, participant_id: str, card: str) -> None:
        """Record ``participant_id``'s vote, overwriting any prior one (FR-11).

        Guards run in order: the participant must be in the room; the host must
        not have opted out of voting; and the card must be in the deck (D-8).
        The value is stored privately — it is never surfaced pre-reveal (FR-10).

        Raises:
            UnknownParticipant: if the participant is not in the room.
            HostNotVoting: if the host casts a vote while opted out (D-14).
            InvalidCard: if the card is not a Fibonacci deck value.
        """
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

        Raises:
            NotHost: if the caller is not the host.
        """
        self._require_host(participant_id)
        self.host_voting = voting
        if not voting and self.host_id is not None:
            self.votes.pop(self.host_id, None)

    def expected_voter_ids(self) -> set[str]:
        """Participant ids expected to vote: everyone, minus the host when the
        host has opted out (D-14). Used by the reveal gate in a later slice."""
        ids = set(self.participants)
        if not self.host_voting and self.host_id is not None:
            ids.discard(self.host_id)
        return ids
