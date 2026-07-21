import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSession, loadSession, saveSession } from './session'

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('session', () => {
  it('round-trips save / load / clear', () => {
    expect(loadSession()).toBeNull()
    saveSession('ABCDEF', 'pid-1')
    expect(loadSession()).toEqual({ code: 'ABCDEF', participantId: 'pid-1' })
    clearSession()
    expect(loadSession()).toBeNull()
  })

  it('ignores malformed stored JSON', () => {
    sessionStorage.setItem('howmuch:session', '{ not json')
    expect(loadSession()).toBeNull()
  })

  it('treats a throwing storage as no session (no crash)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    expect(loadSession()).toBeNull()
    expect(() => saveSession('ABCDEF', 'pid-1')).not.toThrow()
  })
})
