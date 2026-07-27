# 02 — Current Scope

> **Living doc — what the app does today.** Keep this updated as scope changes.
> Build history lives in `archive/`; rationale in [03-decisions.md](03-decisions.md).
> One known gap is tracked in [07-v0.2-phase-backlog.md](07-v0.2-phase-backlog.md):
> **session-token hardening (V3)**, itself nice-to-have (D-51). The deployment,
> interaction, accessibility, and copy slices were dropped (D-54); the loose ends
> they held are listed in that phase doc as unowned.

The smallest set that makes a real estimation session usable.

## In scope

| Area | Behavior |
|------|----------|
| Room creation | Create room → become host; get short code + shareable link |
| Joining | Join via link or code; enter display name only (no auth) |
| Identity | Name only, non-unique, internal ID distinguishes participants |
| Rename | A participant can rename themselves at any time; everyone sees it live |
| Input recall | The browser offers back the display name and card values this device last submitted, as editable starting values |
| Capacity | Up to 30 participants per room |
| Deck | Numbers only, no special cards; host sets 2–12 values from 1 to 999 (comma-separated) at creation, fixed for the room's life; blank means `1,2,3,5,8,13,21` |
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
