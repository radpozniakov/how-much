# how-much

A lightweight, self-hostable **Planning-Poker-style estimation tool**. A team joins
a room, votes privately on the current item, and the host reveals all cards at once —
removing anchoring bias. No accounts, no database.

> **Status:** **v0.1 shipped.** The MVP, the UX/UI redesign, and the v0.1 phase
> are all closed — host handover, participant removal, host-chosen card values,
> and recalled inputs are in. The next phase is open but its backlog is not yet
> written; the one item carried into it is optional session hardening.
> See [`doc/`](doc/) for the full spec.

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

| Doc                                                                    | Contents                                              |
| ---------------------------------------------------------------------- | ----------------------------------------------------- |
| [doc/00-context.md](doc/00-context.md)                                 | Problem, goals, non-goals, architecture               |
| [doc/01-requirements.md](doc/01-requirements.md)                       | Functional & non-functional requirements              |
| [doc/02-current-scope.md](doc/02-current-scope.md)                     | Current scope: in / out / acceptance criteria         |
| [doc/03-decisions.md](doc/03-decisions.md)                             | Decision log with rationale                           |
| [doc/04-glossary.md](doc/04-glossary.md)                               | Terminology                                           |
| [doc/06-design-language.md](doc/06-design-language.md)                 | Visual system: tokens, states, conventions for new UI |
| [doc/07-v0.2-phase-backlog.md](doc/07-v0.2-phase-backlog.md)           | **Current phase:** backlog not yet written            |
| [doc/archive/phase1-mvp-backlog.md](doc/archive/phase1-mvp-backlog.md) | Archived Phase 1 build log (T1…S10)                   |
| [doc/archive/ux-phase-backlog.md](doc/archive/ux-phase-backlog.md)     | Archived UX/UI build log (S11…S23)                    |
| [doc/archive/v0.1-phase-backlog.md](doc/archive/v0.1-phase-backlog.md) | Archived v0.1 build log (V1…V7)                       |
| [doc/archive/redesign-spec.md](doc/archive/redesign-spec.md)           | Archived mockup handoff the redesign was built from   |
