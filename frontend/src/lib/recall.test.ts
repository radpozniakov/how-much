import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadRecall, rememberInputs } from './recall'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('recall', () => {
  it('recalls nothing before the first submission', () => {
    expect(loadRecall()).toEqual({ name: '', cards: '' })
  })

  it('round-trips both fields', () => {
    rememberInputs({ name: 'Alice', cards: '1, 2, 3' })
    expect(loadRecall()).toEqual({ name: 'Alice', cards: '1, 2, 3' })
  })

  it('replaces only the patched field', () => {
    rememberInputs({ name: 'Alice', cards: '1, 2, 3' })
    rememberInputs({ name: 'Bob' })
    expect(loadRecall()).toEqual({ name: 'Bob', cards: '1, 2, 3' })
  })

  it('remembers a blank value as blank', () => {
    rememberInputs({ cards: '1, 2, 3' })
    rememberInputs({ cards: '' })
    expect(loadRecall().cards).toBe('')
  })

  it('lives in localStorage, not the sessionStorage identity record', () => {
    rememberInputs({ name: 'Alice' })
    expect(localStorage.getItem('howmuch:recall')).toBeTruthy()
    expect(sessionStorage.getItem('howmuch:recall')).toBeNull()
  })

  it('ignores malformed stored JSON', () => {
    localStorage.setItem('howmuch:recall', '{ not json')
    expect(loadRecall()).toEqual({ name: '', cards: '' })
  })

  it('ignores non-string fields, field by field', () => {
    localStorage.setItem(
      'howmuch:recall',
      JSON.stringify({ name: 7, cards: 'x' }),
    )
    expect(loadRecall()).toEqual({ name: '', cards: 'x' })
  })

  it('treats a throwing storage as nothing recalled (no crash)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    expect(loadRecall()).toEqual({ name: '', cards: '' })
    expect(() => rememberInputs({ name: 'Alice' })).not.toThrow()
  })
})
