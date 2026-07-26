# 02 — Current Scope

> **Living doc — what the app does today.** The MVP is complete and working
> end-to-end, and the UX/UI redesign has shipped (build history:
> `archive/phase1-mvp-backlog.md` and `archive/ux-phase-backlog.md`; rationale:
> [03-decisions.md](03-decisions.md)). Keep this updated as scope changes. The
> current [v0.1 phase](07-v0.1-phase.md) **does** add behavior — host handover,
> removing a participant, and host-chosen card values — so expect the table below
> to move with it.
>
> Known gaps, all tracked in [07-v0.1-phase.md](07-v0.1-phase.md): **deployment
> polish (S10)** — tighten CORS, finalize Docker/compose, run docs; **interaction
> polish (S20)**, **accessibility (S21)**, and **copy (S22)**.

The smallest set that makes a real estimation session usable.

## In scope

| Area | Behavior |
|------|----------|
| Room creation | Create room → become host; get short code + shareable link |
| Joining | Join via link or code; enter display name only (no auth) |
| Identity | Name only, non-unique, internal ID distinguishes participants |
| Rename | A participant can rename themselves at any time; everyone sees it live |
| Capacity | Up to 30 participants per room |
| Deck | Numbers only, no special cards; 2–12 cards from 1 to 999, `1,2,3,5,8,13,21` by default |
| Card values | Host sets the room's cards when creating it (2–15 numbers, comma-separated); fixed for the room's life |
| Item | Single current item with optional free-text topic |
| Voting | Private selection; changeable until reveal |
| Reveal | Host-only reveal; shows all cards |
| Reset | Host-only reset for a new round |
| Host voting toggle | Host can opt in/out of voting; others always vote |
| Results | All votes + average + consensus flag |
| Presence | Real-time who's-in / who-voted over WebSocket |
| Host auto-handoff | Auto-transfer host if the current host disconnects |
| Host handover | Host hands the role to another participant; the former host becomes an ordinary voter |
| Remove participant | Host removes another participant; they are told why and dropped with their vote, and may rejoin (not a ban) |
| Room cleanup | In-memory; discarded after grace period when empty |
| Reconnection | Rejoin as a new participant; in-round vote is lost |

## Planned — in the current phase, not built yet

Listed separately from "Out of scope" because they are committed work, not
exclusions. See [07-v0.1-phase.md](07-v0.1-phase.md).

- *(Nothing outstanding — host-chosen card values shipped as V4 and is in the
  table above.)*

## Out of scope

- Accounts / authentication / authorization
- Persistent storage, history, or result export
- Backlog or multi-ticket management; integrations (Jira, etc.)
- T-shirt sizing and special cards (`?`, coffee) — custom decks are numbers-only;
  also out: named or saved decks, more than one deck per room, and changing the
  deck after the room is created
- Vote-value distribution charts (only average + consensus for now)
- Spectators as a distinct role
- Banning a removed participant (removal is not a ban — the code still works)
- Reconnection state restore, timers, per-round history
- Mobile-native apps; i18n

## MVP acceptance criteria · met ✅

The bar Phase 1 had to clear — all verified working end-to-end. Kept as the
baseline the current phase must not regress.

1. Two+ browsers can create/join a room via a shared link.
2. Participants vote privately; nobody sees values pre-reveal.
3. Host reveals → everyone sees all cards + average + consensus.
4. Host resets → new round with a fresh topic.
5. Host leaving auto-promotes another participant.
6. Empty rooms are freed after the grace period.
7. Backend and frontend each run in their own Docker container.
