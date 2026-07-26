# 03 — Decisions

Decision log for the MVP. Each entry: the choice made and why. Captured during the
initial requirements interview.

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
- **D-18 Room cleanup: grace period when empty.** Room persists while occupied,
  discarded **1 minute** after the last participant leaves.

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
  names stay non-unique (D-10). Shipped during the UX phase without a matching
  requirement; FR-19 is to be backfilled (see
  [07-v0.1-phase.md](07-v0.1-phase.md)).
- **D-43 A round needs a subject, and a reveal needs a vote — enforced in the UI
  only.** The redesign added two preconditions to the round flow that the domain does
  not have: with no `current_item` set, the vote deck and the reveal action are both
  disabled (the stage shows a "waiting for the subject" status), and reveal is
  additionally disabled until at least one vote has been cast. The reveal control is
  hidden outright when nobody is eligible to vote. "New voting" (reset) is
  deliberately left enabled throughout, so a host can always escape a stuck round.
  Rationale: estimating an unnamed subject, or revealing an empty round, are both
  meaningless actions that the pre-redesign UI allowed.
  _Consequences, both accepted:_ (1) this **narrows FR-12** ("the host, and only the
  host, reveals the round") with preconditions the requirement does not state; (2)
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
  at any moment: no co-hosts, no residue, repeatable indefinitely. Unlike the
  disconnect-driven auto-transfer (D-13) there is **no** transient `host_id: null`,
  so the host UI never flickers through an unowned state.
  `host_voting` resets to `True` for the incoming host's sake, exactly as
  `remove_participant` does on the D-13 path: an inherited opt-out they never chose
  would silently leave them with no deck and outside the vote-progress denominator.
  The outgoing host keeps any vote already cast and becomes an ordinary voter — with
  no new code, because `cast_vote`'s guard keys on `participant_id == self.host_id`,
  so the instant the role moves they stop matching it. The opt-out was a privilege of
  the role, not of the person.
  **Not locked after reveal.** `RoundRevealed` guards the *inputs* to
  `Room.results()`, which reads only `revealed` and `votes`; a handover writes
  neither, so a revealed round's votes/average/consensus survive it byte for byte.
  Locking it would force a host who reveals and then needs to leave to `reset` —
  destroying the results the room is reading — as the price of handing over, which
  inverts the guard's purpose.
  The frame carries `target_id` and **no actor id**: the actor is the socket's
  handshake identity, extending the anti-spoofing property D-42 documents for
  `set_name` to an action that moves authority. Authorization is `_require_host` in
  the domain (the frontend's `isHost` is a rendering affordance, never the boundary).
  A self-target raises its own `CannotTargetSelf`/`cannot_target_self` rather than
  reusing `UnknownParticipant`, whose message — "Participant is not in this room" —
  would be false about the host; an unknown target is a genuine race and keeps
  `not_in_room`. WS-only, with no HTTP counterpart: D-35's dual-transport period is
  spent and S10 retires those routes. It is also the first action that **logs**
  (actor/target/room/outcome, both outcomes, at `info`), which required the app's
  first logging configuration — see `_configure_logging` and D-45's note below.
  **Consequences:**
  - The mid-round denominator grows as the outgoing host rejoins the voter pool
    (`5/6 → 5/7`). Accepted at [07-v0.1-phase.md](07-v0.1-phase.md) lines 110-113;
    nothing is blocked, since `reveal` is unconditional in the domain (D-12).
  - **The denominator can also move *after* reveal** (`5/5 → 5/6`), when the outgoing
    host had opted out. doc/07 sanctioned only the mid-round case, so this decision
    **extends** it, on its own argument: the counter reports the *current* voter
    roster, so freezing it would make the display lie about the room. And post-reveal
    roster movement already ships in a **more** destructive form — a leave after
    reveal drops the leaver *and their vote*, rewriting `results` itself, and does so
    deliberately (`models.py` `remove_participant`) and under test
    (`test_leave_mid_reveal_flips_consensus`, `test_leave_mid_reveal_empties_revealed_round`).
    A handover moves the denominator without touching a single vote, so it is
    strictly less surprising than behavior already shipped. The alternative —
    snapshotting the voter set at reveal — would reintroduce the
    `expected_voter_ids()` state D-43 records as *deliberately deleted*.
  - A post-reveal handover puts a dashed `?` card in a revealed grid. Partial reveals
    already produce that (D-12), and `ParticipantCard.resolveState` anticipates it in
    so many words ("an abstainer falls back to the not-voted glyph") — designed for,
    not tolerated.
- **D-46 The roster panel stays `role="group"`; row actions are buttons in a list.**
  The participants panel gains a per-row "Make host" action with an inline two-step
  confirm, and **does not** become a `role="menu"`. `menuitem` is not a valid
  container for interactive descendants, so a row holding both a Confirm and a Cancel
  control would be invalid; and the menu pattern contracts that activating an item
  *closes* the menu, which a two-step confirm breaks by design. Assistive tech
  implements that contract, so the role would mislead exactly the users it exists
  for. The host's own row (never actionable) and the title-plus-count line are not
  menuitems either.
  **The trigger keeps no `aria-haspopup`.** `"true"` is synonymous with `"menu"`, and
  `"dialog"` would promise dialog semantics; the panel is neither. `aria-expanded` +
  `aria-controls` remain the honest description — the existing comment at
  `ParticipantsMenu.tsx` explaining the omission gets *stronger*, not obsolete.
  The panel's keyboard model is deliberately **richer** than `group` implies: arrow
  keys move across row buttons. ARIA forbids claiming a role you do not implement, not
  adding affordances beyond one.
  Two alternatives were weighed and rejected: a **submenu** (valid ARIA, but
  reintroduces the second popup layer the inline confirm exists to avoid) and a
  **non-modal `role="dialog"`** panel (fits mixed content and would earn a truthful
  `aria-haspopup="dialog"`, but is heavier than a list of names warrants and invites
  focus-trap expectations this panel deliberately does not implement — it dismisses
  on tab-out, which a dialog contradicts).
  This **supersedes** the `role="menu"` upgrade promised in
  `ParticipantsMenu.tsx`'s own comment and assigned to S21 in
  [07-v0.1-phase.md](07-v0.1-phase.md). S21 keeps the panel in the rest of its scope
  — keyboard, focus-visible, contrast, semantics — only the role change is retired.
- **D-47 Removing a participant is the leave path under host authority, and it ends
  their connection.** `Room.remove_participant_by_host(actor, target)` guards
  (`_require_host`, then self-target, then membership) and delegates to the existing
  `remove_participant` primitive, which the disconnect path already uses. Same effect,
  different authority — so a removal drops the target *and their vote*, exactly as a
  leave does. The delegate's D-13 host-auto-transfer branch is unreachable from here,
  and provably rather than incidentally: it fires only when the removed id is
  `host_id`, and the self-target guard rejects precisely that id, since the actor is
  already established as the host. A removal therefore never moves the role and can
  never empty the room, which is why it needs no `empty_since` stamp and stays in the
  domain rather than routing through `store.leave`.
  Like the handover, the frame carries `target_id` and **no actor id** (the socket's
  handshake identity is the actor), authorization is in the domain, and both outcomes
  **log** actor/target/room/outcome. V1's `_transfer_host_logged` is generalized to a
  `_logged` wrapper over both, distinguished by a label: the two records are the same
  four fields by requirement, not coincidence, and a second copy would have duplicated
  the reasoning rather than the four lines of logging.
  **Not locked after reveal — and for a different reason than the handover.** D-45
  could argue a handover writes no input to `results()`. A removal writes `votes`, so
  it genuinely rewrites a revealed round's average and consensus. It is unlocked
  anyway, because `RoundRevealed`'s jurisdiction is *re-estimation* — a late vote, a
  moved topic, a host opting out — and membership is a different axis, on which the
  leave path already rewrites revealed results deliberately and under test
  (`test_leave_mid_reveal_flips_consensus`). Locking it would make the guard mean two
  different things depending on which trigger fired, and would force a host who needs
  someone out of a revealed room to `reset` first — destroying the results the room is
  reading, which is the exact trade that guard exists to prevent.
  **Not a ban** (D-15), and nothing is added to make it one: with no accounts there is
  no durable per-room state to ban against, the code still works, and a rejoin is a
  fresh participant with a new id. Explicitly out of scope in
  [02-current-scope.md](02-current-scope.md), so it is pinned by test as *decided*
  rather than left as a gap someone later files as a bug. No cooldown either.
  `CannotTargetSelf` is reused as `errors.py` anticipated, but its **message becomes
  the caller's** — the one deviation from every sibling error. That class exists
  *because* reusing `UnknownParticipant` would have shipped a message ("Participant is
  not in this room") that is false about the host; a single shared wording across two
  actions would have to be something like "you cannot target yourself", reintroducing
  the same vagueness one layer down. Two callers, two precise sentences, one slug, so
  the wire protocol is unchanged.
  **Consequences:**
  - **Socket teardown reuses the single-owner property (MF1) rather than working
    around it.** `apply_and_evict` mutates the domain, then takes the target's socket
    out of the `ConnectionManager` map via a new identity-blind `detach`, then
    broadcasts, then sends the notice and closes. Because the map entry is already
    gone, the removed socket's own handler finds `unregister` returning `False` and
    correctly skips a domain leave for someone already removed — no duplicate
    broadcast, no `UnknownParticipant` to suppress. `detach` is identity-blind where
    `unregister` checks, deliberately: a handler must not retire a socket newer than
    itself, but a host removing a participant means whichever socket represents them
    right now — including a second one opened via the `attach` impersonation this phase
    accepts as a known limitation.
  - **Detach precedes the broadcast, and that order is load-bearing.** Otherwise the
    removed client's last frame would be a snapshot of a room it is not in, which its
    UI would render — a header with no name, a grid missing its own card — for the tick
    before the notice arrived. Nothing in that state is true, so it never reaches a
    screen. Pinned by a test that asserts the notice is the *first* frame, not merely
    some frame.
  - **Removal is the first action whose effect exceeds a broadcast**, so it is the one
    round frame `ws._apply_round` does not dispatch: that function is synchronous by
    contract (it is a `Room` method) and closing a socket is not. The branch lives in
    the receive loop, where a reader looks to see what a frame does.
  - **A new terminal error slug, `removed`, and the first mid-session error that is
    terminal.** `roomSocket`'s terminality was phase-based — a close before any
    snapshot is a handshake rejection, a close after one is retryable — and this frame
    breaks that correspondence. Left to the phase rule, the removed client would spend
    a second "reconnecting", `attach` with an id the server no longer knows, and have
    the honest "the host removed you" overwritten by a misleading `not_in_room`. So the
    slug is named explicitly and the state is set on the **frame**, not the close
    behind it, which also means the reason survives a close that is delayed or lost and
    that `send` stops accepting frames for a room the client has left.
  - **The removed participant gets a terminal notice, not the rejoin prompt** a stale
    identity produces, even though `useRoom` clears the session for both. A stale id is
    a non-event and the prompt is the message; a removal is something that happened to
    someone, and a rejoin form would neither say so nor be the right default. The
    string is the server's, kept beside the slug it travels with, so S22 can settle the
    copy without touching the protocol.
  - **The roster row becomes two fixed button positions, and the confirm controls
    never change sides: Cancel first, Confirm second.** Idle, the positions hold Make
    host and Remove from room; arming either action replaces both, so a pending confirm
    hides the actions entirely rather than disabling one — the action the host did not
    arm cannot be pressed instead, and the two confirm controls are always in the same
    place whichever action is pending.
    **What this preserves.** The row is two buttons wide in every state, so neither
    button ever moves: geometry is identical idle, handover-armed and removal-armed
    (pinned by an E2E assertion, since jsdom has no layout). Both positions are
    `button` elements at fixed child indices in every state, so React reuses the nodes
    across a relabel and nothing is ever detached from under the caret — D-46's
    DOM-shape constraint satisfied outright rather than narrowly. Positions are
    rendered by a plain function returning an element, deliberately not a component:
    one declared inside the render would be a fresh type each pass and remount the node
    mid-confirm.
    **What it costs, knowingly.** Confirm shares the second position with Remove, so a
    removal is a double-press in place — but Make host owns the *first* position, so its
    Confirm moves away and a second click there lands on Cancel. The mouse and keyboard
    therefore disagree for the handover, which is the property V1's Cancel-before-action
    ordering existed to protect. Accepted because it fails **safe**: a stray second
    click calls the handover off rather than performing it, and the destructive action
    is the one that stays a press-twice-in-place. Both halves are pinned by E2E so
    neither is rediscovered as a bug.
    **It also forces real focus management**, which is not optional. Because the
    handover's Confirm is not the button just activated, a keyboard user's second Enter
    would land on Cancel and the handover could never be completed from the keyboard.
    So focus follows the *action* across the swap: arming moves focus to the Confirm,
    and cancelling returns it to the slot that action occupies when idle — without the
    latter, Escape from an armed "Make host" would strand the caret on "Remove from
    room", one Enter from the destructive action. Confirming deliberately does *not*
    restore, because the row is usually about to vanish (a removal drops it, a handover
    unmounts this host-only panel); focus goes to the panel, and if the panel goes too,
    `RoomHeader`'s existing `activeElement === body` guard catches it.
    Two smaller consequences: V1's bare `Confirm` becomes `Confirm handover`, because
    with two irreversible actions on one row "Confirm" tells a screen-reader user that
    *something* will happen but not which; and the row actions gain the `:disabled`
    treatment `.icon-btn` never had, off-live now being their only disabled state.
- **D-48 The deck is room state, chosen once at creation.** `Room` gains
  `deck: tuple[str, ...]`, defaulting to `config.FIBONACCI_DECK`; `store.create`
  threads it; `cast_vote` validates against `self.deck`; `RoomView` carries it. This
  **supersedes D-7 in part** — Fibonacci becomes the *default* rather than the
  constraint — and leaves **D-8 standing untouched**: cards are still numbers only,
  so no `?`, no coffee card, no T-shirt sizes. Named or saved decks, more than one
  deck per room, and changing a deck after creation all stay out of scope.
  **Fixed at creation is the load-bearing choice**, not a simplification deferred.
  It buys the whole slice out of the only hard question a mutable deck poses — a
  cast vote holding a card that has left the deck — and with it goes any need for a
  host-only frame, mid-round invalidation, or a control in the roster. A host who
  wants different values makes a new room. The cost is real and accepted: a typo in
  the deck is unfixable without abandoning the room.
  **Validation is at the create boundary and nowhere else** (`app/rooms/deck.py`,
  called by `CreateRoomRequest`), so a bad deck is a `422` on creation rather than a
  room that is already broken, and the domain sees a deck valid by construction.
  The rules: split on commas, trim, **drop empty segments** (a trailing comma is
  typing, not intent); each value a finite number in `[1, 999]` and at most 6
  characters once normalized; **2 to 12** cards; order preserved as entered, never
  sorted. *(Ranges and deck size restated by **D-49**; originally `[0, 1000)` and
  2 to 15.)*
  **Duplicates are rejected, not silently deduped** — the one genuinely debatable
  rule here. Dedup is friendlier; rejection is honest, and `1, 1, 2` is a typo whose
  quiet correction would hand the host a deck that differs from what they typed.
  Pinned by test as *decided* rather than left to be rediscovered.
  **Normalization is load-bearing, not cosmetic.** `1.0` → `1`, `01` → `1`, `1.50`
  → `1.5`, all before storage, because `Room.results()` computes consensus by
  comparing the card *strings* (`len(set(votes.values())) == 1`). An un-normalized
  deck holding both `1` and `1.0` would let two voters who actually agree fail to
  read as consensus. Canonicalizing also turns that pair into the duplicate it is,
  so the two rules reinforce each other.
  **The lower bound is what keeps that normalization honest.** Below `1e-4` `str`
  switches to exponent form, so a card would store as `1e-05` — contradicting the
  promise that what the room shows is a plain number, and at five characters short
  enough to slip the length bound, on a deck that is immutable. Found in review of
  this slice, when the floor was `0.0001` and admitted exactly that. **D-49** raised
  the floor to `1` and so excludes the case by range rather than by guard; the
  argument for *rejecting* rather than re-spelling is recorded there.
  **Consequences:**
  - **`results()` had to stop parsing cards as `int`.** `int("1.5")` raises
    `ValueError` — a 500, not a domain error, and only on reveal, so a room with a
    decimal card would look fine right up until the first reveal. It is `float` now,
    pinned by a decimal-deck test at the domain level and an E2E through the real
    socket. Display needed nothing: `Results.tsx` already formats with `toFixed(1)`.
    Consensus deliberately still compares strings, which normalization makes exact.
  - **Distribution is the snapshot, and that is the entire story.** `RoomView.deck`
    reaches every client on every broadcast (D-36), so a participant who never saw
    the create form votes from the room's own deck and a reconnecting one gets it
    for free — `session.ts` persists nothing new.
  - **`lib/deck.ts` demotes from mirror-of-the-only-deck to mirror-of-the-default.**
    `VoteDeck` takes the deck as a prop and renders the snapshot's. The constant's
    one remaining job is telling a host what leaving the field blank will give them.
    Its old note — that drift between it and the backend was the only route to
    `invalid_card` — is replaced by something stronger: the deck is immutable and
    arrives in the snapshot, so a client can only click cards the room holds.
    `invalid_card` stays unreachable from the UI and remains the guard against
    hand-crafted frames.
  - **The client does not pre-validate, deliberately.** `CreateRoomForm` sends the
    raw string; a second implementation of these rules on that side could only drift
    from the one that decides. The form surfaces the `422` inline instead, which it
    must: duplicates and a bad card count are things no input attribute can prevent,
    unlike the topic and name bounds whose client mirrors make rejection unreachable.
  - **It exposed pydantic's `"Value error, "` prefix as user-visible copy.** Latent
    until now — a 422 used to mean a name so malformed the UI had already blocked it
    — but a mistyped deck is an ordinary outcome, so `api.ts` strips the prefix. That
    is a leaked implementation detail, not a wording choice, so it is fixed here
    rather than left to S22.

- **D-49 Card values are `1`–`999`; a deck holds at most 12.** Tightens the D-48
  bounds: the floor rises from `0` to `1`, the ceiling becomes inclusive `999`
  instead of exclusive `1000`, and `MAX_DECK_SIZE` drops from 15 to 12. Decimals
  are untouched *inside* the range — `1.5` is still a card — so this bounds how
  small a value may be, not how round.
  **The default deck lost its leading `0`**, becoming `1, 2, 3, 5, 8, 13, 21`. This
  is the consequence that reaches a user, and it is forced rather than incidental:
  `CreateRoomForm` prints the default verbatim as the "leave blank for…" hint, so a
  default outside the bounds would be a suggestion the form rejects with a 422 when
  a host copied it. The alternative — exempt `0` from the floor and keep the eight-
  card default — was considered and dropped: a floor with a footnote is harder to
  state than a floor, and the exemption would exist only to preserve one card. The
  cost is accepted: a host who wants a zero card cannot have one.
  A test now pins the property rather than the value — `parse_deck` over the joined
  default must return the default — so any future drift between the constant and
  the rules fails at the boundary instead of in a host's face. Nothing else pinned
  it: `Room.deck` accepts any tuple, because validation is at the create boundary
  and nowhere else (D-48).
  **It also retires a guard.** With a floor of 1 no accepted value can reach
  exponent notation, so the `1e-05`-on-a-card-face bug D-48 records is excluded by
  the range. The reasoning behind *rejecting* such values rather than re-spelling
  them is kept because it still governs: expanding with `format(…, "f")` rounds to
  six decimals, which would turn `1e-7` into `0` and `1.0000001` into `1` — a value
  quietly changed underneath the host, which is worse than a bound they are told
  about. The same call explains why the negative check is gone: `-1`, `0` and `0.5`
  now fail one rule with one message instead of two rules with two.
  `MAX_CARD_LENGTH` stays 6 and is still load-bearing — `1.23456` is inside the
  range and too long to print on a card.

- **D-50 The HTTP round and presence routes are retired; the socket is the only
  transport past the handshake.** Deletes `PUT /{code}/item`, `PUT /{code}/vote`,
  `PUT /{code}/host-voting`, `POST /{code}/reveal`, `POST /{code}/reset`,
  `DELETE /{code}/participants/{participant_id}`, and the T1 `/ws` echo. `POST /rooms`
  and `POST /rooms/{code}/participants` stay — they are entry points, and a client has
  no socket until it knows which room to open one for (D-5, D-38). This **fulfils
  D-35** rather than reversing it: the dual transport was time-boxed at the moment it
  was chosen, and the frontend has driven the socket since S7. No new FR — NFR-1
  already describes the end state, so this brings the code into line with a
  requirement it already had.
  **The reason it went ahead of V3, which was the substantive change to the phase
  plan:** `DELETE /{code}/participants/{participant_id}` read its target from the path
  and applied *no host check and no actor check at all*. Every participant id ships in
  every snapshot, so anyone holding the room code could eject any participant — the
  host included — over plain `curl`, with no socket and no impersonation, and
  `allow_origins=["*"]` with `allow_methods=["*"]` let a web page preflight it. V2 had
  just built `_require_host` plus a self-target guard for exactly that operation over
  the socket; the HTTP door beside it had neither.
  **This retirement closed six holes, not one — found while reviewing the change, and
  worth recording because it was not the argument the work was justified on.** The five
  *round* routes took their `participant_id` from the **request body**, and
  `_require_host` does nothing but compare that id to `host_id`. Since `RoomView` ships
  `host_id` to every client (`views.py:82`), any code-holder could join, read the
  host's id out of a snapshot, and pass it as `participant_id` to satisfy the guard —
  making `reveal`, `reset`, `set_item`, `vote` and `host-voting` forgeable over HTTP by
  design, not by oversight. Body-supplied identity is the defect; the socket path takes
  identity from the connection instead, which is why it has no equivalent.
  **On sequencing, the honest version is narrower than "strictly worse."** The deleted
  `DELETE` was strictly cheaper to *exploit* — a `curl` one-liner against a WebSocket
  client — and that is what justified doing V5 first. It was **not** larger in
  *capability*: `attach` yields the same arbitrary eject plus every host action,
  from the same precondition. That argument therefore expired the moment V5 landed. V3
  shrinks to `attach` plus one string in `session.ts`, and it is now the entire
  authorization perimeter — see the note on its backlog item.
  **What became of the D-36 parity tests.** Four tests existed to show an HTTP action
  and a WS action converge on one snapshot, which is D-36's sharpest claim. With one
  transport that claim is unfalsifiable — there is nothing left to converge *from* —
  so three are deleted and D-36 carries a note saying so, because a reader will come
  looking for the test that proves it. The fourth was **kept in reduced form** as
  `test_http_join_reflects_to_socket`, and this is a deliberate departure from the
  plan: the surviving HTTP join still broadcasts to sockets already in the room, and
  it is the *only* remaining non-socket mutation that reaches connected clients.
  Nothing else covered it — the existing join fan-out test sends a WS `join` frame —
  so deleting all four as written would have silently dropped the last test of
  `join_room`'s `broadcast_room_state`.
  Three further tests kept their assertion and swapped mechanism, the deck rule and
  the R6 stale-socket guard among them; the subject was never the transport.
  **One deletion did lose real coverage, and the plan's own re-check missed it.** V5
  flagged `test_rejoin_within_grace_succeeds` as the one test to verify rather than
  assume, and nominated `test_rejoin_clears_empty_since` plus
  `test_reoccupancy_cancels_cleanup` as its cover. They are not: both assert only on
  `empty_since` and the sweep count, and neither exercises a room that is actually in
  grace. What went uncovered was the deleted test's real payload — that someone
  rejoining an emptied room inside its grace window **becomes host**. Caught by
  mutation, after the fact: making `add_participant` skip the host assignment for an
  in-grace room fails on `main` and passed all 244 tests here. The consequence is not
  cosmetic — the room returns with `host_id is None`, so nobody can reveal or reset it
  and it is effectively bricked (D-13, D-18). Now pinned at domain level by
  `test_rejoin_within_grace_gets_a_host`, which goes through `store.leave`/`store.join`
  so the grace stamp is real. The lesson is about the method, not the test: "the domain
  counterpart is strictly richer" was true for 31 of the 32 deletions and read as
  true for the 32nd, and only mutation testing separated them.
  Backend 279 → 245 tests, frontend (188) and e2e (44) untouched and verified by
  running them.
  **Two defences were broadened rather than pruned**, for the same reason — their value
  is not tied to the route that used to trigger them. `_ROOM_ERROR_STATUS` now maps six
  errors no HTTP route can raise (`RoomFull` is the last reachable one); it stays
  complete so a future route cannot fall through to a 500, which is a property of the
  error type, not of today's route list. And `ws.py`'s `suppress(UnknownParticipant)` in
  the disconnect `finally` loses its only *production* trigger — a host removal detaches
  the socket first, so `unregister` returns `False`, and a swept room fails the
  `is not None` guard — but it stays, because if the participant is absent for any
  reason the escaping exception skips `broadcast_room_state` and every *other* client
  in the room silently loses their FR-17 leave fan-out. Measured, not assumed: removing
  it makes that fan-out never arrive.
  **Eight dangling references had to be repointed, across more files than the plan
  listed.** Beyond `messages.py`'s `SetItemRequest` parity claim: two more in `ws.py`
  (the re-resolve guard cited the deleted `DELETE` as its only reason, contradicting the
  `finally` comment 47 lines below), `connection.py`'s "used by both transports",
  `errors.py`'s HTTP-first framing, `store.py`'s "while we're HTTP-only", a test
  docstring claiming parity with a route that no longer exists, and `frontend/config.ts`
  crediting the `/ws` echo's retirement to S10. The pattern is worth naming: a comment
  that justifies a rule by *naming a route* dangles when the route goes, where one that
  states the rule does not. Repointing them was the bulk of the review's yield.
  _Chosen over keeping the routes as a debugging affordance: they were unreachable from
  the app, untested against the guards the socket path had grown, and every one of them
  accepted identity from the caller._
