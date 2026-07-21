# how-much

A lightweight, self-hostable **Planning-Poker-style estimation tool**. A team joins
a room, votes privately on the current item, and the host reveals all cards at once —
removing anchoring bias. No accounts, no database.

> **Status:** MVP complete and working. Now in the **UX/UI phase** — polishing
> look and feel while preserving behavior. See [`doc/`](doc/) for the full spec.

## How it works

1. Someone **creates a room** and becomes the host — they get a short code and a
   shareable link.
2. Others **join** with the link/code and a display name (no sign-up).
3. Everyone **votes privately** on the current item using a Fibonacci deck.
4. The **host reveals** all cards at once; the room shows every vote plus the
   **average** and whether there's **consensus**.
5. The **host resets** and moves to the next item.

## Tech stack

- **Backend** — Python. Holds room state in memory; WebSocket as primary transport.
- **Frontend** — Vite + React SPA.
- **Deployment** — Each service in its own Docker container.
- **No database** — room state is in-memory only (lost on restart).

Limits: up to **30 participants** per room.

## Documentation

| Doc | Contents |
|-----|----------|
| [doc/00-context.md](doc/00-context.md) | Problem, goals, non-goals, architecture |
| [doc/01-requirements.md](doc/01-requirements.md) | Functional & non-functional requirements |
| [doc/02-current-scope.md](doc/02-current-scope.md) | Current scope: in / out / acceptance criteria |
| [doc/03-decisions.md](doc/03-decisions.md) | Decision log with rationale |
| [doc/04-glossary.md](doc/04-glossary.md) | Terminology |
| [doc/05-ux-phase.md](doc/05-ux-phase.md) | Current phase: UX/UI goals, scope, carried items |
| [doc/archive/phase1-mvp-backlog.md](doc/archive/phase1-mvp-backlog.md) | Archived Phase 1 build log (T1…S10) |
