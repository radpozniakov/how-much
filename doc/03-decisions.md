# 03 — Decisions

Decision log — the durable rationale record the commit policy points at. Each
entry stays within a budget: the choice, the why, the load-bearing consequences,
refs. The earliest entries came from the initial requirements interview; later
ones land per slice as each closes.

## Tech & architecture

- **D-1 Backend language: Python.** Chosen by the team.
- **D-2 Frontend: Vite + React.** SPA, fast dev loop.
- **D-3 Deployment: one Docker container per service.** Backend and frontend
  isolated and independently deployable.
- **D-4 No database.** All room state lives in backend process memory. Simplest
  possible MVP; restart loses state, which is acceptable.
- **D-5 Primary transport: WebSocket.** Real-time presence and voting need push;
  HTTP is used only where a request/response fits (e.g. room creation).
- **D-6 Capacity cap: 30 participants per room.** Bounds memory and UI.

## Product / behavior

- **D-7 Estimation scale: Fibonacci only.** Classic Planning Poker; no need for
  multiple decks in MVP. **Partly superseded by D-48** (v0.1): Fibonacci is now the
  *default* deck rather than the only one — the host may name the room's card
  values when creating it. Still true, and the reason D-48 is only a partial
  supersession: one deck per room, chosen once, with no presets or saved decks.
- **D-8 Cards: numbers only.** No `?` (unsure) or coffee card in MVP — keep the
  deck minimal. Set is `1, 2, 3, 5, 8, 13, 21` — no `40`/`100`.
  **Untouched by D-48**, and deliberately so: a host-chosen deck is still numbers
  only. The set named above moved from "the cards" to "the default cards"; that a
  card *is* a number did not move at all. **D-49** later dropped its leading `0`.
- **D-9 Identity: name only, no auth.** Lowest friction; no accounts to build.
- **D-10 Names non-unique.** Duplicates allowed; internal ID disambiguates. Avoids
  validation UX.
- **D-11 Single current item, no backlog.** One optional topic per round. Backlog
  management is out of scope.
- **D-12 Reveal & reset are host-only.** Explicit control, no auto-reveal. Keeps
  round flow predictable.
- **D-13 Host role: creator is host, with auto-transfer.** If the host disconnects,
  the role passes to another participant so the room stays usable.
- **D-14 Host voting is optional; others always vote.** Only the host may exclude
  themselves (e.g. acting as facilitator). No separate spectator role.
- **D-15 Reconnection: rejoin as a new participant.** Given name-only identity, a
  reconnect is a fresh join; the in-progress vote is lost. No slot-holding/timers.
- **D-16 Results: all votes + basic stats.** Show every card plus average and a
  consensus flag (all equal). No distribution chart in MVP.
- **D-17 Join flow: short code + shareable link.** Create returns both; join by
  either. No room listing/discovery.
- **D-18 Room cleanup: grace period when empty.** Room persists while occupied,
  discarded **1 minute** after the last participant leaves.
- **D-19 Room has a system-generated unique ID, no editable name.** Rooms aren't
  named or renamed; the generated ID identifies them. Nothing for the host to edit.
- **D-20 Backend framework: FastAPI + uvicorn.** Standard ASGI stack with
  first-class HTTP + WebSocket support and a `--reload` file watcher that pairs
  well with the dev volume mount. `uvicorn[standard]` pulls in `websockets` and
  `watchfiles`.
- **D-21 Dev hot reload via bind mount.** `docker-compose.yml` mounts
  `./backend/app` into the container and runs `uvicorn --reload`, so host code
  edits reflect live without rebuilding the image.
- **D-22 Backend scaffolded before the frontend.** Focus BE + compose first (T1);
  the frontend service (T1b) is added afterward.
- **D-23 Backend lint/format: Ruff.** Config in `backend/pyproject.toml`
  (`target py312`, line length 88, rule set `E,W,F,I,UP,B,C4,SIM`, double-quote
  format). Pinned in `backend/requirements-dev.txt` — dev-only, not in the runtime
  image. Run with `ruff check .` and `ruff format .` (or `uvx ruff@<ver> …`).
- **D-24 Frontend dev container: node:22-bookworm-slim, Vite dev server.** Runs
  `npm run dev --host` on port 5173. Debian slim (not alpine) for reliable native
  binaries (Vite 8 / rolldown).
- **D-25 Frontend hot reload: bind mount + anonymous node_modules + polling.**
  Source is bind-mounted; `node_modules` uses an anonymous volume so the
  container's Linux install isn't shadowed by the host's macOS one. Vite watch
  polling is enabled via `VITE_USE_POLLING=true` because macOS Docker bind mounts
  don't deliver fs events into the container.
- **D-26 Frontend format: Prettier + eslint-config-prettier.** Config in
  `frontend/.prettierrc.json` (`semi: false`, `singleQuote`, `trailingComma: all`,
  `printWidth: 80`, matching the Vite template style). `eslint-config-prettier` is
  applied last in the flat ESLint config so lint and format don't conflict.
  Scripts: `npm run format` / `format:check`.
- **D-27 Frontend reads backend URLs from `VITE_*` env.** `src/config.ts` exposes
  `API_URL` / `WS_URL` from `VITE_API_URL` / `VITE_WS_URL`, defaulting to
  `localhost:8000`. Defaults point at the host-published ports (not the compose
  service name) because the code runs in the user's browser. Compose sets these
  explicitly for the container; `.env.example` documents them.
- **D-28 Dev-permissive CORS on the backend.** `CORSMiddleware` with
  `allow_origins=["*"]` so the browser frontend can call the API cross-origin in
  dev. To be tightened to explicit origins before deployment (T9).

## S1 — Room domain

- **D-29 A room is identified by its `code`.** The `code` is a short,
  human-typeable join token (D-17) that also serves as the room's
  system-generated unique ID (D-19); the store is keyed by it. Codes are 6 chars
  from an unambiguous alphabet (`A–Z`+digits minus `0/O/1/I/L`), drawn with
  `secrets` (unpredictable — the code is the only barrier to a room), and
  collision-retried on creation. Join lookup is case-insensitive (input upper-cased)
  so a code typed in any casing resolves. _Revised after code review: an earlier
  design carried a separate uuid `id` alongside the code; it was unused (the code
  is already unique and unguessable), so it was dropped. A WebSocket-routing id, if
  needed, arrives in S6._
- **D-30 One env knob; the rest are constants.** Only `HOWMUCH_PUBLIC_BASE_URL`
  genuinely varies per deployment, so it is the single environment-read value; the
  create response embeds `{PUBLIC_BASE_URL}/room/{code}` (FR-2a), default
  `http://localhost:5173` (the frontend origin, since the link opens in a browser;
  `/room/{code}` firmed up in S7). Code length, capacity, and name length are plain
  module constants in `app/config.py` — _revised after code review: they were env
  vars parsed with `int()` at import, which a bad value could crash on; nobody needs
  to tune them, so they became constants._
- **D-31 Test stack: pytest + FastAPI `TestClient`.** Dev-only (pinned in
  `requirements-dev.txt`, not in the runtime image). Tests in `backend/tests/`;
  `pyproject` sets `pythonpath=["."]` + `testpaths=["tests"]`. Domain logic is
  tested directly; HTTP via `TestClient`. Aligns with the BE-first, test-per-slice
  approach — no WebSocket needed to validate the domain.

## S2 — Join, participants & host

- **D-32 Creator becomes host at creation.** Creating a room and the creator's own
  join are a single step: `POST /rooms {name}` allocates the room and adds the
  creator as its first participant, and the first participant added is the host.
  So the creator is unambiguously the host (D-13) — there is no participant-less
  room for someone else to join first and steal host. _Revised after code review:
  an earlier design (create empty room, "first to join is host") let whoever
  opened the shared link before the creator become host._ Host *auto-transfer* when
  the host leaves is S5, not here.
- **D-33 Create + join contract.** `POST /rooms {name}` → `201`
  `{participant_id, room{code, host_id, participants[]}, link}` (creator as host).
  `POST /rooms/{code}/participants {name}` → `201`
  `{participant_id, room{...}}` for everyone else. `RoomView` is the shape clients
  read (and what S6 broadcasts over the socket). Errors: `404` unknown room, `409`
  room full (message includes the cap, FR-5), `422` invalid/missing name. Both are
  HTTP now for BE-first validation; join moves onto the WebSocket in S6.
- **D-34 Display name: trimmed, non-blank, ≤ 40 chars, non-unique.** Validated in
  `JoinRequest`; leading/trailing whitespace stripped, blank rejected, length
  bounded (`MAX_DISPLAY_NAME_LENGTH`) to keep the roster legible. Duplicates are
  allowed (D-10) — the internal uuid distinguishes participants (D-4/D-9).

## S6 — Real-time transport

- **D-35 Dual transport through Phase B, then WS-only.** Round actions are added to
  the WebSocket in S6, but the S3/S4 HTTP routes are *kept alongside* them until the
  frontend exercises the socket path, so the domain stays `curl`-testable while the
  real-time layer is built and each action stays independently reproducible — more
  surface, bought for reliability. Room creation is HTTP throughout (D-5). The HTTP
  round routes are dropped once the frontend is live (folded into S10). _Chosen over
  a hard cutover to WS-only in S6, which would have left the round logic reachable
  only through the harder-to-drive socket while that socket was still unproven._
  **Fulfilled, not superseded, by D-50** — this decision named its own end condition
  and V5 executed it. The forward note matters because the dual transport reads as
  drift in hindsight: it was time-boxed from the day it was chosen.
- **D-36 WebSocket delivery: full-snapshot broadcast driven by the domain.**
  Server→client state is the whole `RoomView` (a snapshot, not deltas — cheap for
  ≤ 30 participants (D-6), and it reuses the exact shape the HTTP layer already
  emits). Crucially the broadcast hangs off the **domain mutation**, not the
  transport handler, so an action arriving over HTTP and one over WS converge on the
  same broadcast and no connected client diverges — which is what makes the dual
  transport (D-35) safe rather than a source of drift. The FR-10 pre-reveal gate is
  inherited for free: the snapshot is the same guarded `RoomView`, so card values
  are absent until reveal regardless of transport. **The convergence half of this is
  no longer testable** — D-50 left one transport, so there is nothing to converge
  *from*; the domain-driven half still holds and is what the mechanism now rests on.

## S7 — Frontend room shell

- **D-37 Client-side routing: `/` and `/room/:code`.** The SPA has two routes —
  `/` (create/join) and `/room/:code` (the room) — so the D-30 shareable link
  `{base}/room/{code}` deep-links straight into a room. The T1b scaffold probe
  page is replaced by these. No server-side routing or history API beyond what the
  SPA needs; a bare `/room/:code` with no persisted identity (D-39) prompts for a
  display name and joins fresh (D-38).
  - **Update — routing now via React Router.** The hand-rolled History-API
    router (`lib/router.ts`: `useRoute`/`navigate`/`matchRoom`) was replaced by
    `react-router` (declarative `BrowserRouter`/`Routes`/`Route`). The two-route
    decision is unchanged; only the implementation moved to the library:
    `useNavigate()` for programmatic navigation and `:code` path params in place
    of `matchRoom`. This trades the zero-dependency stance for standard routing
    primitives as the app grows.
- **D-38 Join over HTTP, then `attach` the socket — not a socket `join`.** Both
  create (`POST /rooms`) and join (`POST /rooms/{code}/participants`) go over HTTP
  and return the caller's `participant_id`; the socket then sends `attach` with
  that id. The socket-native `join` frame is *not* used by the frontend: a client
  must learn its **own** `participant_id`, and a `room_state` snapshot can't reveal
  it — names are non-unique (D-10), so a client cannot pick itself out of the
  roster. The id is also what answers "am I host?" (`host_id ==` mine) and what
  makes reconnect possible (D-39). This reuses the creator's existing HTTP-then-
  `attach` path (D-5/S6a) for every participant, so one identity flow covers all.
- **D-39 Persist `participant_id` (+ code) client-side; reconnect via `attach`.**
  The frontend stores the `participant_id` and room `code` from create/join (e.g.
  `sessionStorage`) and, on reload or socket drop, reconnects by `attach`ing that
  id — honoring the S6b contract the server *assumes but does not enforce*. If the
  id is stale (the room was swept after the D-18 empty-room grace, or the
  participant was already removed), `attach` is rejected `not_in_room` and the
  client falls back to a fresh join (D-15) — a reconnect past grace is a new
  participant, and any in-round vote is lost (FR-18). No slot-holding or timers on
  either side.

## UX / UI phase

Recorded when the phase closed — these landed in the code without a decision entry
at the time. Build log: [archive/ux-phase-backlog.md](archive/ux-phase-backlog.md).

- **D-40 Styling: one SCSS/BEM stylesheet, not per-component CSS modules.** The
  S7–S9 pattern (a `.module.css` beside each component) was replaced by a single
  `src/styles/main.scss` with BEM class names, and `sass` added as a dev
  dependency. The redesign is a small, tightly-coupled monochrome system — the same
  tokens, borders, and spacing recur on every screen — so one stylesheet keeps the
  visual language in one readable place instead of scattered across fifteen module
  files. Component folders keep their `.tsx` plus a colocated test.
  _Trade-off accepted:_ no build-time class-name scoping — discipline is the BEM
  naming, not the tooling.
- **D-41 UI icons via `lucide-react`, behind a local alias module.** The redesign
  calls for icon buttons (copy code, exit room, participants). They are imported
  only through `src/components/icons.tsx`, which re-exports the handful in use and
  pins project sizing defaults, so the dependency has exactly one call site to
  swap. This **ends the Phase 1 "no new UI/runtime packages" constraint**, which
  had already bent for `react-router` (D-37) and `@fontsource-variable`;
  hand-rolling SVG icon sprites was judged the wrong place to spend effort. NFR-6
  (no external *services*) is untouched — this is a bundled dependency.
- **D-42 Rename is self-service only.** A participant can change their own display
  name mid-session via a `set_name` WS frame; the new name reaches everyone through
  the normal snapshot broadcast (D-36), so there is no local post-commit name
  state. The frame deliberately carries **no `participant_id`** — the socket fixed
  the caller's identity at handshake, so the server can only ever rename the
  connected participant, and nobody can rename anyone else. Validation matches the
  join path exactly (trimmed, non-blank, ≤ `MAX_DISPLAY_NAME_LENGTH` — D-34), and
  names stay non-unique (D-10). Shipped during the UX phase ahead of its
  requirement; recorded since as FR-19.
- **D-43 A round needs a subject, and a reveal needs a vote — enforced in the UI
  only.** The redesign added two preconditions to the round flow that the domain does
  not have: with no `current_item` set, the vote deck and the reveal action are both
  disabled (the stage shows a "waiting for the subject" status), and reveal is
  additionally disabled until at least one vote has been cast. The reveal control is
  hidden outright when nobody is eligible to vote. "New voting" (reset) is
  deliberately left enabled throughout, so a host can always escape a stuck round.
  Rationale: estimating an unnamed subject, or revealing an empty round, are both
  meaningless actions that the pre-redesign UI allowed.
  _Consequences, both accepted:_ (1) this **narrows FR-8/FR-12** with UI-only
  preconditions, since recorded in those requirements; (2)
  because it is UI-only, `Room.reveal` remains unconditional (D-12) and a direct
  WS/HTTP call still reveals a topic-less or vote-less round — the gate is a UX
  affordance, not an invariant. Promote it into the domain if it ever needs to be
  guaranteed. `expected_voter_ids()`, documented in the Phase 1 log as the reveal
  gate, no longer exists — eligibility is now derived in `Room.tsx` for the
  vote-progress denominator instead.
- **D-44 Post-reveal the vote deck stays visible but locked.** The deck is a
  permanent bottom fixture of the room layout (spec §Voting cards); once revealed it
  remains on screen, disabled, and the round's values are read in the stats view
  (S18) rather than a separate panel. This **reverses S9's decision A1**, which had
  the deck unmount and be replaced by a `Results` block — that made sense in the
  pre-redesign vertical stack, but in the redesigned layout the deck's absence left
  the bottom of the room empty and the grid jumping on every reveal. Fixed layout
  beat conditional layout.

## v0.1 phase

Entries land **per slice as the phase is built**, not retrospectively. Live build
log: [07-v0.1-phase.md](07-v0.1-phase.md) — append there and here as each slice
closes.

- **D-45 Host handover is a *move*, not a grant — and legal at any point in a
  round.** `Room.transfer_host(actor, target)` is one assignment plus
  `host_voting = True`. `Room` holds a single `host_id`, so exactly one host exists
  at any moment, and unlike the disconnect auto-transfer (D-13) there is no
  transient `host_id: null`. `host_voting` resets for the incoming host — an
  inherited opt-out they never chose would leave them with no deck — mirroring
  what `remove_participant` does on the D-13 path. The outgoing host keeps any
  cast vote and becomes an ordinary voter with no new code: `cast_vote`'s guard
  keys on `host_id`, and the opt-out was a privilege of the role, not the person.
  **Not locked after reveal:** a handover writes neither `revealed` nor `votes`,
  so a revealed round's results survive it byte for byte; locking would force a
  results-destroying `reset` on a host who reveals and then needs to leave.
  The frame carries `target_id` and **no actor id** — the socket's handshake
  identity is the actor, extending D-42's anti-spoofing to an action that moves
  authority. Authorization is `_require_host` in the domain; a self-target raises
  its own `CannotTargetSelf` (reusing `UnknownParticipant`'s message would be
  false about the host). WS-only. First action that **logs**
  (actor/target/room/outcome, both outcomes), which brought the app's first
  logging configuration (`_configure_logging`).
  Accepted consequences: the vote-progress denominator can grow mid-round *and*
  post-reveal (the counter reports the *current* roster, and a post-reveal leave
  already rewrites results more destructively, under test), and a post-reveal
  handover puts a dashed `?` card in a revealed grid — which partial reveals
  already produce and `ParticipantCard.resolveState` anticipates.
- **D-46 The roster panel stays `role="group"`; row actions are buttons in a list.**
  The per-row "Make host" action with its inline two-step confirm does **not**
  make the panel a `role="menu"`: `menuitem` cannot contain the confirm's two
  interactive controls, and the menu pattern contracts that activating an item
  *closes* the menu, which a two-step confirm breaks by design — assistive tech
  implements that contract, so the role would mislead exactly the users it exists
  for. The trigger keeps no `aria-haspopup` (`"true"` is synonymous with
  `"menu"`); `aria-expanded` + `aria-controls` remain the honest description. The
  keyboard model is deliberately richer than `group` implies (arrow keys across
  row buttons) — ARIA forbids claiming a role you do not implement, not adding
  affordances beyond one. Rejected alternatives: a **submenu** (valid ARIA, but
  reintroduces the popup layer the inline confirm exists to avoid) and a
  non-modal **`role="dialog"`** (heavier than a list of names warrants, and
  invites focus-trap expectations the panel's dismiss-on-tab-out contradicts).
  This **supersedes** the `role="menu"` upgrade promised in
  `ParticipantsMenu.tsx`'s comment and assigned to S21; S21 keeps the rest of its
  scope.
- **D-47 Removing a participant is the leave path under host authority, and it
  ends their connection.** `Room.remove_participant_by_host(actor, target)`
  guards (`_require_host`, self-target, membership) and delegates to the
  `remove_participant` primitive the disconnect path uses — same effect,
  different authority, so the target's vote goes with them. The delegate's D-13
  auto-transfer branch is provably unreachable (it fires only for `host_id`,
  which the self-target guard rejects), so a removal never moves the role and
  never empties the room. Frame shape, authorization, and logging match D-45;
  the two actions share a `_logged` wrapper.
  **Not locked after reveal**, though unlike a handover it genuinely rewrites a
  revealed round's results: `RoundRevealed`'s jurisdiction is *re-estimation*,
  and membership is a different axis — the leave path already rewrites revealed
  results deliberately and under test (`test_leave_mid_reveal_flips_consensus`).
  **Not a ban** (D-15), no cooldown — pinned by test as *decided* rather than
  left as a gap. `CannotTargetSelf` is reused with a caller-supplied message:
  one slug, two precise sentences, wire protocol unchanged.
  Consequences:
  - **Teardown order is load-bearing.** `apply_and_evict` mutates the domain,
    takes the target's socket out of the manager via an identity-blind `detach`
    (unlike `unregister`, which checks), *then* broadcasts, then sends the notice
    and closes — so the removed client never renders a room it is not in, and its
    own handler finds `unregister` returning `False` and skips a duplicate leave.
    Pinned by a test that asserts the notice is the *first* frame.
  - **A new terminal `removed` slug — the first mid-session error that is
    terminal.** The state is set on the **frame**, not the close behind it, so
    the reason survives a delayed or lost close and the honest "the host removed
    you" is never overwritten by a misleading `not_in_room` after a reconnect
    attempt. The wording lives server-side beside the slug (S22 owns the copy).
  - **The roster row becomes two fixed button positions** (Make host, then
    Remove) **with fixed confirm sides: Cancel first, Confirm second.** Arming
    either action replaces both, so the un-armed action cannot be pressed by
    mistake and neither button ever moves (geometry pinned by E2E). The trade:
    only removal is a press-twice-in-place; a stray second click on an armed
    handover lands on Cancel — it fails **safe**. That forces real focus
    management (focus follows the *action* across the swap; cancelling restores
    it) and the explicit `Confirm handover` label for screen-reader users.
- **D-48 The deck is room state, chosen once at creation.** `Room` gains
  `deck: tuple[str, ...]` defaulting to `config.FIBONACCI_DECK`; `store.create`
  threads it, `cast_vote` validates against it, `RoomView` carries it. This
  **supersedes D-7 in part** — Fibonacci becomes the *default* — and leaves
  **D-8 untouched**: cards are still numbers only, no `?`, no coffee card, no
  T-shirt sizes; named/saved decks and post-creation changes stay out of scope.
  **Fixed at creation is the load-bearing choice:** it buys the slice out of the
  only hard question a mutable deck poses — a cast vote holding a card that has
  left the deck — and with it any host-only frame or mid-round invalidation. Cost
  accepted: a deck typo means a new room.
  **Validation lives at the create boundary and nowhere else**
  (`app/rooms/deck.py`, called by `CreateRoomRequest`), so a bad deck is a `422`
  at creation, never a broken room: split on commas, trim, drop empty segments;
  each value a finite number in range and bounded length once normalized; order
  preserved as entered; **duplicates rejected, not silently deduped** — `1, 1, 2`
  is a typo whose quiet correction would hand the host a deck that differs from
  what they typed. *(Bounds since revised by **D-49**; originally `[0, 1000)` and
  2–15 cards.)* **Normalization is load-bearing, not cosmetic:** consensus
  compares the card *strings*, so `1` and `1.0` must canonicalize to one form —
  which also turns that pair into the duplicate it is.
  Consequences: `results()` parses cards as `float` now (`int("1.5")` raised —
  a 500 on first reveal, pinned by domain and E2E tests; display already used
  `toFixed(1)`); the snapshot is the whole distribution story (`RoomView.deck`
  reaches every client per D-36, `session.ts` persists nothing new);
  `lib/deck.ts` demotes to mirror-of-the-default; the client deliberately does
  **not** pre-validate (a second implementation of the rules could only drift
  from the one that decides — the form surfaces the `422` inline); and pydantic's
  leaked `"Value error, "` prefix is stripped in `api.ts` — an implementation
  detail escaping into copy, fixed here rather than left to S22.
- **D-49 Card values are `1`–`999`; a deck holds at most 12.** Tightens the D-48
  bounds: floor `0` → `1`, ceiling inclusive `999`, `MAX_DECK_SIZE` 15 → 12.
  Decimals inside the range are untouched — `1.5` is still a card.
  **The default deck lost its leading `0`**, becoming `1, 2, 3, 5, 8, 13, 21` —
  forced, not incidental: `CreateRoomForm` prints the default verbatim as its
  "leave blank for…" hint, and a default the validator rejects would be a
  suggestion the form 422s when copied. Exempting `0` from the floor was
  considered and dropped — a floor with a footnote is harder to state than a
  floor. Cost accepted: no zero card. A test pins the *property* (`parse_deck`
  over the joined default returns the default), so constant/rule drift fails at
  the boundary rather than in a host's face.
  The floor also retires the exponent-notation guard (`1e-05` can no longer
  reach a card face); the reasoning for *rejecting* rather than re-spelling such
  values still governs — `format(…, "f")` rounds to six decimals and would
  quietly change a value underneath the host. `MAX_CARD_LENGTH` stays 6 and
  still bites: `1.23456` is inside the range and too long to print on a card.
- **D-50 The HTTP round and presence routes are retired; the socket is the only
  transport past the handshake.** Deletes `PUT /{code}/item`, `PUT /{code}/vote`,
  `PUT /{code}/host-voting`, `POST /{code}/reveal`, `POST /{code}/reset`,
  `DELETE /{code}/participants/{participant_id}`, and the T1 `/ws` echo.
  `POST /rooms` and `POST /rooms/{code}/participants` stay — they are entry
  points (D-5, D-38). This **fulfils D-35**, which was time-boxed from the day it
  was chosen, and adds no FR — NFR-1 already describes the end state.
  **Sequenced ahead of V3 for a security reason:** the `DELETE` route read its
  target from the path with **no actor or host check at all** — anyone holding
  the room code could eject any participant over plain `curl`. Review found the
  other five were forgeable too: they took `participant_id` from the request
  body, and `host_id` ships in every snapshot, so any code-holder could pass the
  host's id and satisfy `_require_host`. Body-supplied identity was the defect;
  the socket takes identity from the connection. With these gone, `attach` (V3)
  is the entire authorization perimeter.
  **Test fallout:** 32 HTTP tests deleted (each with a strictly richer domain
  counterpart), 3 re-pointed at the socket. Of the four D-36 parity tests —
  unfalsifiable with one transport, since there is nothing left to converge
  *from* — three were deleted and one kept in reduced form as
  `test_http_join_reflects_to_socket`: the surviving HTTP join is the last
  non-socket mutation that reaches connected clients, and nothing else covered
  its broadcast. One deletion silently lost real coverage — a rejoin within the
  grace window must get a host, or the room is bricked — caught by **mutation
  testing** after the fact and re-pinned at domain level as
  `test_rejoin_within_grace_gets_a_host`. The lesson is the method: "the domain
  counterpart is strictly richer" was true for 31 of 32 deletions, and only
  mutation testing separated them.
  Two defences were **broadened rather than pruned**: `_ROOM_ERROR_STATUS` stays
  complete so a future route cannot fall through to a 500 (a property of the
  error type, not of today's route list), and `ws.py`'s
  `suppress(UnknownParticipant)` stays in the disconnect `finally` — without it,
  an escaping exception would deny every *other* client their FR-17 leave
  fan-out (measured, not assumed). Eight comments that justified a rule by
  *naming a deleted route* were repointed; ones that state the rule do not
  dangle. Backend 279 → 246 tests; frontend (188) and e2e (44) untouched,
  verified by running them.
  _Chosen over keeping the routes as a debugging affordance: they were
  unreachable from the app, untested against the guards the socket path had
  grown, and every one of them accepted identity from the caller._
- **D-51 The `attach` gap stays accepted; V3 is nice-to-have, not a blocker.**
  Maintainer's call, July 2026, closing the one open security decision in the
  phase: the tool will be deployed as an **internal team tool**, so every
  attacker is an invited teammate and the trusted-room premise (D-9, D-29) holds
  for the deployment actually planned. V3 (per-participant session token) stays
  in the backlog as hardening worth doing, not as a gate on v0.1. The standing
  rule survives the call: revisit if the tool ever goes somewhere less trusted
  than a team room.
