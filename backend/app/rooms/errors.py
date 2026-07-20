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
