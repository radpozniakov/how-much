# 05 — Backlog

Sequenced tasks to build the MVP defined in [02-current-scope.md](02-current-scope.md).
Ordered so each task builds on the previous one. Only **T1** is detailed for now;
later tasks are scoped at a high level and will be expanded when reached.

Status legend: `TODO` · `IN PROGRESS` · `DONE`

---

## T1 — Scaffold the backend + compose · `DONE`

**Goal:** a runnable backend skeleton with one command to bring it up, and live
code reload via a volume mount. No product logic — just structure, tooling, and
wiring. **Frontend is deferred to T1b** (added later, per decision to focus BE
first).

**Backend (Python / FastAPI) — done**
- `backend/` with `requirements.txt` (FastAPI + `uvicorn[standard]`).
- `backend/app/main.py` — FastAPI app: `GET /health` → `200 {"status":"ok"}`.
- Placeholder WebSocket `/ws` that accepts a connection and echoes messages
  (proves transport; replaced in T2).
- `backend/Dockerfile` (python:3.12-slim, `uvicorn --reload`).
- `backend/.dockerignore`.

**Orchestration — done**
- `docker-compose.yml` with the `backend` service on port `8000`.
- Bind mount `./backend/app:/app/app` so host edits reflect in the container;
  `uvicorn --reload` (WatchFiles) restarts on change — **verified** (edit appeared
  in ~2s, no rebuild).

**Verified**
1. `docker compose up -d --build` starts the container cleanly.
2. `curl localhost:8000/health` → `200 {"status":"ok"}`.
3. Hot reload confirmed both directions (add/remove endpoint without rebuild).

## T1b — Scaffold the frontend · `DONE`

**Docker setup**
- Frontend generated via Vite CLI (React 19 + TypeScript, Vite 8) in `frontend/`.
- `frontend/Dockerfile` (node:22-bookworm-slim, `npm ci`, `npm run dev -- --host`).
- `frontend/.dockerignore`.
- `frontend` service in `docker-compose.yml`: port `5173`, source bind-mounted for
  HMR, anonymous volume for `node_modules`, `VITE_USE_POLLING=true`,
  `depends_on: backend`.
- `vite.config.ts` `server` block (`host: true`, polling gated by
  `VITE_USE_POLLING`). **Verified**: host edit triggered `hmr update /src/App.tsx`.

**Tooling**
- Prettier + `eslint-config-prettier` (`format` / `format:check` scripts). (D-26)

**App wiring**
- `src/config.ts` reads `VITE_API_URL` / `VITE_WS_URL` (defaults `localhost:8000`);
  compose sets them; `.env.example` documents them. (D-27)
- Backend dev CORS so the browser can call the API cross-origin. (D-28)
- Landing page (`src/App.tsx`) probes `GET /health` and the WS `/ws`.

**Verified (real browser via DevTools):** both checks green — HTTP `ok` and WS
`how-much ws connected`; no console errors (one benign StrictMode WS warning).

---

## T2 — WebSocket transport & connection lifecycle · `TODO`

Real message envelope/protocol (message types, client→server & server→client),
connection open/close handling, and broadcast plumbing. Foundation for all
real-time features. (Ref: NFR-1, FR-17)

## T3 — Room model & in-memory store · `TODO`

Room entity, participant entity, the in-memory registry, capacity cap (30),
system-generated room ID + join code, and the 1-minute empty-room cleanup timer.
(Ref: FR-1, FR-2, FR-5, FR-6, D-4, D-6, D-19)

## T4 — Create & join flow · `TODO`

Room creation (returns code + shareable link), join by code/link with display name
(non-unique), host assignment on create, and host auto-transfer on disconnect.
(Ref: FR-1–FR-4, FR-7, D-13, D-17)

## T5 — Voting round · `TODO`

Set current item/topic, private card selection from the Fibonacci deck, change vote
before reveal, and broadcast who-has-voted (without values). (Ref: FR-8–FR-11)

## T6 — Reveal, reset & results · `TODO`

Host-only reveal and reset; on reveal show all cards + average + consensus flag.
(Ref: FR-12, FR-13, FR-15, FR-16, D-12, D-16)

## T7 — Host voting toggle · `TODO`

Host can opt in/out of voting; participants always vote. (Ref: FR-14, D-14)

## T8 — Frontend UI · `TODO`

Create/join screens, room view with live presence, deck of cards, host controls,
and the results display. Wires T2–T7 to the UI. (Ref: FR-10, FR-15–FR-17)

## T9 — Deployment polish · `TODO`

Finalize Docker/compose for a deployable setup, config, and run docs. (Ref: NFR-3)

---

## Out of backlog (MVP)

Everything in the "Out of scope" list of
[02-current-scope.md](02-current-scope.md) — accounts, persistence, backlog/tickets,
multiple decks, distribution charts, reconnection restore, timers, i18n.
