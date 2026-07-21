# 05 — UX / UI Phase

> **Status: active.** Phase 1 (MVP) is complete — the tool works end-to-end
> (see [02-current-scope.md](02-current-scope.md) and
> [archive/phase1-mvp-backlog.md](archive/phase1-mvp-backlog.md)). This phase
> improves the **look and feel** of that working tool.

## Goal

Take the functionally-complete MVP and make it feel good to use: a polished,
coherent, responsive interface for creating/joining rooms, voting, and revealing
results — without changing what the app *does*.

## Guiding principle — preserve core functionality

The behavior defined in [01-requirements.md](01-requirements.md) (FR-1…FR-18,
NFR-1…NFR-6) is the fixed contract for this phase. UX/UI work may restyle,
re-lay-out, and re-sequence screens, but must **not** alter the functional
outcome. Any change that would touch a requirement or a decision in
[03-decisions.md](03-decisions.md) is out of scope here and must be raised as a
new decision first.

## In scope

- Visual design: layout, typography, color, spacing, component styling.
- Interaction polish: transitions, loading/empty/error states, feedback on vote,
  reveal animation, presence indicators.
- Responsiveness and small-screen usability (still a web SPA, not a native app).
- Accessibility basics (keyboard nav, focus states, contrast, semantics).
- Copy and microcopy clarity.

## Out of scope (unchanged from MVP)

Everything in [02-current-scope.md](02-current-scope.md)'s "Out of scope" list still
applies — accounts, persistence, backlog/tickets, multiple decks, distribution
charts, timers, i18n, mobile-native. New *features* are not part of a UX phase.

## Carried forward from Phase 1

- **S10 — Deployment polish** · `TODO`
  Tighten dev CORS to explicit origins (D-28), finalize Docker/compose for a
  deployable setup, config, and run docs. **Refs:** NFR-3. Independent of the
  UX work; can be done at any point in this phase.

## Design source

The visual direction is fixed by [06-redesign-spec.md](06-redesign-spec.md):
monochrome (`#F7F5F3` background, `#000` ink/borders, `#FFF` cards), Inter for
text and JetBrains Mono for titles/numbers, solid `1px` borders with rounded
corners, generous centered whitespace. The slices below digest that spec into
sequenced work.

Status legend: `TODO` · `IN PROGRESS` · `DONE`

## Decisions needed before the affected slices

The spec was drawn as a mockup and, in places, collides with the fixed
functional contract this phase must not change. Per the guiding principle above,
each is raised here as a decision; the contract holds until a new decision in
[03-decisions.md](03-decisions.md) changes it. These gate the slices that
reference them — resolve before building those.

- **DN-A — Deck values.** ✅ *Resolved: Fibonacci stays.* The spec's voting row
  shows `4, 8, 12, 24, 32, 48, 64`; those are illustrative mockup numbers. The
  deck remains **Fibonacci** `0, 1, 2, 3, 5, 8, 13, 21` (FR-9, D-7/D-8) — S17
  renders that set.
- **DN-B — "View 2 (stats)" scope.** The spec calls it a "stats dashboard."
  Results are contractually **average + consensus only** — distribution charts
  are explicitly out of scope (FR-16, D-16). **S18 re-presents the existing
  stats** (each vote, average, consensus) in a dashboard layout; it does **not**
  add new analytics. Confirm.
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

### S11 — Design foundation · `TODO`
Shared visual tokens and self-hosted fonts before any screen work. Color tokens
(`#F7F5F3`/`#000`/`#FFF`), type scale (Inter + JetBrains Mono), border and
radius conventions, spacing scale. Prefer bundled/self-hosted fonts (e.g.
`@fontsource`) over a CDN to honor the self-hostable, dependency-light stance
(NFR-6). **Refs:** spec §Colors, §Fonts, §Global styling.

### S12 — Main page ("/") · `TODO`
Restyle the create/join landing: intro section (title + description) above a
horizontal pair of white bordered cards — **Create a room** and **Join a room**.
**Refs:** FR-1, FR-3; spec §Main page.

### S13 — Room header · `TODO`
Header band: Room ID (bold Inter, 24px edge offset) with copy-code and
exit-room icon buttons top-left (DN-D); centered segment control (S18); current
participant name bold top-right. **Refs:** FR-2a (copy code/link), room leave;
spec §Room page/Header, §Icon buttons.

### S14 — Stage / task section · `TODO`
Centered white card, max-width 900px, solid border, rounded: task title
(JetBrains Mono, multi-line), status text ("Voting in progress" / revealed), and
vote-progress counter `votes/total`. **Refs:** FR-8, FR-10, FR-17; spec §Stage.

### S15 — Participant cards grid · `TODO`
Responsive grid directly under the stage, matching its width footprint, showing
one card per participant; hidden when the stats view (S18) is active. **Refs:**
FR-17; spec §Participant cards grid. Depends on S16.

### S16 — Participant card states · `TODO`
The portrait card component with three color-free states distinguished by border
+ inner content only: **not voted** (dashed border, `?`), **voted/hidden**
(solid border, checkmark), **voted/revealed** (solid border, numeric value;
also the self-view of one's own vote). Name label bold below. **Refs:** FR-10,
FR-12, FR-15; spec §Participant card, §Notes for regeneration.

### S17 — Voting cards row · `TODO`
Bottom horizontal row of rounded-square deck cards; click casts/updates the
current user's vote; selected card filled black with white number, others
outlined. **Deck stays Fibonacci** (DN-A). **Refs:** FR-9, FR-10, FR-11; spec
§Voting cards.

### S18 — Segment control + stats view · `TODO`
Two-item toggle swapping the area under the stage between the cards grid (S15)
and a stats view. The stats view re-presents **existing** results only — each
vote, average, consensus — no new distribution analytics (DN-B). Finalize the
"View 1 / View 2" placeholder labels as real copy (S22). **Refs:** FR-16, D-16;
spec §Segment control, §Room page.

### S19 — Grid responsiveness · `TODO`
Auto-responsive column behavior for the participant grid across viewport sizes
and small screens (column count adapts to available width; no explicit density
control, DN-C). **Refs:** NFR-4; spec §Participant cards grid.

### S20 — Interaction & state polish · `TODO`
Transitions, feedback on vote cast/change, reveal animation, presence indicators,
and loading/empty/error/full-room states. **Refs:** FR-5 (full-room message),
FR-12, FR-17; phase "In scope".

### S21 — Accessibility & responsiveness pass · `TODO`
Keyboard navigation, visible focus states, contrast, semantic markup, and
small-screen usability across all screens. **Refs:** phase "In scope"
(accessibility, responsiveness).

### S22 — Copy & microcopy · `TODO`
Finalize labels and messages — replace dev placeholders ("View 1 (cards)",
"View 2 (stats)"), room-full and error copy, empty/first-round states. **Refs:**
phase "In scope" (copy clarity).
