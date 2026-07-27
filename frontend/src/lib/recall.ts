// Per-device recall of the inputs a user last submitted (FR-23 / D-52): the
// display name asked for on every entry path, and the card values asked for once,
// when creating a room.
//
// localStorage, and deliberately NOT the sessionStorage record in session.ts —
// the two want opposite lifetimes. Identity is per tab so two tabs are two
// participants (D-39); a remembered name is per device so the next visit, in any
// tab, starts filled in. Widening the session record to localStorage instead
// would make every new tab re-attach as the same participant.
//
// A recalled value is a *starting* value. It is written into a field's state at
// mount and is ordinary user input from then on, so `required`, `maxLength`, and
// the server's deck rules (FR-22) cannot tell a recalled value from a typed one.
//
// All access is wrapped, exactly as session.ts wraps its own: disabled storage /
// private mode / quota errors degrade to empty fields, because recall is a
// convenience and never a precondition.

const KEY = 'howmuch:recall'

export interface RecalledInputs {
  // The display name last submitted, or '' when nothing has been.
  name: string
  // The card-values string last submitted, raw as typed. '' covers both "never
  // submitted" and "submitted blank" — which are the same thing to the create
  // form, since blank is what makes its Fibonacci placeholder show.
  cards: string
}

// A factory, not a shared constant: every empty/failure path returns a fresh
// object, so a caller that mutates what it got back cannot poison later reads.
const nothing = (): RecalledInputs => ({ name: '', cards: '' })

function readString(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  return typeof value === 'string' ? value : ''
}

export function loadRecall(): RecalledInputs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return nothing()
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return nothing()
    const record = parsed as Record<string, unknown>
    // Field by field rather than all-or-nothing: a record written before the
    // other field ever had a value is the normal case, not a corrupt one.
    return {
      name: readString(record, 'name'),
      cards: readString(record, 'cards'),
    }
  } catch {
    return nothing()
  }
}

/** Replace what is remembered for the given fields, leaving the others alone.
 *
 * Call this on successful submission only — never on keystroke. An abandoned or
 * server-rejected form must not poison the next visit (D-52).
 *
 * The patch shape is what lets the three name surfaces and the one deck surface
 * share a single record: joining remembers a name without disturbing a deck the
 * same device chose when it last created a room.
 *
 * Callers pass the name **trimmed**, because the backend strips it too
 * (`router.py`'s validator, and `set_name`'s): what FR-23 offers back has to be
 * the name the room actually took, not the keystrokes around it. The deck is the
 * opposite — raw as typed, since the server owns its parsing and recall must not
 * become a second place that string gets normalized. */
export function rememberInputs(patch: Partial<RecalledInputs>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadRecall(), ...patch }))
  } catch {
    // Storage unavailable — the next visit starts with empty fields, which is
    // the pre-FR-23 behavior and not an error worth surfacing.
  }
}
