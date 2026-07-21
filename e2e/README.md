# how-much — End-to-end tests

Playwright use-case tests that drive the **real** stack (Vite frontend + FastAPI
backend over WebSocket). Unit tests (vitest/pytest) mock the socket; these prove
the multi-client real-time flows — private voting, simultaneous reveal, presence,
host handoff — that only break with the whole system wired together.

## Prerequisites

The stack must be reachable. Easiest is the dev compose stack:

```bash
docker compose up -d          # from the repo root → :5173 (web) + :8000 (api)
```

The Playwright config reuses a stack already running on those ports; if nothing
is listening it falls back to `docker compose up` automatically (see
`playwright.config.ts` → `webServer`).

## Install & run

```bash
cd e2e
npm install
npx playwright install chromium   # one-time browser download
npm test                          # headless run
npm run test:ui                   # interactive UI mode
npm run report                    # open the last HTML report
```

Point at a non-default stack with env vars:

```bash
HOWMUCH_FRONTEND_URL=http://host:5173 HOWMUCH_API_URL=http://host:8000 npm test
```

## What's covered

| Spec | Requirements |
|------|--------------|
| `create-join.spec.ts` | FR-1, FR-2a, FR-3, FR-4, FR-17 — create/host, join by code + link, duplicate names |
| `voting-reveal.spec.ts` | FR-9, FR-10, FR-11, FR-12, FR-15, FR-16 — private votes, change vote, reveal + average + consensus |
| `host-controls.spec.ts` | FR-8, FR-13, FR-14 — topic, host-voting toggle, reset, non-host restrictions |
| `presence-handoff.spec.ts` | FR-7, FR-17 — live presence, host auto-transfer on disconnect |
| `edge-cases.spec.ts` | FR-18 — bad room code, tab reload/reconnect recovery |
| `capacity.spec.ts` | FR-5 — 30-participant cap enforced (HTTP layer) |

Each participant is a separate browser **context** because identity lives in
per-tab `sessionStorage` (`howmuch:session`). Room capacity is exercised over
HTTP rather than with 31 browsers — same domain seam, far cheaper.
