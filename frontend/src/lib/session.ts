const KEY = 'howmuch:session'

export interface StoredSession {
  code: string
  participantId: string
}

export function loadSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as StoredSession).code === 'string' &&
      typeof (parsed as StoredSession).participantId === 'string'
    ) {
      const { code, participantId } = parsed as StoredSession
      return { code, participantId }
    }
    return null
  } catch {
    return null
  }
}

export function saveSession(code: string, participantId: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ code, participantId }))
    // eslint-disable-next-line no-empty
  } catch {}
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY)
    // eslint-disable-next-line no-empty
  } catch {}
}
