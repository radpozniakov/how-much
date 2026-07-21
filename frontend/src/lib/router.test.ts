import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { matchRoom, navigate, useRoute } from './router'

describe('matchRoom', () => {
  it('extracts the code from /room/:code', () => {
    expect(matchRoom('/room/ABCDEF')).toBe('ABCDEF')
  })
  it('tolerates a trailing slash', () => {
    expect(matchRoom('/room/ABCDEF/')).toBe('ABCDEF')
  })
  it('decodes percent-encoding', () => {
    expect(matchRoom('/room/AB%20CD')).toBe('AB CD')
  })
  it('returns null for the root', () => {
    expect(matchRoom('/')).toBeNull()
  })
  it('returns null for an unrelated path', () => {
    expect(matchRoom('/foo/bar')).toBeNull()
  })
  it('returns null for an empty code', () => {
    expect(matchRoom('/room/')).toBeNull()
  })
})

describe('navigate + useRoute', () => {
  it('updates the path and notifies subscribers', () => {
    window.history.pushState({}, '', '/')
    const { result } = renderHook(() => useRoute())
    expect(result.current).toBe('/')
    act(() => {
      navigate('/room/ZZZZ')
    })
    expect(result.current).toBe('/room/ZZZZ')
    expect(window.location.pathname).toBe('/room/ZZZZ')
  })
})
