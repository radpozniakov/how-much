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
    """A vote carried a value that is not in the room's deck (D-8/D-48).

    The room's own deck, not a global constant: since V4 the host may choose the
    card values at creation, so what counts as valid is per-room state
    (``Room.deck``) even though the default is still Fibonacci.
    """

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

    Distinct from :class:`UnknownParticipant` on purpose, even though both mean
    "bad target". That error's message — "Participant is not in this room" — is
    simply false about the host, who is by definition in it; raising it here would
    ship a message that lies. The split is also diagnostic: an unknown target is a
    real race (the target left between the snapshot and the click), while a
    self-target can only be a client bug, since ``room_view`` tells every client
    which id is the host.

    **The message is the caller's, not this class's** — the one deviation from
    every sibling above, and the direct consequence of a second action reusing this
    error (V2, FR-21/D-47). A shared wording would have to be something like "you
    cannot target yourself", which is exactly the vagueness this class was split
    off to avoid: it exists *because* a message that does not describe the actual
    action is a defect. Two callers, two precise sentences, one slug
    (``cannot_target_self``), so the wire protocol is unchanged.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message)


class RoundRevealed(RoomError):
    """A round-mutating action was attempted after the round was revealed (FR-11).

    Once cards are shown, the results are final: a late vote, a topic change, or a
    host-voting toggle would silently mutate the already-revealed cards or
    average/consensus. The host resets the round to make further changes.

    Its jurisdiction is precisely *the inputs to* ``Room.results()``, which reads
    only ``revealed`` and ``votes``. So a handover (D-45) is deliberately **not**
    locked: it writes ``host_id`` and ``host_voting``, neither of which is an
    input, and a revealed round's votes/average/consensus survive it byte for
    byte. Locking it would force a host who reveals and *then* needs to leave to
    reset the round — destroying the results the room is reading — as the price of
    handing over, which inverts the purpose of this guard.

    Note also why the lock on ``set_host_voting`` stays coarse (on the action, not
    the direction): only its ``voting=False`` branch pops a vote, so only that
    direction can touch a revealed result. The ``True`` direction is harmless, but
    nothing needed it, so the guard was never split. A handover reaches only the
    ``True`` case, which is why it can skip the lock without inconsistency — do
    not "fix" the apparent asymmetry.

    **Membership changes are outside this guard entirely** (D-47), and unlike the
    handover that is *not* because they leave ``results()``'s inputs alone —
    removing someone drops their vote, so it rewrites a revealed round outright.
    The reason is that this exception's jurisdiction is re-estimation: a late vote,
    a moved topic, a host opting out. Who is *in the room* is a different axis, and
    the leave path already rewrites revealed results by design and under test
    (``remove_participant``; ``test_leave_mid_reveal_flips_consensus``). A
    host-initiated removal is that same operation reached by a deliberate trigger,
    so locking it would make the guard mean two different things depending on which
    trigger fired — and would force a host who needs someone out of a revealed room
    to ``reset`` first, destroying the results the room is reading, which is the
    very trade this guard exists to prevent.
    """

    def __init__(self) -> None:
        super().__init__("Round is already revealed")
