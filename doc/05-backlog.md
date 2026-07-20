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
- `app/rooms/models.py` — `Room` dataclass with `id` (uuid4 hex, D-19) + `code`
  (6-char unambiguous alphabet, `secrets`-generated); `generate_id`/`generate_code`.
- `app/rooms/store.py` — `RoomStore` in-memory registry keyed by code, with
  collision-retried `create()`, `get()`, `__contains__`, `__len__`, `clear()`;
  exposed as a module-level `store` singleton (D-4). The seam S2–S5 extend.
- `app/rooms/router.py` — `POST /rooms` → `201 {"id","code","link"}`
  (`CreateRoomResponse`); link built from configurable base (D-30).
- `app/config.py` — `PUBLIC_BASE_URL`, `ROOM_CODE_LENGTH`, `room_link()`.
- Wired into `app/main.py`; echo `/ws` untouched.

**Tests (pytest + `TestClient`, 13 total)** — code length/alphabet (ambiguous
chars excluded), id hex/uniqueness (1000×), store create/get/miss/clear, unique
codes across 1000 creates; API: `201` + response shape, code length/alphabet,
`link == base + /room/{code}`, distinct rooms, round-trips into the store.

**Verified**
1. `pytest -q` → 13 passed; `ruff check` + `ruff format --check` clean.
2. `curl -X POST :8000/rooms` → `201` with `id`/`code`/`link`.
3. `HOWMUCH_PUBLIC_BASE_URL` override reflected in `link` (trailing slash stripped).

**Refs:** FR-1, FR-2, FR-2a · D-4, D-19, D-29, D-30, D-31

### S2 — Join, participants, capacity & host · `TODO`

**Goal:** people can be in a room, and it has a host.

- `Participant` entity (internal ID, display name; names non-unique).
- Join by code → participant added; creator resolves to **host** (D-13).
- Capacity cap **30**; joins beyond are rejected with a clear message.
- Tests: join adds participant, duplicate names coexist, 31st join rejected,
  first/creator is host.

**Validate:** join a room via API and read back the participant list; capacity
rejection returns a clear error. **Refs:** FR-3, FR-4, FR-5, FR-1 · D-6, D-9, D-10, D-13

### S3 — Voting round · `TODO`

**Goal:** a round can be run and votes are private until reveal.

- Set the single current **item** (optional free-text topic).
- Fibonacci deck `0,1,2,3,5,8,13,21`; cast a vote, change it before reveal.
- Expose *who has voted* without exposing values.
- Host voting toggle: host may opt in/out; others always vote (FR-14, D-14).
- Tests: vote recorded, re-vote overwrites, values never leaked pre-reveal,
  invalid card rejected, host-excluded case.

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
