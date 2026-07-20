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
  multiple decks in MVP.
- **D-8 Cards: numbers only.** No `?` (unsure) or coffee card in MVP — keep the
  deck minimal. Set is `0, 1, 2, 3, 5, 8, 13, 21` — no `40`/`100`.
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
- **D-36 WebSocket delivery: full-snapshot broadcast driven by the domain.**
  Server→client state is the whole `RoomView` (a snapshot, not deltas — cheap for
  ≤ 30 participants (D-6), and it reuses the exact shape the HTTP layer already
  emits). Crucially the broadcast hangs off the **domain mutation**, not the
  transport handler, so an action arriving over HTTP and one over WS converge on the
  same broadcast and no connected client diverges — which is what makes the dual
  transport (D-35) safe rather than a source of drift. The FR-10 pre-reveal gate is
  inherited for free: the snapshot is the same guarded `RoomView`, so card values
  are absent until reveal regardless of transport.

## S7 — Frontend room shell

- **D-37 Client-side routing: `/` and `/room/:code`.** The SPA has two routes —
  `/` (create/join) and `/room/:code` (the room) — so the D-30 shareable link
  `{base}/room/{code}` deep-links straight into a room. The T1b scaffold probe
  page is replaced by these. No server-side routing or history API beyond what the
  SPA needs; a bare `/room/:code` with no persisted identity (D-39) prompts for a
  display name and joins fresh (D-38).
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
