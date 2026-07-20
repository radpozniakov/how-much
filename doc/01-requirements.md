# 01 — Requirements

## Actors

- **Host** — the participant who created the room. Controls the round (reveal,
  reset) and may toggle whether they personally vote. See [Host role](03-decisions.md).
- **Participant** — anyone else in the room. Always votes; cannot control the round.

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
  participant so the room remains controllable.

### Voting round
- **FR-8** The room works on a **single current item** at a time — an optional
  free-text topic/title the host can set. There is no backlog.
- **FR-9** The estimation deck is **Fibonacci numbers only**: `0, 1, 2, 3, 5, 8,
  13, 21`. No `40`/`100`, no special cards (`?`, coffee).
- **FR-10** During a round, each voter privately selects one card. Others see only
  *that* a participant has voted, not the value.
- **FR-11** A voter may change their selection until the round is revealed.
- **FR-12** The host, and only the host, reveals the round. On reveal all votes
  become visible to everyone.
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

## Non-functional requirements

- **NFR-1 Transport** — Real-time state is delivered over WebSocket. Room creation
  may use HTTP.
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

- None open. All MVP decisions resolved — see [03-decisions.md](03-decisions.md).
