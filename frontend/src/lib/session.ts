// Per-tab identity persistence (D-39). We store the participant_id + room code
// learned over HTTP so a reload can reconnect via `attach`. sessionStorage (not
// localStorage) is deliberate: each browser tab is its own participant.
//
// All access is wrapped: disabled storage / private mode / quota errors degrade
// to "no session" (the user just re-enters their name) rather than crashing.

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
  } catch {
    // Storage unavailable — identity won't survive a reload, but that's a
    // graceful fresh rejoin (D-15), not a fatal error.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
