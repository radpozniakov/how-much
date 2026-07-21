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

### S7 — Room shell: connect, create, join & live presence · `TODO`

**Goal:** be in a room in a browser — create or join by link/code, land in the
room, and see everyone appear and disappear live. The foundation slice (largest),
mirroring S6a. Replaces the T1b scaffold probe page.

> **Plan status:** `pending approval` (ralplan consensus: Planner → Architect →
> Critic → APPROVE). Detailed below; scope is S7 only (no voting/reveal/host
> controls — S8/S9), but the foundation is shaped so those extend cleanly.

**Constraint (UI):** no new **UI/runtime** packages — routing, state, and the WS
client are hand-rolled on native platform primitives (History API, `WebSocket`,
`fetch`, `sessionStorage`) + React built-ins; the UI uses native HTML elements
only, polished in later phases. **Dev-only test tooling** (Vitest + Testing
Library) is the one sanctioned dependency addition — it never ships in the bundle.

**Module layout** (`frontend/src/`)
- `config.ts` (edit) — `API_URL` + `WS_BASE_URL` + `roomSocketUrl(code)`.
- `types.ts` (new) — `RoomView` / `Participant` / `ServerFrame` / `ClientFrame` /
  `ApiError`, mirroring the backend contract.
- `lib/router.tsx` (new) — `useRoute()`, `navigate()`, `matchRoom()`, `<Link>` on
  the History API + `popstate`.
- `lib/session.ts` (new) — `load/save/clearSession()` over `sessionStorage`
  (`{code, participantId}`), try/caught.
- `lib/api.ts` (new) — `createRoom` / `joinRoom`; normalizes both error `detail`
  shapes into a rendered string.
- `lib/roomSocket.ts` (new) — `RoomSocket` class: connect / `attach` / phase-scoped
  reconnect + a cached-snapshot external store.
- `lib/useRoom.ts` (new) — hook owning a `RoomSocket`, exposed via
  `useSyncExternalStore`.
- `App.tsx` (rewrite) — route switch `/` → `Landing`, `/room/:code` → `Room`.
- `pages/Landing.tsx`, `pages/Room.tsx` (new); `components/` splits optional.

**Scope**
- **Foundation** — the routing, typed WS client, room store, and identity/reconnect
  described in the Phase C intro. The **last `room_state` snapshot is the single
  source of truth** (D-36): the UI renders it verbatim and keeps no authoritative
  copy of its own — so there is **no optimistic UI** (a deliberate constraint S9
  inherits). The socket lives **outside React** in a plain class subscribed via
  `useSyncExternalStore`, so StrictMode double-effects can't spawn duplicate
  connections.
- **Create** via HTTP `POST /rooms {name}` → show the code + a copyable shareable
  link, then `navigate` into `/room/:code` (using the canonical `room.code`, D-17)
  and `attach` the socket with the returned `participant_id`.
- **Join** via HTTP `POST /rooms/{code}/participants {name}` (by link or typed
  code) → then `attach`. HTTP-then-`attach` (not a socket `join`) is deliberate
  (D-38): the joiner must learn its **own** `participant_id`, and a `room_state`
  snapshot can't reveal it — names are non-unique (D-10), so a client can't pick
  itself out of the roster. The id is also what detects "am I host?" and enables
  reconnect. Create/join POSTs fire from **event handlers, never a bare
  `useEffect`**, so StrictMode's dev double-invoke can't mint two participants.
  Map `404` (unknown room) / `409` (full, show the cap) / `422` (bad name) to
  inline errors.
- **Room** — a live participant list with a host badge (guarding `host_id === null`
  during the transient transfer/empty window) and a connection-status indicator
  (connecting / live / reconnecting); a stale-identity `not_in_room` rejection
  falls back to an inline name-prompt. The share link is an always-selectable
  readonly input (so copy works even where `navigator.clipboard` is undefined over
  a non-secure LAN origin), with a `clipboard`→`execCommand` copy button.

**Key decisions & findings** (to promote to `03-decisions.md` when built)
- **Reconnect terminality is phase-scoped, not slug-scoped.** A socket close is
  terminal (→ `rejected`, no reconnect) **iff no `room_state` has arrived yet**
  (handshake phase); once a snapshot lands, closes retry and mid-session `error`
  frames are non-fatal. Backend sends handshake errors *then* closes, but S8/S9
  mid-session errors don't close — so a reason-slug whitelist would misclassify.
- **`getSnapshot` returns a cached reference**, rebuilt only inside mutations —
  otherwise `useSyncExternalStore` infinite-loops (a runtime crash `tsc` can't
  catch; covered by a dedicated regression test).
- **Rename `VITE_WS_URL` → `VITE_WS_BASE_URL`** (a base, not the retired `/ws`
  echo endpoint); the client builds `${WS_BASE_URL}/ws/rooms/{code}`. Renaming
  fails safe — a stale `.env` with the old full value would otherwise silently
  double-path. Update `config.ts` + `docker-compose.yml` + `.env.example` together.
- **`api.ts` normalizes both `detail` shapes** — a domain error is `{detail:"…"}`
  (404/409) but a name-validation 422 is `{detail:[{…,msg}]}`; render a string.

**Notes:** host auto-transfer (D-13/FR-7) and empty-room cleanup (D-18/FR-6) are
backend behaviors here — the UI only reflects them as roster / host-badge changes
via the broadcast. No voting yet.

**Testing** — introduce **Vitest + Testing Library** (dev deps; jsdom env, with
happy-dom as the fallback if the bleeding-edge Vite 8 / rolldown toolchain forces
it — verify at install). Add a `test` block to `vite.config.ts` and `test` scripts.
Unit-cover the `lib/` seams: `api` detail-normalization, `router` `matchRoom` +
`navigate`, `session` round-trip + throwing-storage fallback, and `roomSocket`
(mock `WebSocket` + fake timers) — `attach` on open, `room_state` → live,
handshake-close → `rejected`/no-retry, live-close → reconnecting/retry, live
`error` non-fatal, `closedByClient` suppression, and the **cached-`getSnapshot`
stable-reference** regression guard. Page-level RTL smoke tests are optional.

**Validate:** two browsers create/join one room via the shared link and see each
other live; **reloading rejoins the room gracefully** — the client re-`attach`es,
and because the backend removes a participant the instant its socket drops (no
per-participant grace — only the empty-*room* grace of D-18), a plain reload is
rejected `not_in_room`, clears the session, and rejoins as a **fresh** participant
(name continuity is not guaranteed; any in-round vote is lost, FR-18/D-15 — this is
the expected, correct behavior, not a defect; the earlier "re-attaches as the same
participant" wording overstated what the current backend can do); closing the
host's tab promotes the oldest remaining participant in the other browser's roster.
Automated gates: `npm run test` (Vitest) + `npm run build` (`tsc -b`) + lint +
format + a grep asserting no `/ws` echo literal / `VITE_WS_URL` remains.
**Refs:** FR-1–FR-7, FR-17, FR-18, NFR-1 · D-5, D-9, D-10, D-13, D-15, D-17, D-18,
D-30, D-36, D-37, D-38, D-39

### S8 — Voting UI · `TODO`

**Goal:** cast and change a private vote; see *who* has voted, never the values.

**Scope**
- The Fibonacci deck (`0,1,2,3,5,8,13,21`, D-8/FR-9) as selectable cards; picking
  a card sends `cast_vote`, re-picking changes it (FR-11), the own selection is
  highlighted locally and disabled once the snapshot is `revealed`.
- Who-voted indicators driven purely by `has_voted` in the snapshot — presence
  only, no card value is ever rendered pre-reveal (FR-10). The current topic
  (`current_item`) shows read-only (the host sets it in S9).

**Validate:** in two browsers both vote; each sees the other marked *voted* but no
numbers appear until reveal. **Refs:** FR-9–FR-11, FR-17 · D-8

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
