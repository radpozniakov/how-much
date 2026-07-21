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

## Backlog

_To be defined._ UX/UI slices will be sequenced here after a design/planning
pass (audit current screens → define visual direction → slice the work). Until
then this section is intentionally empty.
