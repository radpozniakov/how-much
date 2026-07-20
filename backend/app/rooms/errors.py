"""Domain errors for the room aggregate.

Raised by the model, translated to HTTP status codes at the router boundary
(and later to error messages over the WebSocket). Keeping them transport-free
lets the domain be tested without a request/response in sight.
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
    """A vote carried a value that is not in the Fibonacci deck (D-8)."""

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
