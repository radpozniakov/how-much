const KEY = 'howmuch:recall'

export interface RecalledInputs {
  name: string
  cards: string
}

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
    return {
      name: readString(record, 'name'),
      cards: readString(record, 'cards'),
    }
  } catch {
    return nothing()
  }
}

export function rememberInputs(patch: Partial<RecalledInputs>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadRecall(), ...patch }))
  } catch {
    // ignore
  }
}
