# how-much

## Communication style

- Be concise and direct.
- Prioritize essential information; omit unnecessary background and repetition.
- Use clear, professional language.
- Avoid slang, excessive informality, hype, jokes, and filler.
- Do not overwhelm me with long explanations or too many options.
- Lead with the answer or recommended action.
- Explain details only when they are necessary or explicitly requested.
- When reporting completed work, briefly state:
  1.  What changed
  2.  Where it changed
  3.  Any important caveats or next steps

## Commit messages

Rationale lives in `doc/`, not in git history. A commit message says **what changed**
and **cites the record**; the reasoning behind the change goes in `doc/03-decisions.md`
as a `D-nn` entry, and the behaviour it delivers in `doc/01-requirements.md` as `FR-nn`.
Never write the same argument in both places — the docs can be edited and superseded,
a commit message cannot.

Budget, enforced not aspirational:

- **Subject** — conventional prefix, ≤72 chars. `feat(rooms): …`, `test(e2e): …`, `docs: …`
- **Body** — **≤10 lines, ~100 words.** One short paragraph, or a few bullets, not both
- **Bullets** — one per genuinely separate change. Not one per sub-argument of a single
  change; that is a decision record wearing a list
- **Citations** — `Implements FR-21; see D-47.` Do not restate D-47
- Test-count deltas are welcome as one line. Design essays are not

If a change needs more explanation than the budget allows, that is a signal the
explanation belongs in `doc/03-decisions.md` — write it there and cite it. It is never
a signal to spend more of the commit message.

### Example

`5cce7df` shipped participant removal in 118 lines and 1,352 words, most of it a second
copy of D-47. Under budget it is:

```
feat: remove a participant from the room (V2)

A `remove_participant` frame lets the host put another participant out.
`Room.remove_participant_by_host` guards then delegates to the existing
`remove_participant` primitive — same effect, different authority.

- socket teardown: mutate, `detach`, broadcast, then notify and close.
  The order is load-bearing and each step is pinned by a test
- new terminal `removed` slug so the client shows a reason, not a
  reconnect loop
- roster rows get a two-step confirm at fixed button positions

Backend 182 -> 221 tests, frontend 149 -> 179, e2e 31 -> 41.
Implements FR-21; see D-47.
```

Everything cut was already written down in `doc/03-decisions.md`.
