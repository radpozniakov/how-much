# 04 — Glossary

- **Room** — An in-memory estimation session identified by a system-generated
  unique ID. Holds participants and the current round. Has no editable name.
  Discarded 1 minute after it becomes empty.
- **Room ID** — System-generated unique identifier for a room. Not user-editable.
- **Room code** — Short identifier used to join a room; also embedded in the
  shareable link.
- **Host** — The room creator. The only actor who can reveal and reset a round,
  set the current item, and toggle their own voting. Auto-transfers to another
  participant if the host disconnects.
- **Participant** — Any non-host member of a room. Always votes; cannot control
  the round.
- **Voter** — A participant who casts a card in the current round. All participants
  are voters; the host is a voter only if they've enabled their own voting.
- **Display name** — The free-text name a user enters when joining. Not unique;
  an internal ID disambiguates.
- **Item / Topic** — The single thing being estimated in the current round. An
  optional free-text label the host can set. No backlog exists.
- **Deck** — The set of selectable cards. In MVP: Fibonacci numbers only.
- **Card / Vote** — A single participant's estimate selection for the current round.
- **Round** — One cycle: participants vote privately → host reveals → results shown
  → host resets for the next item.
- **Reveal** — Host action that makes all votes in the current round visible.
- **Reset** — Host action that clears votes to start a new round.
- **Consensus** — Result state where all revealed votes are equal.
- **Average** — Mean of the numeric votes in a revealed round.
- **Grace period** — The delay after a room becomes empty before it is removed
  from memory.
- **WebSocket** — The primary real-time transport carrying presence and voting
  events between frontend and backend.
