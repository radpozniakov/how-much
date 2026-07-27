# Redesign Spec (UX / UI) · `SUPERSEDED`

> **Archived mockup handoff.** Captured verbatim as handed off; this was the design
> source of truth for the UX/UI phase, and
> [ux-phase-backlog.md](ux-phase-backlog.md) is the digested, sequenced version of
> it. The redesign has shipped, so the implementation is now the truth and the
> durable rules have been promoted to
> [../06-design-language.md](../06-design-language.md). Kept for provenance — read
> the design-language doc instead.
>
> **Superseded on the points below.** Each was mockup illustration rather than a
> decision, and collided with the fixed functional contract
> ([../01-requirements.md](../01-requirements.md),
> [../03-decisions.md](../03-decisions.md)); the backlog's **"Decisions needed"**
> section resolved them. Listed here so this document is not read as current:
>
> - **§Voting cards, the values `4, 8, 12, 24, 32, 48, 64`** — illustrative only.
>   The deck is **Fibonacci** `0, 1, 2, 3, 5, 8, 13, 21` (FR-9, D-7/D-8 · DN-A).
> - **§Participant cards grid, the "density selector"** — never built. The grid is
>   simply auto-responsive, with no density control (DN-C).
> - **"the current screen shows 8 columns × 3 rows"** — describes the mockup
>   screenshot, not a rule.
> - **§Segment control, `"View 1 (cards)"` / `"View 2 (stats)"`** — dev
>   placeholders, not final copy. Superseded in code: the control ships as
>   "Cards view" / "Graph view". S22, which had owned the wider copy pass, was
>   dropped (D-54).
> - **"dashboard/stats" framing** — narrowed to re-presenting the existing results
>   (average + consensus); no new analytics (FR-16, D-16 · DN-B).
> - **"Room ID" throughout** — means the room **`code`** (D-29). There is no
>   separate id field (DN-D).
>
> The per-screen layout sections below are implemented; `frontend/src/styles/main.scss`
> and the components are authoritative for how the UI actually looks.

App type: real-time planning-poker / estimation voting tool.
This spec describes the UI so an LLM can reason about or regenerate it.

## Colors
- `#F7F5F3` — background color for all pages
- `#000000` — all font colors and borders
- `#FFFFFF` — background for cards and the task stage
- Color theme is monochrome.

## Fonts
- **Inter** — names, navigation, labels, and small text
- **JetBrains Mono** — titles and card numbers

## Global styling
- Base background `#F7F5F3` fills the full viewport.
- All containers, cards, and buttons use solid `1px #000000` borders unless noted as dashed.
- Rounded corners throughout: containers ~12–16px radius, cards ~8–12px radius.
- Generous whitespace; content is horizontally centered.

## Pages

### Main page "/"
Layout:
- Intro section
  - Title
  - Description
- Cards section positioned horizontally (card background `#FFFFFF`, border solid `1px #000`)
  - Create a room
  - Join a room

### Room page
Layout:

**Header**
- Room ID section — top left, 24px offset from the edge
  - Room ID text, bold (Inter)
  - Icon button to copy the room ID
  - Icon button to exit the room
- Segment control for switching participant views — positioned top center
  - Button: cards variant — labeled **"View 1 (cards)"** (active/bold when selected)
  - Button: dashboard/stats variant — labeled **"View 2 (stats)"**
  - The active tab is bold; the inactive tab is regular weight and lower emphasis.
- Participant name — top right, bold (e.g. "Roman"), shows the current user.

**Stage / task section** — centered, max-width 900px, white background, solid border, rounded corners
- Task title text (JetBrains Mono), centered, multi-line allowed
  - Example: "Bulk re-validate cycle items on coordinator approval"
- Status text (Inter): "Voting in progress"
- Vote progress counter: "5/6" (votes cast / total participants)

**Participant cards grid** — evenly distributed directly under the stage
- Same overall width/size footprint as the stage section.
- Cards laid out in a responsive grid; the current screen shows 8 columns × 3 rows.
- The column count is driven by the density selector at the bottom (see Voting/density cards).
- When the user switches to the dashboard/stats view, this grid is hidden and the dashboard component appears in its place.

**Voting cards** — positioned at the bottom, horizontal row
- Each card is a rounded square showing an estimate value.
- Current values shown: 4, 8, 12, 24, 32, 48, 64.
- Selected card: filled `#000000` background with `#FFFFFF` number (e.g. "24" selected).
- Unselected cards: `#FFFFFF` background, black number, solid `1px #000` border.
- Clicking a card casts/updates the current user's vote.

## Components

### Participant card
A portrait (taller-than-wide) rounded rectangle with a participant name label in bold (Inter) centered below it. The card has three states:

1. **Not voted** — dashed `1px #000` border, `?` symbol centered inside (JetBrains Mono). Represents a participant who has not cast a vote yet.
   - Examples in screen: Rodion (first column), Roman, Ivan.
2. **Voted (hidden)** — solid `1px #000` border, checkmark-in-circle icon centered. The participant has voted but the value stays hidden while voting is in progress.
   - Examples in screen: Rodion, Julia, "Name", Sergiy(?).
3. **Voted (revealed)** — solid `1px #000` border, the numeric vote value centered (JetBrains Mono, bold), e.g. "16". Used when a vote value is shown (revealed round or self-view).
   - Example in screen: Sergiy showing "16".

### Voting / density cards (bottom row)
Rounded squares containing a number. One is selected at a time (filled black, white text); the rest are outlined. Used to cast the current user's estimate.

### Segment control
Two-item text toggle centered in the header. Active item bold, inactive item regular. Switches the area under the stage between the cards grid and the stats dashboard.

### Icon buttons (header, top left)
Minimal outline/ghost icon buttons: copy (duplicate room ID) and exit (leave room).

## Notes for regeneration
- Everything is black-on-off-white; do not introduce color.
- Titles and any numbers use JetBrains Mono; all other text uses Inter.
- Distinguish card states purely with border style (dashed vs solid) and inner content (`?` / checkmark / number) — no color coding.
