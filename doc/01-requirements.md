# 01 — Requirements

## Actors

- **Host** — the participant who created the room. Controls the round (reveal,
  reset), may toggle whether they personally vote, and holds the room-control actions:
  handing the role to another participant (FR-20) and removing one (FR-21). See
  [Host role](03-decisions.md).
- **Participant** — anyone else in the room. Always votes; cannot control the round.
  May be removed from the room by the host (FR-21).

## Functional requirements

### Room lifecycle
- **FR-1** A user can create a room. The creator becomes the host.
- **FR-2** Each room has a **system-generated unique ID**. Rooms have no editable
  name.
- **FR-2a** Room creation returns a short room **code** and a **shareable link**.
- **FR-3** A user joins a room via the link or by entering the code, providing a
  **display name** only (no auth).
- **FR-4** Display names need not be unique; participants are distinguished by an
  internal ID.
- **FR-5** A room accepts at most **30 participants**. Joins beyond that are rejected
  with a clear message.
- **FR-6** A room lives in memory while occupied and is discarded **1 minute**
  after the last participant has left.
- **FR-7** If the host disconnects, the host role auto-transfers to another
  participant so the room remains controllable — see FR-20 for the deliberate
  handover.

### Voting round
- **FR-8** The room works on a **single current item** at a time — an optional
  free-text topic/title the host can set. There is no backlog. The UI does not
  open voting until a topic is set; that precondition is UI-only — the domain
  accepts votes regardless (D-43).
- **FR-9** The estimation deck is **numbers only** — no special cards (`?`,
  coffee), no T-shirt sizes. Its **default** is the Fibonacci set `1, 2, 3, 5, 8,
  13, 21`, which a room gets when its host names no card values; a host who does
  name them sets the deck instead (FR-22). The default satisfies FR-22's rules
  like any other deck, which is why it has no `0` card (see D-49).
- **FR-10** During a round, each voter privately selects one card. Others see only
  *that* a participant has voted, not the value.
- **FR-11** A voter may change their selection until the round is revealed.
- **FR-12** The host, and only the host, reveals the round. On reveal all votes
  become visible to everyone. The UI additionally offers reveal only once a topic
  is set and at least one vote is cast, and hides it when nobody is eligible to
  vote; these gates are UI-only — the domain reveals unconditionally (D-43, D-12).
- **FR-13** The host, and only the host, resets/clears to start a new round.
- **FR-14** The host can toggle whether they themselves vote. All other
  participants always vote.

### Results
- **FR-15** After reveal, the room shows each participant's card.
- **FR-16** The room shows basic stats: the **average** of numeric votes and a
  **consensus** indicator (true when all votes are equal).

### Presence & reconnection
- **FR-17** Live participant presence (who is in the room, who has voted) updates
  in real time for everyone.
- **FR-18** A dropped participant who reconnects rejoins as a **new** participant
  (same name if re-entered); any vote in the in-progress round is lost.
- **FR-19** A participant can change their **own display name** at any time; the
  new name reaches everyone in real time. Only the participant themselves can do
  it — the rename carries no target — and validation matches joining: trimmed,
  non-blank, ≤ 40 chars, non-unique (D-42).

### Room control
Host actions taken on *another* participant, as distinct from controlling the round.
- **FR-20** The host can hand the host role to another participant in the room. The
  role **moves**: the former host becomes an ordinary participant and votes, and the
  new host votes by default. There is exactly one host at any moment.
- **FR-21** The host can remove another participant from the room. The removed
  participant is dropped from the room along with their vote, is told that the host
  removed them, and their connection ends. Removal is **not a ban**: the room code
  still works, so they may rejoin at once as a new participant (FR-18). The host
  cannot remove themselves — a host who wants to leave hands the role over first
  (FR-20). Removal frees a seat against the FR-5 capacity limit.

### Room configuration
- **FR-22** The host chooses the room's **card values when creating it**, in one
  optional comma-separated field. Left blank, the room gets the FR-9 Fibonacci
  default. Each value must be a number from **`1` to `999`** inclusive, and at most
  6 characters once normalized to a canonical form (`1.0` and `01` both mean `1`).
  Decimals inside that range are allowed, so `1.5` is a card and `0.5` is not; the
  normalized form a card shows is always a plain number, never exponent notation.
  A deck holds **2 to 12** cards, in the order the host
  entered them, and repeated values are **rejected** rather than deduplicated. The
  deck is **fixed for the room's life** — there is no way to change it afterwards,
  and a host who wants different values creates a new room.

### Client recall
- **FR-23** The browser remembers, per device, the **display name** and the **card
  values** a user last submitted, and offers them back as the starting value of the
  matching field: the name wherever one is asked for (creating a room, joining,
  the rejoin prompt), the card values when creating a room. Submitting a different
  value replaces what is remembered; a rename (FR-19) counts as submitting a name.
  A recalled value is a starting value only — it is still editable, still validated
  the same way, and nothing is recalled before the first submission. Recall is a
  convenience, so a browser that refuses storage simply starts with empty fields
  (D-52).

## Non-functional requirements

- **NFR-1 Transport** — Real-time state is delivered over WebSocket. Creating and
  joining a room may use HTTP; nothing after that does (D-50).
- **NFR-2 No persistence** — State is in-memory only; a backend restart loses all
  rooms. Acceptable for MVP.
- **NFR-3 Footprint** — Backend and frontend each run in their own Docker container.
- **NFR-4 Capacity** — Support at least 30 participants per room without noticeable
  lag.
- **NFR-5 Memory hygiene** — Empty rooms are cleaned up after a grace period so
  memory does not grow unbounded.
- **NFR-6 Simplicity** — No database, no external service dependencies for core
  flows.

## Open questions

None for the contract. Open phase work is tracked in
[07-v0.1-phase.md](07-v0.1-phase.md).
