# UX / UI Phase — Backlog · `CLOSED`

> **Archived build log.** The redesign shipped: the design foundation and every
> screen slice (S11–S19, S23) is `DONE`. Four slices were **not** completed here
> and were carried into v0.1 — **S10** (deployment polish, itself carried from
> Phase 1), **S20** (interaction & state polish), **S21** (accessibility &
> responsiveness), and **S22** (copy & microcopy). They went unfinished there too
> and were **dropped** at the end of that phase (**D-54**), which is where their
> remaining loose ends are recorded. Kept for history; not a live task list.
>
> Predecessor: [phase1-mvp-backlog.md](phase1-mvp-backlog.md). Successor:
> [v0.1-phase-backlog.md](v0.1-phase-backlog.md).

## Shipped beyond this backlog

Five changes landed during the phase that are not slices below. Recorded here so
the build log matches the code, and promoted to decisions D-40–D-44 in
[../03-decisions.md](../03-decisions.md). The last three are *functional* changes,
which this phase's guiding principle said were out of scope — they shipped anyway,
so they are written down rather than left implicit:

- **Styling architecture changed** — the per-component CSS modules from S7–S9
  were replaced by a single SCSS/BEM stylesheet (`src/styles/main.scss`, `sass`
  added). Component folders keep their `.tsx` + colocated test only (D-40).
- **`lucide-react` icons** — the header/roster icon buttons the spec calls for,
  behind a central `components/icons.tsx` alias module pinning sizing defaults.
  This ends the Phase 1 "no new UI/runtime packages" constraint (D-41).
- **Participant self-rename** — a *functional* addition, not UX polish: a new
  `set_name` WS frame + `Room.set_name`, surfaced as a click-to-edit name in the
  header. Renaming is self-service only (the frame carries no `participant_id`,
  so a socket can only rename itself) and fans out via the normal snapshot
  broadcast (D-42). It has no FR of its own — see the contract-additions note in
  [v0.1-phase-backlog.md](v0.1-phase-backlog.md).
- **Round-flow preconditions** — the vote deck and the reveal action are disabled
  until the host sets a subject, and reveal additionally requires at least one cast
  vote; the reveal control is hidden when nobody is eligible to vote. Reset stays
  enabled throughout. UI-only, so the domain still reveals unconditionally — this
  narrows FR-12 in practice (D-43).
- **Post-reveal the deck stays visible but locked**, with the round's values read in
  the stats view — reversing S9's decision A1, which unmounted the deck and replaced
  it with a `Results` block (D-44).

Phase 1 (MVP) context: [../02-current-scope.md](../02-current-scope.md) and
[phase1-mvp-backlog.md](phase1-mvp-backlog.md). This phase improved the **look
and feel** of that working tool.

## Goal

Take the functionally-complete MVP and make it feel good to use: a polished,
coherent, responsive interface for creating/joining rooms, voting, and revealing
results — without changing what the app *does*.

## Guiding principle — preserve core functionality

The behavior defined in [01-requirements.md](../01-requirements.md) (FR-1…FR-18,
NFR-1…NFR-6) is the fixed contract for this phase. UX/UI work may restyle,
re-lay-out, and re-sequence screens, but must **not** alter the functional
outcome. Any change that would touch a requirement or a decision in
[03-decisions.md](../03-decisions.md) is out of scope here and must be raised as a
new decision first.

## In scope

- Visual design: layout, typography, color, spacing, component styling.
- Interaction polish: transitions, loading/empty/error states, feedback on vote,
  reveal animation, presence indicators.
- Responsiveness and small-screen usability (still a web SPA, not a native app).
- Accessibility basics (keyboard nav, focus states, contrast, semantics).
- Copy and microcopy clarity.

## Out of scope (unchanged from MVP)

Everything in [02-current-scope.md](../02-current-scope.md)'s "Out of scope" list still
applies — accounts, persistence, backlog/tickets, multiple decks, distribution
charts, timers, i18n, mobile-native. New *features* are not part of a UX phase.

## Carried forward from Phase 1

- **S10 — Deployment polish** · `CARRIED → v0.1`
  Tighten dev CORS to explicit origins (D-28), finalize Docker/compose for a
  deployable setup, config, and run docs. **Refs:** NFR-3. Independent of the
  UX work. Not completed here either — carried a second time into
  [v0.1-phase-backlog.md](v0.1-phase-backlog.md), and dropped there (D-54).

## Design source

The visual direction is fixed by [redesign-spec.md](redesign-spec.md) (archived
alongside this log; durable rules promoted to
[../06-design-language.md](../06-design-language.md)):
monochrome (`#F7F5F3` background, `#000` ink/borders, `#FFF` cards), Inter for
text and JetBrains Mono for titles/numbers, solid `1px` borders with rounded
corners, generous centered whitespace. The slices below digest that spec into
sequenced work.

Status legend: `TODO` · `IN PROGRESS` · `DONE`

## Decisions needed before the affected slices

The spec was drawn as a mockup and, in places, collides with the fixed
functional contract this phase must not change. Per the guiding principle above,
each is raised here as a decision; the contract holds until a new decision in
[03-decisions.md](../03-decisions.md) changes it. These gate the slices that
reference them — resolve before building those.

- **DN-A — Deck values.** ✅ *Resolved: Fibonacci stays.* The spec's voting row
  shows `4, 8, 12, 24, 32, 48, 64`; those are illustrative mockup numbers. The
  deck remains **Fibonacci** `0, 1, 2, 3, 5, 8, 13, 21` (FR-9, D-7/D-8) — S17
  renders that set.
- **DN-B — "View 2 (stats)" scope.** The spec calls it a "stats dashboard."
  Results are contractually **average + consensus only** — distribution charts
  are explicitly out of scope (FR-16, D-16). **S18 re-presents the existing
  stats** (each vote, average, consensus) in a dashboard layout; it does **not**
  add new analytics. ✅ *Resolved as built:* S18 shipped exactly that — a
  `StatsView` over the existing `results` payload, no new analytics.
- **DN-C — Density selector vs voting row.** ✅ *Resolved: no explicit density
  control.* The spec conflated one bottom row as both the vote-casting cards
  *and* a grid "density selector." The bottom row **casts votes** (S17); the
  participant grid is simply **auto-responsive** (S19) with no separate density
  control.
- **DN-D — "Room ID" wording.** The spec's "Room ID" is the room **`code`**
  (D-29); there is no separate id. UI copy may say "Room ID"; it refers to the
  code. No contract change — noted so it isn't mistaken for a new field.

## Backlog

Digested from the spec into thin, demoable UX slices. Sequenced foundation-first
(shared tokens and fonts) so later screen work composes cleanly. Each slice
restyles/relays-out only — no functional outcome changes (see guiding principle).

### S11 — Design foundation · `DONE`
Shared visual tokens and self-hosted fonts before any screen work. Color tokens
(`#F7F5F3`/`#000`/`#FFF`), type scale (Inter + JetBrains Mono), border and
radius conventions, spacing scale. Prefer bundled/self-hosted fonts (e.g.
`@fontsource`) over a CDN to honor the self-hostable, dependency-light stance
(NFR-6). **Refs:** spec §Colors, §Fonts, §Global styling.

### S12 — Main page ("/") · `DONE`
Restyle the create/join landing: intro section (title + description) above a
horizontal pair of white bordered cards — **Create a room** and **Join a room**.
**Refs:** FR-1, FR-3; spec §Main page.

### S13 — Room header · `DONE`
Header band: Room ID (bold Inter, 24px edge offset) with copy-code and
exit-room icon buttons top-left (DN-D); centered segment control (S18); current
participant name bold top-right. **Refs:** FR-2a (copy code/link), room leave;
spec §Room page/Header, §Icon buttons.

### S14 — Stage / task section · `DONE`
Centered white card, max-width 900px, solid border, rounded: task title
(JetBrains Mono, multi-line), status text ("Voting in progress" / revealed), and
vote-progress counter `votes/total`. **Refs:** FR-8, FR-10, FR-17; spec §Stage.

### S15 — Participant cards grid · `DONE`
Responsive grid directly under the stage, matching its width footprint, showing
one card per participant; hidden when the stats view (S18) is active. **Refs:**
FR-17; spec §Participant cards grid. Depends on S16.

### S16 — Participant card states · `DONE`
The portrait card component with three color-free states distinguished by border
+ inner content only: **not voted** (dashed border, `?`), **voted/hidden**
(solid border, checkmark), **voted/revealed** (solid border, numeric value;
also the self-view of one's own vote). Name label bold below. **Refs:** FR-10,
FR-12, FR-15; spec §Participant card, §Notes for regeneration.

### S17 — Voting cards row · `DONE`
Bottom horizontal row of rounded-square deck cards; click casts/updates the
current user's vote; selected card filled black with white number, others
outlined. **Deck stays Fibonacci** (DN-A). **Refs:** FR-9, FR-10, FR-11; spec
§Voting cards.

### S18 — Segment control + stats view · `DONE`
Two-item toggle swapping the area under the stage between the cards grid (S15)
and a stats view. The stats view re-presents **existing** results only — each
vote, average, consensus — no new distribution analytics (DN-B). Finalize the
"View 1 / View 2" placeholder labels as real copy (S22). **Refs:** FR-16, D-16;
spec §Segment control, §Room page.

### S19 — Grid responsiveness · `DONE`
Auto-responsive column behavior for the participant grid across viewport sizes
and small screens (column count adapts to available width; no explicit density
control, DN-C). **Refs:** NFR-4; spec §Participant cards grid.

### S20 — Interaction & state polish · `CARRIED → v0.1`
Transitions, feedback on vote cast/change, reveal animation, presence indicators,
and loading/empty/error/full-room states. **Refs:** FR-5 (full-room message),
FR-12, FR-17; phase "In scope".

### S21 — Accessibility & responsiveness pass · `CARRIED → v0.1`
Keyboard navigation, visible focus states, contrast, semantic markup, and
small-screen usability across all screens. **Refs:** phase "In scope"
(accessibility, responsiveness).

### S22 — Copy & microcopy · `CARRIED → v0.1`
Finalize labels and messages — replace dev placeholders ("View 1 (cards)",
"View 2 (stats)"), room-full and error copy, empty/first-round states. **Refs:**
phase "In scope" (copy clarity).

### S23 — Host participants roster (UI only) · `DONE`
A users icon beside the host's name in the header opens a panel listing every
participant, with the host's own row tagged `me`. Renders **existing snapshot
data only** (`room.participants`) — no new frames, no functional outcome change,
so it sits inside this phase's guiding principle. Unlike the card grid it lists
an opted-out host too, since they are in the room even when excluded from voting
(FR-17). Host-gated because it is the anchor for the actions in DN-E below.
**Refs:** FR-17; spec §Room page/Header, §Icon buttons.

- **DN-E — Per-row host actions.** ➡️ *Carried → v0.1 as V1 and V2.*
  The roster is intended to host **hand over the host role** and **remove a
  participant** next. Both are new *functional* behavior, not UX polish: they need
  new WS frames plus backend domain rules (who may hand over, what a removed
  participant sees, how removal interacts with the host role). Per this phase's
  guiding principle they were correctly **out of scope for the UX phase**; they
  opened the next phase — see
  [v0.1-phase-backlog.md](v0.1-phase-backlog.md). S23 shipped the anchor only; the
  roster rows are deliberately inert text, and the panel uses `role="group"`
  rather than `role="menu"` until real menuitems exist.

  **Security note on `attach`.** A security review of S23 flagged a pre-existing
  gap: `ws.py`'s `AttachFrame` branch authenticates on `participant_id` alone,
  checking only *membership* — and `room_view` broadcasts every `participant.id`
  **and** `host_id` to every client. So any member can open a second socket as
  another participant, including the host, and pass `Room._require_host`. Today's
  ceiling is nuisance (force reveal/reset, rewrite the topic) and every effect is
  undoable by a reset. A host handover is the first action that would **not** be
  undoable, since it moves `host_id` durably.
  → *Sequencing decided in v0.1:* the two features are **not** gated on closing
  this gap; the impersonation risk is recorded as a known limitation and the
  session-token fix is tracked as optional hardening (V3). See
  [v0.1-phase-backlog.md](v0.1-phase-backlog.md); V3 outlived that phase and is
  now in [../07-v0.2-phase-backlog.md](../07-v0.2-phase-backlog.md). The review's other three points are
  not optional and carry into V1/V2 as design constraints there: authorize in the
  domain via `_require_host`, have new frames carry a **target** id and no actor
  id, and validate the target (member, and not a self-removal).
