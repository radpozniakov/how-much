import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useRoom } from './useRoom'
import type { RoomView } from '../types'
import { MockWebSocket, deliver, lastSocket } from '../test/mockWebSocket'

const fakeRoom: RoomView = {
  code: 'ABCDEF',
  host_id: 'pid-1',
  participants: [{ id: 'pid-1', name: 'Alice', has_voted: false }],
  current_item: null,
  host_voting: true,
  revealed: false,
  results: null,
}

beforeEach(() => {
  MockWebSocket.instances = []
  vi.stubGlobal('WebSocket', MockWebSocket)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useRoom', () => {
  it('castVote sends a cast_vote frame once live', () => {
    const { result } = renderHook(() => useRoom('ABCDEF', 'pid-1'))
    act(() => {
      deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    })
    act(() => {
      result.current.castVote('5')
    })
    const sent = lastSocket().sent.map((s) => JSON.parse(s))
    expect(sent).toContainEqual({ type: 'cast_vote', card: '5' })
  })

  it('keeps a stable castVote reference across renders', () => {
    const { result, rerender } = renderHook(() => useRoom('ABCDEF', 'pid-1'))
    const first = result.current.castVote
    act(() => {
      deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    })
    rerender()
    expect(result.current.castVote).toBe(first)
  })
})
