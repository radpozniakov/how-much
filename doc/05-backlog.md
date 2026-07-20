# 05 — Backlog

Sequenced work to build the MVP defined in [02-current-scope.md](02-current-scope.md).

## Approach — vertical slices, backend-first

Each item below is a **thin vertical slice through the domain**: a single
capability that can be validated the moment it lands, not a horizontal layer that
only pays off later. We sequence in three passes:

1. **Backend domain (S1–S5)** — the room/voting model built as tested Python
   services with a minimal HTTP surface. **No WebSocket yet.** Each slice is proven
   by unit/API tests and `curl` before we move on. This front-loads the risky,
   valuable logic and keeps it independent of any transport.
2. **Real-time transport (S6)** — WebSocket wrapped *around* a domain that already
   works: connection lifecycle, message protocol, and presence/round broadcast.
3. **Frontend (S7–S9)** — thin UI slices, each demoable in the browser, wiring the
   live backend to real screens.

Then deployment polish (S10). Rationale: the domain is where correctness matters
and is cheapest to test in isolation; WebSocket is a delivery mechanism, not a
feature; the UI is meaningless until there's behavior behind it.

Status legend: `TODO` · `IN PROGRESS` · `DONE`

---

## Done — scaffolding

### T1 — Backend + compose skeleton · `DONE`

Runnable FastAPI skeleton (`GET /health`, placeholder `/ws` echo), `Dockerfile`,
and `docker-compose.yml` with a bind mount + `uvicorn --reload`. **Verified:**
`compose up` clean, `/health` → `200 {"status":"ok"}`, hot reload ~2s no rebuild.

### T1b — Frontend skeleton · `DONE`

Vite (React 19 + TS) in `frontend/`, `Dockerfile`, `frontend` compose service
(port 5173, bind mount + anon `node_modules` + polling HMR), Prettier (D-26),
`VITE_*` config (D-27), dev CORS (D-28), landing page probing `/health` + `/ws`.
**Verified (real browser):** both checks green, no console errors.

---

## Phase A — Backend domain (no WebSocket)

> Delivered as tested services + minimal HTTP. Each slice ships with tests and is
> checkable via `curl`. The placeholder `/ws` echo from T1 stays untouched here.

### S1 — Room domain + creation · `DONE`

**Goal:** create a room and get back a way to share it.

**Built**
- `app/rooms/models.py` — `Room` dataclass keyed by `code` (6-char unambiguous
  alphabet, `secrets`-generated; also the unique ID per D-19); `generate_code`.
- `app/rooms/store.py` — `RoomStore` in-memory registry keyed by code, with
  collision-retried `create()`, `get()`, `clear()`; exposed as a module-level
  `store` singleton (D-4). The seam S2–S5 extend.
- `app/rooms/router.py` — `POST /rooms` (see S2 for the merged create+join shape);
  link built from the configurable base (D-30).
- `app/config.py` — `PUBLIC_BASE_URL` (env), `ROOM_CODE_LENGTH`, `room_link()`.
- Wired into `app/main.py`; echo `/ws` untouched.

**Verified** — `pytest -q` green + ruff clean; `curl -X POST /rooms` → `201`;
`HOWMUCH_PUBLIC_BASE_URL` override reflected in `link` (trailing slash stripped).

**Refs:** FR-1, FR-2, FR-2a · D-4, D-19, D-29, D-30, D-31

### S2 — Join, participants, capacity & host · `DONE`

**Goal:** people can be in a room, and it has a host.

**Built**
- `app/rooms/models.py` — `Participant` (uuid `id` + display `name`); `Room` gains
  `participants` + `host_id` and `add_participant(name)`: the first participant
  added is host (D-32), raises `RoomFull` at capacity (D-6).
- `app/rooms/errors.py` — `RoomError` base + `RoomFull` (carries the capacity),
  transport-free so the domain stays testable.
- `app/rooms/router.py` — **merged create+join**: `POST /rooms {name}` creates the
  room and adds the creator as host → `201 {participant_id, room{code, host_id,
  participants[]}, link}`; `POST /rooms/{code}/participants {name}` for everyone
  else. `JoinRequest` trims + bounds the name (D-34); code lookup is
  case-insensitive. `404` unknown room, `409` full, `422` invalid/missing name.
- `app/config.py` — `ROOM_CAPACITY` (30), `MAX_DISPLAY_NAME_LENGTH` (40).

**Revised after code review** — `POST /rooms` now creates *and* joins the creator
so the creator is provably host (was: empty room + "first to join is host", which
a non-creator could win); join codes accepted case-insensitively; config knobs
demoted from unsafe `int(env)` to plain constants; the unused separate room `id`
was dropped (the `code` is the unique ID). DTO/domain split, `RoomError` base, and
bounded code-retry were reviewed and **kept on purpose** (see notes in chat).

**Verified** — `pytest -q` → **30 passed**; ruff check + format clean. Live curl:
create as Alice → Alice is host + link; Bob joins via lowercase code → `201`, host
stays Alice; create with no name → `422`.

**Refs:** FR-1, FR-3, FR-4, FR-5 · D-6, D-9, D-10, D-13, D-32, D-33, D-34

### S3 — Voting round · `DONE`

**Goal:** a round can be run and votes are private until reveal.

**Built**
- `app/rooms/models.py` — `Room` gains the round: `current_item`, private
  `votes` (`participant_id → card`), and `host_voting`. Methods `set_item`
  (host-only, trims/clears the topic), `cast_vote` (guards in order:
  unknown-participant → host-opted-out → invalid-card; overwrites on re-vote),
  `set_host_voting` (host-only; opting out drops the host's vote), and
  `expected_voter_ids()` (all voters minus an opted-out host — the S4 reveal gate).
- `app/rooms/errors.py` — `InvalidCard`, `HostNotVoting`, `UnknownParticipant`,
  `NotHost` (all transport-free `RoomError` subclasses).
- `app/config.py` — `FIBONACCI_DECK` (`0,1,2,3,5,8,13,21`, D-8) as the single
  source of valid cards; `MAX_TOPIC_LENGTH` (200).
- `app/rooms/router.py` — `PUT /rooms/{code}/item`, `/vote`, `/host-voting`;
  `ParticipantView` gains `has_voted` and `RoomView` gains `current_item` +
  `host_voting` — **card values are never on any view pre-reveal** (FR-10). Card
  validated at the DTO (fast 422) and re-checked in the domain. `_require_room`
  helper centralizes 404 + case-insensitive lookup.
- `app/main.py` — one `@app.exception_handler(RoomError)` maps domain errors to
  status codes (`RoomFull`/`HostNotVoting`→409, `InvalidCard`→422,
  `UnknownParticipant`→404, `NotHost`→403) with a `{"detail": …}` body; the S2
  inline `RoomFull` try/except was removed in favour of it.

**Verified** — `pytest -q` → **61 passed**; `ruff check` + `ruff format --check`
clean. The vote-leak test asserts structurally that the view exposes presence
(`has_voted`) but no card value; host opt-out drops the host's vote and rejects a
host vote (409); non-host set-item/toggle → 403.

**Out of scope (deferred):** reveal/reset, results math (average/consensus), and
`reset_round()` → S4; real-time broadcast → S6.

**Validate:** cast/change votes via API; the pre-reveal view shows voter presence
but no numbers. **Refs:** FR-8–FR-11, FR-14 · D-7, D-8, D-11, D-14

### S4 — Reveal, reset & results · `TODO`

**Goal:** the payoff — reveal all cards with stats, then start fresh.

- Host-only reveal → all votes visible; host-only reset → new round.
- Results: every participant's card + **average** of numeric votes + **consensus**
  flag (all equal).
- Tests: non-host reveal/reset rejected, average math, consensus true/false,
  reset clears votes and topic.

**Validate:** run a full round via API — reveal shows all cards + correct
average/consensus; reset returns a clean round. **Refs:** FR-12, FR-13, FR-15, FR-16 · D-12, D-16

### S5 — Room lifecycle: leave, host transfer & cleanup · `TODO`

**Goal:** rooms stay controllable and don't leak memory.

- Participant leave as a domain operation.
- Host **auto-transfer** to another participant when the host leaves.
- Empty room discarded **1 minute** after the last participant leaves
  (tested with an injectable clock, not a real wait).
- Tests: leave removes participant, host leaving promotes another, empty-room
  timer fires and frees the room, re-occupancy cancels cleanup.

**Validate:** simulate leaves in tests; host transfer and timed cleanup both fire.
**Refs:** FR-6, FR-7 · D-13, D-18

---

## Phase B — Real-time transport

### S6 — WebSocket transport & live state · `TODO`

**Goal:** wrap the working domain in real-time delivery.

- Replace the T1 echo `/ws` with a real message **envelope/protocol** (typed
  client→server and server→client messages).
- Connection open/close lifecycle; disconnect wired to the S5 leave/transfer path.
- **Broadcast** presence and round state to everyone in a room (FR-17).
- Room creation stays HTTP (D-5); joins and round actions move onto the socket.
- Tests: two WS clients see live presence, who-voted, and reveal in sync;
  disconnect triggers host transfer.

**Validate:** two `wscat`/pytest clients in one room see presence + a full round
update in real time. **Refs:** NFR-1, FR-17 · D-5

---

## Phase C — Frontend (thin UI slices)

> Each slice is demoable in a real browser against the live backend.

### S7 — Create & join screens · `TODO`

Create screen → shows code + shareable link; join by link or code with a display
name; room view listing live participants. **Validate:** two browsers create/join
one room and see each other. **Refs:** FR-1–FR-4, FR-17

### S8 — Voting UI · `TODO`

Deck of Fibonacci cards, private selection, change-before-reveal, and who-voted
indicators. **Validate:** in-browser voting; nobody sees values pre-reveal.
**Refs:** FR-9–FR-11, FR-17

### S9 — Reveal, results & host controls · `TODO`

Host-only reveal/reset buttons, results display (all cards + average + consensus),
host voting toggle, set-topic input. **Validate:** full round end-to-end across two
browsers. **Refs:** FR-12–FR-16 · D-12, D-14, D-16

---

## Phase D — Deployment

### S10 — Deployment polish · `TODO`

Tighten dev CORS to explicit origins (D-28), finalize Docker/compose for a
deployable setup, config, and run docs. **Refs:** NFR-3

---

## Out of backlog (MVP)

Everything in the "Out of scope" list of
[02-current-scope.md](02-current-scope.md) — accounts, persistence, backlog/tickets,
multiple decks, distribution charts, reconnection restore, timers, i18n.
