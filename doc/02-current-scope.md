# 02 — Current Scope (MVP)

The smallest set that makes a real estimation session usable.

## In scope

| Area | MVP behavior |
|------|--------------|
| Room creation | Create room → become host; get short code + shareable link |
| Joining | Join via link or code; enter display name only (no auth) |
| Identity | Name only, non-unique, internal ID distinguishes participants |
| Capacity | Up to 30 participants per room |
| Deck | Fibonacci numbers only (`0,1,2,3,5,8,13,21`), no special cards |
| Item | Single current item with optional free-text topic |
| Voting | Private selection; changeable until reveal |
| Reveal | Host-only reveal; shows all cards |
| Reset | Host-only reset for a new round |
| Host voting toggle | Host can opt in/out of voting; others always vote |
| Results | All votes + average + consensus flag |
| Presence | Real-time who's-in / who-voted over WebSocket |
| Host handoff | Auto-transfer host if the current host disconnects |
| Room cleanup | In-memory; discarded after grace period when empty |
| Reconnection | Rejoin as a new participant; in-round vote is lost |

## Out of scope (MVP)

- Accounts / authentication / authorization
- Persistent storage, history, or result export
- Backlog or multi-ticket management; integrations (Jira, etc.)
- Multiple / custom decks, T-shirt sizing, special cards
- Vote-value distribution charts (only average + consensus for now)
- Manual host transfer, kicking participants, spectators as a distinct role
- Reconnection state restore, timers, per-round history
- Mobile-native apps; i18n

## Definition of done (MVP)

1. Two+ browsers can create/join a room via a shared link.
2. Participants vote privately; nobody sees values pre-reveal.
3. Host reveals → everyone sees all cards + average + consensus.
4. Host resets → new round with a fresh topic.
5. Host leaving auto-promotes another participant.
6. Empty rooms are freed after the grace period.
7. Backend and frontend each run in their own Docker container.
