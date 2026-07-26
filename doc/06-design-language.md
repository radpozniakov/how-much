# 06 — Design Language

> **Living reference for the visual system.** These are the rules any new UI has to
> obey — the tokens below are what `frontend/src/styles/main.scss` actually defines
> (D-40), not an aspiration. The mockup this was distilled from is archived at
> [archive/redesign-spec.md](archive/redesign-spec.md), superseded on several points
> and kept only for provenance.
>
> Read this before adding a screen or component. Currently relevant to the open
> work in [07-v0.1-phase.md](07-v0.1-phase.md): the V1/V2 roster row actions, and
> S20 (interaction polish), S21 (accessibility), S22 (copy).

## The one rule

**Monochrome. Do not introduce color.** Black on off-white, everywhere. State is
communicated by **border style** (dashed vs solid) and **inner content**
(`?` / checkmark / number) — never by hue. This is the constraint most likely to be
broken by accident: a success green or an error red anywhere is a defect.

Consequence for error and validation states: they are typographic and positional,
not chromatic.

## Color

| Token | Value | Use |
|---|---|---|
| `--bg` | `#F7F5F3` | page background, full viewport |
| `--surface` | `#FFFFFF` | cards, the stage |
| `--ink` | `#000000` | all text and all borders |
| `--ink-muted` | `#4C4C4C` | secondary text (labels) |
| `--rule-faint` | `--ink` at 12% | a divider *inside* an already-bordered container |

`--ink-muted` and `--rule-faint` extend the mockup, which specified only the three
base values. Both stay inside the monochrome system — `--rule-faint` is derived from
`--ink` via `color-mix`, so it cannot drift into a tint. `--rule-faint` exists
because a second solid `1px` line inside a hairline-bordered box reads as a doubled
edge; reach for it rather than nesting hairlines.

## Type

- **Inter** (`--font-sans`) — body text, names, navigation, labels, small text.
- **JetBrains Mono** (`--font-mono`) — titles, headings (`h1`/`h2`), and **all
  numbers**: card values, vote counts, the average.

Both are self-hosted via `@fontsource-variable` rather than a CDN, per NFR-6.

Scale as implemented: `18px/1.45` base, dropping to `16px` at `≤1024px`; `h1` is
`44px` (`-1.2px` tracking), dropping to `32px` at `≤1024px`.

## Borders, radii, spacing

- `--hairline` — `1px solid var(--ink)`. Every container, card, and button, unless
  explicitly dashed to mean "not voted."
- `--radius-container` — `14px` (spec range 12–16px).
- `--radius-card` — `10px` (spec range 8–12px).
- Spacing scale: `--space-1` `4px`, `-2` `8px`, `-3` `12px`, `-4` `16px`, `-5`
  `24px`, `-6` `32px`, `-8` `48px`. Use these rather than raw px.
- Generous whitespace; content horizontally centered. The stage is max-width
  `900px` and the participant grid matches its width footprint.

## Component state vocabulary

Established by the participant card and reused elsewhere:

| State | Border | Inner content |
|---|---|---|
| Not voted | dashed | `?` (mono) |
| Voted, hidden | solid | checkmark |
| Voted, revealed | solid | the numeric value (mono, bold) |
| Selected (vote deck) | solid, **filled `--ink`** | number in `--surface` |

Inversion — filled black with white content — is the selection idiom. It is the one
high-contrast move available without color, so spend it only on genuine selection,
not on hover or emphasis.

## Interaction affordances

Hover and focus are layered *on top of* the resting style, which keeps a control
legible as its own label first. Note `&:hover:not(:focus)` in `main.scss` — hover is
suppressed while focused so the two do not compound into an unreadable state.

Focus is already handled with `:focus-visible` in several places (buttons, inputs,
the header controls). S21 is the pass that makes this consistent and complete
everywhere, so match the existing `:focus-visible` treatment rather than inventing
one.

## Conventions

- One stylesheet, `src/styles/main.scss`, with BEM class names — not per-component
  CSS modules (D-40). Component folders hold `.tsx` plus a colocated test.
- Icons come only from `src/components/icons.tsx`, which aliases `lucide-react` and
  pins sizing defaults (D-41). Import from that module, never `lucide-react`
  directly, so the dependency keeps a single call site.

## Known cleanup

`main.scss` carries a block of legacy alias tokens from before the redesign —
`--border`, `--text`, `--text-h`, `--code-bg`, `--accent`, `--accent-bg`,
`--accent-border`, `--sans`, `--heading`, `--mono`. Five are entirely unused
(`--text`, `--code-bg`, `--accent-border`, `--sans`, `--heading`) and the rest have
one or two uses each. **Do not use them in new code** — use the primary tokens
above. Retiring them belongs with S20/S21 whenever the stylesheet is next opened.
