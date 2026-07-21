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

### S8 — Voting UI · `TODO`

**Goal:** cast and change a private vote; see *who* has voted, never the values.

> **Plan status:** `pending approval` (ralplan consensus: Planner → Architect
> (SOUND) → Critic (APPROVE), 2 iterations). Detailed below; scope is S8 only
> (voting — no reveal/results/host controls, which are S9), extending the S7
> foundation. Not yet executed.

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
  `me = room.participants.find(p => p.id === participantId)`; renders (only when
  `room` present) `<Topic current_item={room.current_item} />` and
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

### S9 — Reveal, results & host controls · `TODO`

**Goal:** the host runs the round; everyone sees the payoff, then a clean reset.

**Scope**
- Host-only controls, gated on `host_id === my participant_id`: reveal (`reveal`),
  reset (`reset`), a set-topic input (`set_item`, bounded to `MAX_TOPIC_LENGTH`
  like the frame), and the host-voting toggle (`set_host_voting`, D-14/FR-14).
- Results view built from `results` in the snapshot (present *only* once
  `revealed`): every participant's card joined to the roster by id, the average,
  and a consensus flag (FR-15/FR-16/D-16). Reset returns to a clean round.
- Surface rejected actions from `error` frames to the acting user only
  (`not_host`, `invalid_card`, `host_not_voting`, `round_revealed`).

**Validate:** a full round end-to-end across two browsers — host sets a topic,
both vote privately, host reveals (all cards + correct average + consensus), host
resets to a fresh round; a non-host sees no host controls. **Refs:** FR-12–FR-16,
FR-17 · D-12, D-14, D-16

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
