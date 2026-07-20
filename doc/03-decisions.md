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
- **D-18 Room cleanup: grace period when empty.** Room persists while occupied,
  discarded **1 minute** after the last participant leaves.
