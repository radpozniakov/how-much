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

### S4 — Reveal, reset & results · `DONE`

**Goal:** the payoff — reveal all cards with stats, then start fresh.

**Built**
- `app/rooms/models.py` — `Room.reveal` (host-only; unconditional, no all-voted
  gate; idempotent), `reset_round` (host-only; clears votes, item, and the
  revealed flag — but leaves `host_voting`, a facilitator preference that persists
  across rounds), and `results()`: the single FR-10 gate, returning `None` until
  revealed and otherwise a `RoundResults` with every cast card, the **average** of
  the numeric votes, and a **consensus** flag (all equal). Stats are over cast
  votes only (reveal is unconditional), average unrounded (display is the
  frontend's job). New `RoundResults` dataclass.
- `app/rooms/errors.py` — `RoundRevealed`, which locks `set_item`/`cast_vote`/
  `set_host_voting` once cards are shown (the host resets to re-estimate).
- `app/rooms/router.py` — `POST /rooms/{code}/reveal` and `/reset` (host-only via
  `HostActionRequest.participant_id`); `RoomView` gains `revealed` + a `results`
  (`ResultsView`) populated **only** once revealed, so no card value is reachable
  pre-reveal.
- `app/main.py` — `RoundRevealed` mapped to 409.

**Verified** — `pytest -q` green; reveal/reset covered by `test_reveal_domain.py`
+ `test_reveal_api.py` (32 tests): non-host reveal/reset → 403, average math,
consensus true/false, reset clears votes + topic and re-hides results, and the
pre-reveal view carries no card value.

**Validate:** run a full round via API — reveal shows all cards + correct
average/consensus; reset returns a clean round. **Refs:** FR-12, FR-13, FR-15, FR-16 · D-12, D-16

### S5 — Room lifecycle: leave, host transfer & cleanup · `DONE`

**Goal:** rooms stay controllable and don't leak memory.

**Built**
- `app/rooms/models.py` — `Room.remove_participant` (drops the participant and
  their vote; on a host leave the role **auto-transfers** to the oldest remaining
  participant with `host_voting` reset to on — D-13/FR-7; raises
  `UnknownParticipant` if absent). Deliberately bypasses the `RoundRevealed` guard
  — a leave is not a re-estimate, so it may recompute revealed stats. New
  `empty_since` marker: store-managed, the domain only *clears* it (in
  `add_participant`, so re-occupancy cancels a pending cleanup) and never reads or
  stamps it, keeping the domain clock-free.
- `app/rooms/store.py` — an **injectable clock** (`time.monotonic` default) so the
  cleanup timer is tested without a real wait; `leave()` stamps `empty_since` only
  when the room empties; public `sweep()` discards rooms empty ≥ TTL (inclusive),
  called lazily on `get()`/`create()` — no asyncio task while HTTP-only (S6).
- `app/config.py` — `EMPTY_ROOM_TTL_SECONDS` (60, D-18/FR-6).
- `app/rooms/router.py` — `DELETE /rooms/{code}/participants/{participant_id}`
  (participant id as a path segment) → `200 + RoomView`. `errors.py`/`main.py`
  untouched: unknown room and unknown participant both reuse the existing
  `UnknownParticipant`/`_require_room` → 404.

**Verified** — `pytest -q` → **119 passed** (93 prior + 26 new); `ruff check` +
`ruff format --check` clean. Domain tests use an injected `FakeClock` (no real
sleep): leave drops participant+vote, host leaving promotes the oldest remaining,
the empty-room timer fires at the inclusive TTL boundary and frees the room,
re-occupancy cancels cleanup, and a mid-reveal leave recomputes stats (asserted to
flip consensus False→True and to yield a revealed-but-empty round). API tests cover
the DELETE roster/transfer/empty paths, 404s (unknown room, unknown participant,
double-leave), and rejoin within grace.

**Out of scope (deferred):** real disconnect detection wired to this leave/transfer
path, and broadcasting the updated room → S6.

**Validate:** simulate leaves in tests; host transfer and timed cleanup both fire.
**Refs:** FR-6, FR-7 · D-13, D-18

---

## Phase B — Real-time transport

> Wrap the working domain in WebSocket delivery. The domain stays the single
> source of truth: every mutation goes through the same `Room`/`store` methods the
> HTTP layer already calls, and the state broadcast hangs off the **mutation**, not
> the transport — so an action driven over HTTP (`curl`) and one driven over the
> socket both reach every connected client identically (D-36). The S3/S4 HTTP round
> routes are **kept alongside** the socket through Phase B for `curl`-testable
> reliability, then dropped once the frontend exercises the socket path (D-35).
> Delivered as two thin slices: S6a re-does presence/lifecycle (S2 + S5) over the
> socket, S6b re-does the round (S3 + S4).

### S6a — Connection lifecycle, presence & room channel · `DONE`

**Goal:** be present in a room in real time — connect, appear to everyone else,
and disappear (with host transfer / cleanup) the moment the socket drops.

**Built**
- `app/rooms/views.py` (new) — the `RoomView`/`ParticipantView`/`ResultsView` DTOs
  and a public `room_view(room)` builder, extracted from `router.py` so both
  transports build the *same* snapshot without the socket importing a router
  private. Behaviour-neutral move.
- `app/rooms/messages.py` (new) — the typed envelope: outbound `room_state_frame`
  (a full `RoomView`, D-36) and `error_frame(reason, message)`; inbound `JoinFrame`
  / `AttachFrame` (Pydantic; `join` reuses the HTTP name trim/bound rules) and
  `parse_client_frame`, which raises `BadFrame` on malformed/unknown input.
- `app/rooms/connection.py` (new) — `ConnectionManager` (`code → {pid → socket}`)
  with singleton `manager`: `register` (writes the new socket **before** closing a
  superseded one — ordering is load-bearing), an **identity-checked `unregister`
  that returns whether it removed *this* socket**, and a `broadcast` that skips a
  failing socket without aborting the fan-out (removal stays the handler's job, so
  the leave still fires). Plus `broadcast_room_state(room)`.
- `app/rooms/store.py` — `join(code, name)`: a single synchronous `get`-then-
  `add_participant` (returns `None` if absent, propagates `RoomFull`). No `await`
  between lookup and mutation, so the background sweeper can't discard the room
  mid-handshake.
- `app/rooms/ws.py` (new) — `ws_router` with `/ws/rooms/{code}`: `accept` → await
  the first frame (`join` new / `attach` existing; the creator attaches with its
  HTTP-issued id, D-5) → resolve+mutate synchronously → `register` before the join
  `room_state` fan-out (FR-17). The receive loop detects disconnect (an extra frame
  → `error(unsupported)`, stays connected). On drop, the `finally` runs `store.leave`
  (host auto-transfer D-13, empty-room grace D-18) and rebroadcasts **only when it
  owned the registration** — a superseded socket does nothing (guards a
  self-kick). A reconnect is a fresh join (D-15).
- `app/rooms/router.py` — `join_room`/`leave_room` route through `store.join`/
  `store.leave` and `await broadcast_room_state`, so an HTTP-driven presence change
  reflects to connected sockets (D-36); `join` maps `None → 404`.
- `app/main.py` — a `lifespan` runs a background sweeper task that calls
  `store.sweep()` **by attribute each iteration** (no import-time capture) and is
  cancelled cleanly on shutdown; `ws_router` wired in. The placeholder `/ws` echo
  stays for now (retired in S10).
- `app/config.py` — `SWEEP_INTERVAL_SECONDS` (15).

**Verified** — `pytest -q` → **139 passed** (118 prior + 21 new); `ruff check` +
`ruff format --check` clean. New coverage: `test_connection.py` (fan-out isolation,
identity-checked unregister, replace-and-close, dead-socket skip); `test_ws_presence.py`
(creator attach, join fan-out, unknown/full-room + bad-attach + malformed rejects,
host-drop transfer, non-host drop, **D-36 cross-transport** via HTTP POST/DELETE,
**duplicate-attach keeps the live participant**, HTTP-DELETE-while-connected,
second-frame `unsupported`, and a structural FR-10 no-card-pre-reveal assertion);
`test_sweeper.py` (the lifespan task fires `store.sweep` and cancels cleanly, no
real TTL wait).

**Out of scope (deferred):** round actions over the socket + their error frames →
**S6b**; dropping the S3/S4 HTTP round routes and the `/ws` echo → **S10** (D-35);
heartbeat/handshake-timeout (accepted MVP risk).

**Validate:** two `wscat`/pytest clients in one room see each other appear and
disappear live; dropping the host promotes the oldest remaining participant; an
emptied room is reclaimed after the grace period. **Refs:** NFR-1, FR-17, FR-6,
FR-7 · D-5, D-13, D-15, D-18, D-35, D-36

### S6b — Round actions over the socket · `DONE`

**Goal:** run a full estimation round in real time.

**Built**
- `app/rooms/messages.py` — five round frames (`SetItemFrame`, `CastVoteFrame`,
  `SetHostVotingFrame`, `RevealFrame`, `ResetFrame`) that carry **no
  `participant_id`**: the socket already knows the caller (identity fixed at
  handshake), so the handler acts as that connection and a client can't spoof
  another (F2). `SetItemFrame` replicates the HTTP `MAX_TOPIC_LENGTH` bound exactly
  (`len(strip())`) since `Room.set_item` only trims (F3). Separate handshake/round
  registries share one `_parse` helper; `parse_handshake_frame` (renamed from
  `parse_client_frame`) and `parse_round_frame` each reject the other phase's
  frames as `BadFrame`. `room_error_reason(exc)` maps each domain error to a stable
  WS slug (`not_host`, `invalid_card`, `host_not_voting`, `round_revealed`,
  `not_in_room`; default `internal`) — the socket's counterpart to `main`'s
  HTTP-status map.
- `app/rooms/connection.py` — `apply_and_broadcast(room, action)`: run the domain
  mutation, then broadcast the new snapshot. The single seam both transports use,
  so the fan-out can't be forgotten at a call site; broadcast fires only on
  success, so a rejected action never disturbs other clients (D-36).
- `app/rooms/ws.py` — the receive loop replaces the S6a `unsupported` placeholder:
  `receive_json` → `parse_round_frame` → `isinstance` dispatch (via
  `_apply_round`) through `apply_and_broadcast`, using the socket's own identity. A
  bad frame answers `bad_request` and **stays connected**; `WebSocketDisconnect`
  propagates to the existing `finally` (the single-owner leave still runs); the
  room is re-resolved each action (`room_not_found` if it was reclaimed mid-session);
  a `RoomError` goes back to the sender alone.
- `app/rooms/router.py` — the five S3/S4 round routes now route through
  `apply_and_broadcast` too (they previously did **not** broadcast), so a `curl`
  action reflects to connected sockets (D-35/D-36); response shape unchanged, and a
  domain error still 4xx-es before any broadcast.

**Verified** — `pytest -q` → **152 passed** (139 prior + 13 new); `ruff check` +
`ruff format --check` clean. New coverage in `test_ws_rounds.py`: full round
(item → private vote → reveal shows cards + average + consensus → reset clears);
connection-identity (a spoofed `participant_id` is ignored); error-to-sender-only
(non-host reveal errors the sender, no stray broadcast, domain unchanged); the
`invalid_card` / `round_revealed` / `host_not_voting` slugs; **D-36 both
directions** (HTTP `PUT /vote` reflects to a socket; a WS `reveal` reaches a second
socket and the store); over-long topic → `bad_request` (F3); malformed frame keeps
the socket alive; act-after-HTTP-DELETE → `not_in_room`; act-after-sweep →
`room_not_found`; and an F1 regression asserting all five HTTP round routes
broadcast. `test_ws_presence.py`'s second-handshake test now asserts `bad_request`.

**Out of scope (deferred):** dropping the S3/S4 HTTP round routes and the `/ws`
echo → **S10** (D-35); heartbeat/handshake-timeout (accepted MVP risk); a distinct
`invalid_topic` WS slug for UX parity with the HTTP 422 (S10).

**Accepted limitations (no-auth MVP, D-9):**
- *Identity is not authentication.* A `participant_id` is broadcast to everyone in
  the room (it appears in every `room_state`), and `attach` admits any id currently
  in the room — so any member can reconnect *as* another member, including the
  host, and drive host-only actions. This matches the pre-existing HTTP model
  (the S3/S4 routes already trust a body-supplied `participant_id`). The S6b
  "round frames carry no `participant_id`" rule (F2) is therefore **per-socket
  integrity, not impersonation defence**: it stops redirecting an action *within an
  established socket*, nothing more. Real auth is out of scope for the MVP.
- *Reconnect requires the client to keep its id.* A socket `join` mints a fresh
  participant every time; only `attach` resumes an existing identity. So the
  frontend (S7+) **must persist the `participant_id`** returned at create/join and
  reconnect via `attach` — otherwise a dropped client comes back as a brand-new
  person and the old identity is grace-swept. The server assumes this contract but
  does not enforce it.

**Validate:** two clients run item → private votes → reveal → reset entirely over
the socket, in sync; a rejected action (non-host reveal, bad card) errors only the
sender. **Refs:** NFR-1, FR-8–FR-17 · D-5, D-8, D-12, D-14, D-35, D-36

---

## Phase C — Frontend (thin UI slices)

> Each slice is demoable in a real browser (`compose up`) against the live
> backend, unchanged. All three share one **frontend foundation** that S7
> establishes and S8–S9 extend, mirroring how S6a laid the socket lifecycle down
> before S6b added round actions:
>
> - **Routing** — `/` (create/join) and `/room/:code` (room), matching the D-30
>   link shape `{base}/room/{code}`. This replaces the T1b scaffold probe page.
> - **A typed WebSocket client** — opens `/ws/rooms/{code}`, sends the handshake
>   frame, and applies every inbound `room_state` snapshot into a room store as
>   the **single source of truth** (D-36) — the UI renders the last snapshot and
>   never keeps its own authoritative copy. `error` frames surface to the acting
>   user. It reuses the frame shapes the backend already defines in `messages.py`.
> - **Identity + reconnect** — the frontend persists the `participant_id` from
>   create/join and reconnects via `attach` (the D-15 / S6b contract the server
>   *assumes but does not enforce*). Past the empty-room grace (D-18) a stale id
>   is rejected `not_in_room`, so reconnect falls back to a fresh join (D-15).
>
> The UI drives the **socket** path, not the S3/S4 HTTP round routes — those
> routes and the `/ws` echo are retired once these slices are live (S10, D-35).

### S7 — Room shell: connect, create, join & live presence · `DONE`

**Goal:** be in a room in a browser — create or join by link/code, land in the
room, and see everyone appear and disappear live. The foundation slice (largest),
mirroring S6a. Replaces the T1b scaffold probe page.

**Built** (no new **UI/runtime** packages — routing, state, and the WS client are
hand-rolled on native primitives: History API, `WebSocket`, `fetch`,
`sessionStorage` + React built-ins; native HTML elements only, polished later)
- `frontend/src/lib/router.ts` — History-API routing: `useRoute()` + `navigate()` +
  `matchRoom()` over `popstate`, serving `/` (Landing) and `/room/:code` (Room)
  matching the D-30 link shape (D-37).
- `frontend/src/lib/roomSocket.ts` — the typed `RoomSocket`: an external store
  consumed via `useSyncExternalStore` with a **cached snapshot** (`getSnapshot`
  returns a stable reference rebuilt only inside mutations, or
  `useSyncExternalStore` infinite-loops — guarded by a regression test).
  **Phase-scoped reconnect:** a close is terminal (→ `rejected`) **iff no
  `room_state` arrived yet** (handshake); once a snapshot lands, closes retry and
  mid-session `error` frames are non-fatal (a reason-slug whitelist would
  misclassify, since S8/S9 mid-session errors don't close). Attach-only handshake
  (D-38).
- `frontend/src/lib/useRoom.ts` — hook owning one stable `RoomSocket`,
  StrictMode-safe (socket lives outside React, so double-effects can't spawn
  duplicate connections); clears stale identity on `not_in_room`.
- `frontend/src/lib/session.ts` — per-tab `{code, participantId}` in
  `sessionStorage`, try/caught throwing-storage fallback (D-39).
- `frontend/src/lib/api.ts` — `createRoom` / `joinRoom` over HTTP; normalizes
  **both** error `detail` shapes (`{detail:"…"}` 404/409 vs `{detail:[{…,msg}]}`
  422) into a rendered string.
- `frontend/src/types.ts`, `config.ts` — backend-mirroring DTOs; `API_URL` +
  `WS_BASE_URL` + `roomSocketUrl(code)`. **Renamed `VITE_WS_URL` →
  `VITE_WS_BASE_URL`** (a base — client builds `${WS_BASE_URL}/ws/rooms/{code}`;
  fails safe vs a stale full-value `.env`) across `config.ts`, `docker-compose.yml`,
  `.env.example`, `vite-env.d.ts`.
- `frontend/src/App.tsx` (rewrite) + `pages/Landing.tsx` + `pages/Room.tsx` — route
  switch; pages stay thin. Components in `components/<Name>/` (tsx + test + CSS
  module), typed `FC<Props>`: `CreateRoomForm`, `JoinRoomForm`, `JoinPrompt`,
  `Roster` (host badge guarding `host_id === null` during transfer/empty),
  `StatusIndicator` (connecting / live / reconnecting), `ShareLink` (always-
  selectable readonly input + `clipboard`→`execCommand` copy fallback for
  non-secure LAN origins).
- **Create** (`POST /rooms {name}` → code + link, `navigate` into `/room/:code` via
  canonical `room.code` D-17, `attach` with the returned id) and **Join**
  (`POST /rooms/{code}/participants {name}` → `attach`). HTTP-then-`attach` (not a
  socket `join`) is deliberate (D-38): the joiner must learn its **own**
  `participant_id`, which a snapshot can't reveal (names non-unique, D-10). POSTs
  fire from event handlers, never a bare `useEffect`, so StrictMode can't mint two
  participants. `404`/`409`(cap)/`422` → inline errors.
- Lint: enabled type-aware `@typescript-eslint/no-deprecated`; migrated deprecated
  React `FormEvent` → `SyntheticEvent`.

**Verified** — **Vitest + Testing Library** added (dev-only, never bundled);
`npm run test` → **36 unit tests** across `lib/` and components; `npm run build`
(`tsc -b`) + lint + format clean. Coverage includes `api` detail-normalization,
`router` `matchRoom`/`navigate`, `session` round-trip + throwing-storage fallback,
and `roomSocket` (mock `WebSocket` + fake timers): `attach` on open, `room_state`
→ live, handshake-close → `rejected`/no-retry, live-close → reconnecting/retry,
live `error` non-fatal, `closedByClient` suppression, and the cached-`getSnapshot`
stable-reference regression guard.

**Notes:** host auto-transfer (D-13/FR-7) and empty-room cleanup (D-18/FR-6) are
backend behaviors — the UI reflects them only as roster / host-badge changes via
the broadcast. A plain reload is rejected `not_in_room` (backend drops a
participant the instant its socket closes — only the empty-*room* grace of D-18
exists), clears the session, and rejoins as a **fresh** participant (name
continuity not guaranteed, in-round vote lost — FR-18/D-15, expected behavior). No
voting yet. Key findings above are promoted to `03-decisions.md` as D-37–D-39.

**Validate:** two browsers create/join one room via the shared link and see each
other live; reloading rejoins gracefully as a fresh participant; closing the host's
tab promotes the oldest remaining participant in the other browser's roster.
**Refs:** FR-1–FR-7, FR-17, FR-18, NFR-1 · D-5, D-9, D-10, D-13, D-15, D-17, D-18,
D-30, D-36, D-37, D-38, D-39

### S8 — Voting UI · `DONE`

**Goal:** cast and change a private vote; see *who* has voted, never the values.

> **Built via ralph** from the ralplan-consensus plan below (Planner → Architect
> SOUND → Critic APPROVE, 2 iterations). Scope was S8 only (voting — no
> reveal/results/host controls, which are S9), extending the S7 foundation.
> **Verified:** 51 frontend tests green (36 → 51), `npm run build`/`lint`/
> `format:check` clean, reviewer (architect) APPROVED against all acceptance
> criteria, FR-10 no-value-leak confirmed by inspection. The plan below is an
> accurate record of what shipped.

**Constraint (UI):** unchanged from S7 — no new **UI/runtime** packages (native
`<button>` grid + React built-ins; CSS modules; component-per-folder with colocated
tests). Vitest + Testing Library (dev-only, already installed) is the test stack.

**Principles**
1. **No optimistic *vote state*** — the last `room_state` snapshot is the single
   source of truth (D-36). The one piece of local state introduced is the user's
   own selected-card **highlight**, a UI affordance the pre-reveal snapshot
   structurally cannot carry (it exposes `has_voted`, never the value — FR-10).
2. Extend the S7 seams (`RoomSocket`, `useRoom`, `Roster`); don't fork them — keep
   the single stable socket and StrictMode safety.
3. Add only the `cast_vote` frame now; defer the other four (`set_item`,
   `set_host_voting`, `reveal`, `reset`) to S9.
4. Privacy by construction: never render a card value pre-reveal.

**Module layout** (`frontend/src/`)
- `types.ts` (edit) — add `CastVoteFrame = { type: 'cast_vote'; card: string }`
  (card is a **string**, mirroring the authoritative backend frame in
  `messages.py`); extend `ClientFrame` to `{ type:'attach'; … } | CastVoteFrame`.
  Narrow the line-40 S8 comment to note the four S9 frames remain. `RoomView`
  already carries `current_item` / `revealed` / `participants[].has_voted` /
  `results` — no type change there.
- `lib/deck.ts` (new) — `export const FIBONACCI_DECK = ['0','1','2','3','5','8',
  '13','21'] as const` (strings, to match the frame; the single client-side mirror
  of backend `config.FIBONACCI_DECK`, D-8/FR-9 — drift is the only path to a server
  `invalid_card`).
- `lib/roomSocket.ts` (edit) — the receive-only socket gains **guarded outbound
  send**: `send = (frame: ClientFrame): void => { if (this.ws === null ||
  this.state.status !== 'live') return; this.ws.send(JSON.stringify(frame)) }`.
  No queue, no throw — a frame sent while not `live` (handshake / reconnecting)
  no-ops silently (a resend is the user's next click). `this.state.status` is a
  plain instance field replaced atomically in `setState`, and `room_state` sets
  `room` + `status:'live'` in one `setState`, so there is no snapshot/status race.
  Reconnect model, `hasSnapshot` terminality, and cached `getSnapshot` untouched.
- `lib/useRoom.ts` (edit) — widen the return from `RoomState` to
  `RoomController extends RoomState { castVote: (card: string) => void }`;
  `castVote` is a `useCallback` on the stable socket forwarding
  `socket.send({ type:'cast_vote', card })`. Non-breaking for the existing
  `{ room, status, error }` consumer. Single-instance socket + stale-identity
  `clearSession` effect unchanged.
- `components/VoteDeck/` (new — `.tsx` + `.module.css` + `.test.tsx`) — props
  `{ hasVoted: boolean; revealed: boolean; onVote: (card: string) => void;
  disabled?: boolean }`. Renders `FIBONACCI_DECK` as a `<button>` grid; local
  `selected: string | null` is the **only** local state. Click → `setSelected` +
  `onVote` (re-pick overwrites — FR-11). Buttons `disabled` when `revealed`
  (locked once cards are shown) or when the `disabled` prop is set; the selected
  button gets `aria-pressed` + a highlight class.
- `components/Topic/` (new) — read-only display of `current_item`; a placeholder
  ("Waiting for the host to set a topic…") when `null`. Host input is S9.
- `components/Roster/Roster.tsx` (edit) — add a **voted** badge:
  `{p.has_voted && <span className={styles.voted}>voted</span>}` (presence only —
  FR-10; no value).
- `pages/Room.tsx` (edit) — `ConnectedRoom` destructures `castVote`; computes
  the caller's `has_voted` via `room.participants.find(p => p.id ===
  participantId)`; renders (only when `room` present) `<Topic
  currentItem={room.current_item} />` and
  `<VoteDeck hasVoted={me?.has_voted ?? false} revealed={room.revealed}
  onVote={castVote} disabled={status !== 'live'} />` below `<Roster>`. The existing
  `role="alert"` banner already surfaces a rejected action's `error` message
  (e.g. `invalid_card`) to the acting user — no new wiring.

**Key decisions & findings** (to promote to `03-decisions.md` when built)
- **The reconciliation crux — Option A (clear on a `has_voted` true→false edge).**
  The pre-reveal snapshot says *that* I voted, never *which* card (FR-10), so my
  highlight is irreducibly local and can only be *reconciled* against the
  snapshot. A `prevHasVoted` ref + an effect on `[hasVoted]` clears `selected` on a
  **true→false** transition. A fresh pick is `false→true`, so the effect never
  trips it — **no click→echo deselect race**. On `revealed` the selection stays
  highlighted but input is locked (S9 renders the actual values from `results`).
- **Every reachable true→false is a genuine vote-drop, so clearing is correct for
  all of them.** Today three backend operations drop a participant's vote —
  `reset_round` (`models.py:220`), `set_host_voting(false)` dropping the host's own
  vote (`models.py:195`), and `store.leave` on disconnect (`ws.py:169`) — and each
  is a real vote loss, so clear-on-transition is provably correct for the full set
  **without any backend change**. Rejected alternatives: *clear on
  `has_voted === false`* (fatal click→echo race — the current snapshot still shows
  `false` between click and echo); *derive selection from `results`* (`null` for
  the entire pre-reveal input phase — that value belongs to the S9 results view);
  *snapshot round-id + `key={roundId}`* (declaratively pure, but needs a new
  `RoomView` field — out of scope; deferred to S9, see the tripwire below).
- **Send is live-gated and double-guarded.** The `send` no-op is mostly
  unreachable from a click because the deck is also `disabled` whenever
  `status !== 'live'`; the guard is defensive. Silent no-op (not throw/queue) is
  the right UX since the deck is already disabled off-live.
- **`invalid_card` is unreachable from the fixed deck**; if it ever fired
  (deck/backend drift) it surfaces through the existing S7 error banner with no
  special selection handling. If a cross-client S9/HTTP call sets
  `host_voting=false` mid-round, the host's deck stays enabled and a click surfaces
  `host_not_voting` in the banner — acceptable degradation, out of S8 scope.

**Testing** (Vitest + Testing Library)
- `lib/roomSocket.test.ts` (extend) — `send` no-ops before `room_state`
  (`connecting`) and after a live-drop (`reconnecting`); once `live`, a
  `cast_vote` send appends exactly `{"type":"cast_vote","card":"5"}` to the mock
  socket's sent frames.
- `useRoom` — `castVote('8')` forwards to `socket.send` with the right frame; the
  `castVote` reference is stable across renders.
- `components/VoteDeck/VoteDeck.test.tsx` — renders all 8 deck cards; click calls
  `onVote` with the card string and highlights it; re-pick moves the highlight
  (FR-11); `revealed` disables every button; the `disabled` prop disables every
  button; **reset reconciliation** — rerender `hasVoted` true→false clears the
  highlight (pins the *observable* behavior only — a frontend test cannot assert
  which backend op caused the transition, so the "which cause" assumption is
  documented in a load-bearing code comment, not tested here); **race guard** —
  selecting a card then rerendering with `hasVoted` still `false` keeps the
  highlight (no premature clear).
- `components/Roster/Roster.test.tsx` (extend) — a `has_voted: true` participant
  shows the `voted` badge, a `false` one does not, and no card value is rendered.
- `components/Topic/Topic.test.tsx` — renders `current_item`; shows the
  placeholder when `null`.
- `test/mockWebSocket.ts` (new, deslop pass) — the controllable `MockWebSocket`
  + `lastSocket`/`deliver` helpers, extracted from `roomSocket.test.ts` and shared
  with the new `useRoom.test.ts` so the mock isn't duplicated across both.
- **AC #3** (disabled on `revealed`) and **AC #9** (`invalid_card` surfaces, socket
  stays live) are **unit-test-only** — not exercisable by the S8 two-browser manual
  validate (no reveal UI until S9; the fixed deck can't emit an invalid card).
  AC #9 rides on existing S7 coverage (`roomSocket.test.ts` live-error-keeps-socket
  + the `Room.tsx` `role="alert"` banner, reason-agnostic) — no new test needed.

**Acceptance criteria** — (1) picking a card sends `{type:'cast_vote', card}`, the
returning snapshot marks me `has_voted:true`, no value rendered; (2) re-pick sends a
new frame + moves the highlight, no duplicate/optimistic value; (3) all buttons
disabled when `revealed`; (4) all disabled when `status !== 'live'` and `send`
no-ops (no throw/queue); (5) local selection clears on host reset (`has_voted`
true→false); (6) a fresh pick stays highlighted across a snapshot still showing
`has_voted:false` (no race); (7) who-voted is presence only — a `voted` badge, no
card value in the DOM pre-reveal (FR-10); (8) `current_item` renders read-only +
placeholder when `null`; (9) a server `error` frame (`invalid_card`) surfaces in
the acting user's banner and the socket stays live.

**Follow-ups (S9)** — the four remaining `ClientFrame` variants, host controls, and
the reveal-time results view (actual card values by participant id). **S9
tripwire:** if S9+ introduces a `has_voted` true→false path that should *not* clear
the local selection (e.g. a vote retraction that isn't a round reset), `VoteDeck`
must move from edge-detection to a snapshot round-id `key` — **no frontend test can
catch this**, so it is gated here by review.

**Verification (automated gates):** `cd frontend && npm run test` (Vitest) +
`npm run build` (`tsc -b`) + `npm run lint` + `npm run format:check`.

**Validate:** in two browsers (`compose up`, backend unchanged) both cast votes;
each sees the other marked *voted* with no numbers shown; re-picking changes the
vote silently. **Refs:** FR-9–FR-11, FR-17 · D-8, D-36

### S9 — Reveal, results & host controls · `TODO` — plan `pending approval`

> **Plan reached ralplan consensus** (Planner → Architect `SOUND` → Critic
> `APPROVE`, 2 iterations) and is **pending execution approval** — not yet built.
> Scope is S9 only (host controls + reveal/results), extending the S7/S8
> foundation; the **backend is unchanged** (every frame, error slug, and snapshot
> field shipped in S6b). Once approved and built, this section is rewritten as an
> accurate record of what shipped (as S8 was).

**Goal:** the host runs the round — set a topic, opt in/out of voting, reveal, then
reset to a clean round; everyone sees the payoff (all cards by name, the average,
and a consensus flag).

**Constraint (UI):** unchanged from S7/S8 — no new **UI/runtime** packages (native
`<button>`/`<input>`/`<form>`/`<label>` + React built-ins; CSS modules;
component-per-folder with colocated tests). Vitest + Testing Library (dev-only,
installed) is the test stack. **Backend is UNCHANGED** — every frame, slug, and
snapshot field S9 uses has shipped since S6b.

**Principles**
1. **Snapshot is the only truth (D-36).** All revealed values / average /
   consensus / host identity / `host_voting` render straight from the last
   `room_state`. S9 adds **no** new client vote state — the only new local state is
   the host topic editor's controlled buffer (ephemeral edit text the snapshot
   structurally can't carry mid-keystroke).
2. Extend the S7/S8 seams, don't fork them: `roomSocket` is **untouched** (the
   `ClientFrame` union widens under it), `useRoom` gains four sibling `useCallback`s
   next to `castVote`, and VoteDeck reconciliation is **unchanged** (tripwire
   discharged below, now automated-tested).
3. Host power is **UI gating over an authoritative backend.** `host_id ===
   participantId` gates *rendering* of controls; the server re-checks every action
   and rejects with a slug that surfaces in the actor's banner. UI gating is
   convenience, never the security boundary.
4. Rejections are the actor's alone — each browser owns its socket + `error` state;
   the existing `role="alert"` banner already scopes `not_host`/`host_not_voting`/
   `round_revealed`/`invalid_card`/`bad_request` to the acting user (no new wiring).
5. **`bad_request` unreachable by construction** — the topic input `maxLength`s to
   the mirrored backend bound, so an over-length `set_item` can't be produced,
   exactly as the fixed deck makes `invalid_card` unreachable in S8.

**Module layout** (`frontend/src/`)

- **`types.ts` (edit)** — add the four round frames, mirroring `messages.py` exactly:
  ```ts
  export interface SetItemFrame { type: 'set_item'; topic: string | null }
  export interface SetHostVotingFrame { type: 'set_host_voting'; voting: boolean }
  export interface RevealFrame { type: 'reveal' }
  export interface ResetFrame { type: 'reset' }
  ```
  Widen the union and retire the line-51 comment:
  ```ts
  export type ClientFrame =
    | { type: 'attach'; participant_id: string }
    | CastVoteFrame
    | SetItemFrame | SetHostVotingFrame | RevealFrame | ResetFrame
  ```
  `RoomView`/`ResultsView` already carry `host_id`/`host_voting`/`revealed`/
  `current_item`/`results` — **no type change there**.

- **`lib/limits.ts` (new, one line)** — `export const MAX_TOPIC_LENGTH = 200` — the
  single frontend mirror of backend `config.MAX_TOPIC_LENGTH` (`config.py:34`),
  documented as such, following the same single-mirror pattern as `lib/deck.ts`
  mirroring `config.FIBONACCI_DECK`. *Rejected:* `config.ts` (its header declares it
  "endpoints only" — a contract bound is not an endpoint).

- **`lib/roomSocket.ts` — NO CHANGE.** `send = (frame: ClientFrame) => …` already
  forwards any `ClientFrame`, live-gated + JSON-serialized (`roomSocket.ts:65-67`);
  the four new variants ride the widened union. Called out explicitly in the PR
  description so a reviewer doesn't flag a "missing" socket edit.

- **`lib/useRoom.ts` (edit)** — widen `RoomController`:
  ```ts
  export interface RoomController extends RoomState {
    castVote: (card: string) => void
    setItem: (topic: string | null) => void
    setHostVoting: (voting: boolean) => void
    reveal: () => void
    reset: () => void
  }
  ```
  Four sibling `useCallback`s on the stable `socket`, each forwarding one frame
  (`socket.send({ type:'set_item', topic })`, etc.), all `deps:[socket]`, all
  returned in the final object. Non-breaking for the existing `{ room, status,
  error, castVote }` consumer.

- **`components/HostControls/` (new — `.tsx` + `.module.css` + `.test.tsx`)** — props:
  ```ts
  interface HostControlsProps {
    revealed: boolean
    hostVoting: boolean
    disabled?: boolean          // status !== 'live'
    onReveal: () => void
    onReset: () => void
    onSetHostVoting: (voting: boolean) => void
  }
  ```
  Renders a **Reveal** button (`disabled={revealed || disabled}`), a **Reset**
  button (`disabled={disabled}` — Reset is legal pre- *and* post-reveal and must
  survive `revealed` so the host can escape a revealed round), and a **host-voting**
  checkbox (`<label><input type="checkbox" checked={hostVoting} disabled={revealed
  || disabled} onChange={() => onSetHostVoting(!hostVoting)} /> I'm voting</label>`).
  Mounted only for the host (gated in Room).

- **`components/Results/` (new — `.tsx` + `.module.css` + `.test.tsx`)** — props:
  ```ts
  interface ResultsProps {
    results: ResultsView
    participants: Participant[]
    hostId: string | null
  }
  ```
  Iterates `participants` (roster order), joins each to `results.votes[p.id]`:
  - has a card → render the value; missing (`undefined` — didn't vote / opted-out
    host) → render `—` (a "no vote" cell).
  - **Average:** `results.average === null ? '—' : results.average.toFixed(1)`
    (null when zero numeric votes — reachable when nobody voted before reveal).
  - **Consensus:** when `results.consensus`, render a `Consensus` badge (text, no
    emoji) per FR-16/D-16.
  - Reuses the host-badge join (`p.id === hostId`) for parity with Roster. Card
    values are read **only** from `results.votes`, and the component is mounted only
    when `revealed && results` — so FR-10 (no pre-reveal leak) holds by construction.

- **`components/Topic/Topic.tsx` (edit)** — add host-only editing; keep the
  read-only render for everyone else. New props:
  ```ts
  interface TopicProps {
    currentItem: string | null
    isHost?: boolean
    disabled?: boolean          // = revealed || status !== 'live'
    onSetTopic?: (topic: string | null) => void
  }
  ```
  When `isHost`, render a controlled **`<form onSubmit>`** (explicit submit — Enter
  submits via the form; **not** `onBlur`): `<input maxLength={MAX_TOPIC_LENGTH}
  value={draft} onChange=… disabled={disabled} />` + a **Set topic** submit button
  (`disabled={disabled}`). The input is **not** `required` — an empty/blank submit
  is allowed and sends `onSetTopic(null)` to clear. On submit: `onSetTopic(draft.trim()
  === '' ? null : draft)`; `preventDefault` on the form.
  - **Draft resync / echo-safety:** seed `draft` from `currentItem` and resync when
    the applied topic changes via the **guarded-effect** variant `useEffect(() =>
    setDraft(currentItem ?? ''), [currentItem])`. Because the host is the sole topic
    mutator, the effect fires only on the host's own submit-echo (a *canonical*
    `current_item` change), never per keystroke — so pre-submit typing is never
    stomped. The one residual (typing again in the submit→echo window is reverted)
    is narrow, self-correcting, and consciously **accepted for MVP** (closing it
    needs focus/dirty tracking — over-engineering). *(If a `key`-driven reset were
    used instead it MUST be `key={currentItem ?? ''}` — React treats `key={null}` as
    "no key", so an A→null clear wouldn't remount. The guarded effect is the chosen
    variant.)*
  - `disabled = revealed || status !== 'live'` (backend locks `set_item` post-reveal
    via `RoundRevealed`, `models.py:152`, so `round_revealed` stays a cross-client
    race-only fallback, never a routine path).
  - Non-host / no `isHost` → the existing read-only `<p>` + placeholder branch,
    byte-for-byte unchanged.

- **`pages/Room.tsx` (edit)** — in `ConnectedRoom`, destructure the four new
  actions; compute:
  ```ts
  const isHost = room.host_id !== null && room.host_id === participantId
  const canVote = !isHost || room.host_voting
  const notLive = status !== 'live'
  ```
  Render order inside the `room ?` branch:
  1. `<Topic currentItem={room.current_item} isHost={isHost} disabled={notLive || room.revealed} onSetTopic={setItem} />`
  2. `<Roster room={room} me={participantId} />`
  3. `{isHost && <HostControls revealed={room.revealed} hostVoting={room.host_voting} disabled={notLive} onReveal={reveal} onReset={reset} onSetHostVoting={setHostVoting} />}`
  4. `{room.revealed && room.results ? <Results results={room.results} participants={room.participants} hostId={room.host_id} /> : (canVote && <VoteDeck hasVoted={me?.has_voted ?? false} revealed={room.revealed} onVote={castVote} disabled={notLive} />)}`

  So: pre-reveal, voters see the deck and the opted-out host sees none; post-reveal,
  everyone sees Results and no deck. The existing `role="alert"` banner is unchanged
  and already scopes rejections to the actor.

**Key decisions & findings** (to promote to `03-decisions.md` when built)

- **Post-reveal replaces the deck with Results (A1).** When `revealed`, VoteDeck
  unmounts and `<Results>` renders in its place; reset (`revealed:true→false`)
  remounts a fresh deck (`selected:null`). Rejected: keeping the deck mounted+locked
  beside Results (redundant inert grid duplicating the revealed values).
- **Opted-out host has no deck (B1).** `canVote = !isHost || host_voting`; the deck
  renders only when `canVote && !revealed`. An opted-out host is a facilitator, not
  a voter, and this makes `host_not_voting` unreachable from the host's own UI.
  Rejected: showing a permanently-`disabled` deck.
- **Set-topic lives inside `Topic`, host-only (C1).** Keeps display + edit in one
  cohesive component; the non-host read-only path is unchanged. Rejected: a
  set-topic field inside `HostControls` (splits topic concerns).
- **S8 tripwire discharged — VoteDeck reconciliation is UNCHANGED and now
  automated-tested.** S9 wires exactly two new vote-drop paths: `reset` (drops *all*
  votes — `models.py:220`) and `set_host_voting(false)` (drops the host's own vote —
  `models.py:195`). **Both are genuine vote-drops**, so the S8 `has_voted`
  true→false edge that clears the local highlight remains correct for the full
  reachable set (reset, host-opt-out, disconnect). No S9 path is a "keep the
  highlight" retraction, so the deck does **not** need to move to a round-id `key`.
  Crucially, the **pre-reveal reset** case (`revealed:false` + `has_voted:false`) is
  the *one* path where the VoteDeck edge effect — not a layout unmount — is the sole
  thing that clears the highlight (the deck stays mounted because `canVote &&
  !revealed` still holds), and it is now pinned by an automated Room-level test (see
  Testing). The review gate remains only as a backstop against a *future* frame
  introducing a keep-highlight true→false.
- **Host gating is presentational only.** `isHost`/`canVote` gate rendering; the
  server authoritatively re-checks (`not_host`, `host_not_voting`, `round_revealed`)
  and any rejection surfaces in the actor's banner while the socket stays live.
  **Host-transfer note:** after a mid-round transfer `host_id` is transiently
  `null`, so `isHost` is false and `HostControls` (plus the topic editor) vanish for
  a beat until the next snapshot names the new host — accepted MVP behavior,
  mirroring the Roster host-badge `host_id !== null` handling.
- **`bad_request` unreachable from the topic input** — `maxLength={MAX_TOPIC_LENGTH}`
  bounds the raw string and the backend validator bounds the *stripped* length
  (`len(value.strip()) > MAX_TOPIC_LENGTH`); `strip()` only shortens. Clearing sends
  `{topic:null}`; blank/whitespace normalizes to `null` client-side before send.
- **Average/`—` and consensus render straight from `results`** — no client
  computation (D-16 lives in the backend); the UI only formats (`toFixed(1)`) and
  shows/hides a badge.

**Testing** (Vitest + Testing Library)

- `useRoom.test.ts` (extend) — `setItem('X')`/`setItem(null)`, `setHostVoting(false)`,
  `reveal()`, `reset()` each forward the exact frame to `socket.send`; each action
  reference is **stable** across renders.
- `lib/roomSocket.test.ts` (extend) — `reveal`/`reset`/`set_item`/`set_host_voting`
  no-op before `room_state` and after a live-drop; once `live`, `set_item` appends
  exactly `{"type":"set_item","topic":"X"}` and `{"type":"set_item","topic":null}`
  (regression that the widened union serializes correctly).
- `components/HostControls/HostControls.test.tsx` — Reveal fires `onReveal`; Reset
  fires `onReset`; the checkbox reflects `hostVoting` and fires
  `onSetHostVoting(!hostVoting)`. **Disabled matrix, per control:** Reveal
  `disabled={revealed || !live}` (assert disabled when `revealed:true` and when
  `disabled:true`); host-voting checkbox `disabled={revealed || !live}` (same); Reset
  `disabled={!live}` only (assert Reset stays **enabled** when `revealed:true` and
  disabled when `disabled:true`).
- `components/Results/Results.test.tsx` — a voter's card renders by name; a
  participant absent from `results.votes` renders `—`; `average` renders
  `toFixed(1)`, and `—` when `null`; the `Consensus` badge shows iff
  `results.consensus`; the host badge joins on `hostId`; no card value renders for a
  participant not in `results.votes`. **Zero-votes boundary:** with `results.votes={}`
  and `average=null`, every participant renders `—`, the average renders `—`, and no
  `Consensus` badge appears.
- `components/Topic/Topic.test.tsx` (extend) — non-host: read-only `<p>` +
  placeholder (existing, unchanged). Host: renders the input seeded from
  `currentItem`; **submit fires on the Set-topic button click and on form submit
  (Enter), NOT on blur** — calls `onSetTopic` with the typed value; **an empty/blank
  submit calls `onSetTopic(null)`** (input is not `required`); the input carries
  `maxLength={200}`; input + button are **disabled when `disabled` (revealed or
  not-live)**; the field **resyncs when `currentItem` changes**, and **typing after a
  submit is not stomped by the echo** (write it as submit → deliver `currentItem`
  echo snapshot → type more → assert the new text survives).
- `pages/Room.test.tsx` (extend/add):
  - host sees `HostControls`; a non-host does **not**.
  - opted-out host (`host_voting:false`, self is host) sees **no** `VoteDeck`.
  - post-reveal (`revealed:true` + `results`) renders `Results` and **no** `VoteDeck`
    for anyone.
  - **[tripwire, automated]** mount Room as a *voting* participant (non-host, or host
    with `host_voting:true`); click a card so it gets `aria-pressed`; then deliver a
    snapshot with `revealed:false` **and** that participant `has_voted:false` (a
    pre-reveal reset). Assert **both**: (a) `aria-pressed` is cleared on all cards,
    **and** (b) the VoteDeck ("Your vote") is **still in the DOM** (not replaced by
    Results — `revealed:false` keeps `canVote && VoteDeck`). This is the sole path
    where VoteDeck edge-detection, not a layout unmount, clears the highlight.
- `test/fixtures.ts` (extend) — add a `makeResults(overrides)` helper (and/or a
  `results`-populated `makeRoom` override) so Results/Room tests share one revealed
  fixture.

**Acceptance criteria** — (1) as host, submitting the topic editor (button click or
Enter — **explicit form submit, not blur**) sends `{type:'set_item',topic}` and the
returning snapshot updates `current_item` for everyone; an **empty/blank submit**
sends `{topic:null}` and returns the placeholder (the input is not `required`). (2)
the topic input `maxLength`s to 200 so no `set_item` can produce `bad_request`. (3)
host sees Reveal/Reset/host-voting controls; a non-host sees none. (4) toggling
host-voting off (`{voting:false}`) drops the host's vote server-side and hides the
host's own deck; toggling on re-shows an empty deck. (5) Reveal (`{type:'reveal'}`)
flips `revealed` and every client renders `Results`: each participant's card joined
by id, `—` for non-voters, the average (`toFixed(1)` or `—`), and a `Consensus`
badge iff `results.consensus`. (6) Reset (`{type:'reset'}`) returns a clean round —
`revealed:false`, deck back for voters, all highlights cleared. (7) no card value
appears in the DOM before reveal (FR-10) — `Results` mounts only when `revealed &&
results`. (8) a rejected action (`not_host`/`host_not_voting`/`round_revealed`)
surfaces in the **acting** user's `role="alert"` banner and the socket stays live.
(9) all host actions no-op when `status !== 'live'` (controls `disabled`, `send`
guarded); the topic editor and Reveal/host-voting toggle are additionally disabled
when `revealed`, while Reset stays enabled. (10) **VoteDeck reconciliation is
unchanged and correct** — the pre-reveal reset path (`has_voted` true→false with
`revealed:false`, deck still mounted) clears the highlight while keeping the deck in
the DOM, **pinned by an automated Room-level test**; the review gate remains a
backstop only for a *future* frame introducing a keep-highlight true→false.

**Verification (automated gates):** `cd frontend && npm run test` (Vitest — expect
~51 → ~75+ green) + `npm run build` (`tsc -b`) + `npm run lint` + `npm run
format:check`, all clean.

**Validate** (manual, two browsers, `compose up`, backend unchanged): host sets a
topic (peer sees it; Enter and the button both submit; clearing the field + submit
returns the placeholder); both vote privately (only *voted* badges, no numbers);
host toggles voting off (host's deck disappears, peer unaffected) and back on; host
reveals — **both** browsers show every card by name, the correct average, and the
`Consensus` badge when all equal; host resets — both drop back to a clean round with
the deck back and no stale highlight; the non-host browser never shows host
controls. **Refs:** FR-12–FR-16, FR-17 · D-12, D-14, D-16.

**ADR — S9 reveal/results/host controls**
- **Decision:** Implement S9 as a frontend-only slice over the unchanged S6b
  backend: add the four round frames to `ClientFrame`, four sibling actions to
  `useRoom`, a new host-only `HostControls` component, a new `Results` component
  (mounted only when `revealed && results`), and a host-only editing branch inside
  `Topic`; gate all host UI on `host_id === participantId` and gate the deck on
  `canVote = !isHost || host_voting`; post-reveal replace the deck with `Results`.
- **Drivers:** (1) faithfulness to existing seams / minimal diff (no `roomSocket`
  change; `useRoom`/`VoteDeck` extended, not forked); (2) correctness + privacy of
  the reveal transition (no pre-reveal value leak; clean reset; the S8 highlight
  tripwire discharged and now automated-tested); (3) no-auth MVP minimalism.
- **Alternatives considered:** post-reveal keep the deck mounted+locked beside
  Results (A2); show a permanently-disabled deck for the opted-out host (B2); place
  the set-topic field in `HostControls` rather than `Topic` (C2); a `key`-driven
  topic-draft reset instead of a guarded effect; leaving the tripwire as review-only
  rather than an automated test.
- **Why chosen:** A1 removes a redundant inert grid and gives reset a second
  structural highlight-clear via remount; B1 makes `host_not_voting` unreachable from
  the host's own UI and matches facilitator intent; C1 keeps topic display+edit
  cohesive and leaves the non-host path untouched; the guarded effect avoids the
  `key={null}` clear-A→null footgun; promoting the tripwire to a Room-level test
  makes the one edge-detection-only path regression-proof rather than relying on
  reviewer vigilance.
- **Consequences:** toggling host-voting off then on forces the host to re-pick
  (their vote is dropped server-side regardless); after a mid-round host transfer,
  controls vanish for a beat while `host_id` is transiently null (accepted, mirrors
  Roster); cross-client races can still surface `round_revealed`/`host_not_voting`/
  `not_host` in the actor's banner (graceful, socket stays live); the S8 "deck
  disabled on revealed" behavior is now exercised only in VoteDeck's own unit test
  (its prop contract is still covered).
- **Follow-ups:** if the spec later needs to distinguish "opted-out host" from
  "didn't vote yet" in `Results`, derive it (`p.id === hostId && !host_voting`) and
  give it a distinct cell; retire the T1 `/ws` echo and the S3/S4 HTTP round routes
  (S10, D-35).

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
