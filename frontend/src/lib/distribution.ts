import type { Participant } from '../types'

export interface Column {
  value: string
  voters: Participant[]
}

export interface Extremes {
  low: Column
  high: Column
}

export interface AverageMark {
  lo: string
  hi: string
  exact: boolean
  t: number
}

export interface Distribution {
  columns: Column[]
  extremes: Extremes | null
  average: AverageMark | null
}

// `average` and `consensus` come from the server's ResultsView and are passed
// straight through. The client never recomputes either: the backend's mean is
// unrounded and its consensus compares normalized card strings, so any local
// re-derivation would be a second, divergent source of truth.
export function distribution(
  deck: string[],
  votes: Record<string, string>,
  participants: Participant[],
  average: number | null,
  consensus: boolean,
): Distribution {
  // The Graph is an analysis surface, so its axis is monotonic even when the
  // deck was entered out of order (D-48 keeps a deck as the host typed it).
  // Cards match columns by exact string equality: `cast_vote` validates against
  // the deck, so every vote is byte-identical to an entry, and an exact match
  // needs no assumption about how a card round-trips through a float.
  const ticks = [...deck].sort((a, b) => Number(a) - Number(b))
  const columns = ticks.map((value) => ({
    value,
    voters: participants.filter((p) => votes[p.id] === value),
  }))

  // `average === null` iff no vote was cast (backend/app/rooms/models.py:274),
  // so this one guard covers both the empty round and the type narrowing below.
  // An empty round also reports `consensus === false`, so extremes must key off
  // it too or Math.min over no values would leak Infinity.
  if (Object.keys(votes).length === 0 || average === null) {
    return { columns, extremes: null, average: null }
  }

  const cast = columns.filter((column) => column.voters.length > 0)

  return {
    columns,
    extremes: consensus ? null : { low: cast[0], high: cast[cast.length - 1] },
    average: mark(ticks, average),
  }
}

// Brackets the mean between two adjacent deck ticks, never between cast values:
// the mark is read against the axis. The mean of cast cards always lies inside
// the deck's range, so there is no out-of-range branch to write.
function mark(ticks: string[], mean: number): AverageMark {
  let i = 0
  while (i + 1 < ticks.length && Number(ticks[i + 1]) <= mean) i += 1

  const lo = ticks[i]
  // Every consensus round lands exactly on a tick; dividing here would be 0/0.
  if (Number(lo) === mean) return { lo, hi: lo, exact: true, t: 0 }

  const hi = ticks[i + 1]
  return {
    lo,
    hi,
    exact: false,
    t: (mean - Number(lo)) / (Number(hi) - Number(lo)),
  }
}
