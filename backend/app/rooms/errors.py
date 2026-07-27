"""Transport-free domain errors for the room aggregate.

Translated at the boundary the caller came in on: an ``error`` frame in ``ws.py``,
or a status code via ``main._ROOM_ERROR_STATUS`` for the two HTTP routes (D-50).
"""

from __future__ import annotations


class RoomError(Exception):
    """Base class for room domain errors."""


class RoomFull(RoomError):
    """A join was attempted against a room already at capacity."""

    def __init__(self, capacity: int) -> None:
        self.capacity = capacity
        super().__init__(f"Room is full (max {capacity})")


class InvalidCard(RoomError):
    """A vote carried a value not in the room's own deck (D-8/D-48)."""

    def __init__(self, card: str) -> None:
        self.card = card
        super().__init__(f"{card!r} is not a valid card")


class HostNotVoting(RoomError):
    """The host tried to vote while opted out of voting (D-14)."""

    def __init__(self) -> None:
        super().__init__("Host is not voting in this round")


class UnknownParticipant(RoomError):
    """An action referenced a participant who is not in the room."""

    def __init__(self) -> None:
        super().__init__("Participant is not in this room")


class NotHost(RoomError):
    """A host-only action was attempted by someone who is not the host (D-12)."""

    def __init__(self) -> None:
        super().__init__("Only the host may perform this action")


class CannotTargetSelf(RoomError):
    """A host-only action that needs another participant was aimed at the host.

    Split from :class:`UnknownParticipant` because that message is false about the
    host. The caller supplies the message so each action names itself; both share
    the ``cannot_target_self`` slug.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message)


class RoundRevealed(RoomError):
    """A round-mutating action was attempted after reveal (FR-11).

    Guards re-estimation only. Handover (D-45) and membership changes (D-47) are
    deliberately outside it — do not "fix" the apparent asymmetry; see D-45/D-47.
    """

    def __init__(self) -> None:
        super().__init__("Round is already revealed")
