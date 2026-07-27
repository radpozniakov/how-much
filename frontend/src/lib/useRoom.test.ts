import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useRoom } from './useRoom'
import { clearSession, loadSession, saveSession } from './session'
import { FIBONACCI_DECK } from './deck'
import type { RoomView } from '../types'
import { MockWebSocket, deliver, lastSocket } from '../test/mockWebSocket'

const fakeRoom: RoomView = {
  code: 'ABCDEF',
  deck: [...FIBONACCI_DECK],
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
  clearSession()
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

  it('setItem sends a set_item frame once live', () => {
    const { result } = renderHook(() => useRoom('ABCDEF', 'pid-1'))
    act(() => {
      deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    })
    act(() => {
      result.current.setItem('X')
    })
    const sent = lastSocket().sent.map((s) => JSON.parse(s))
    expect(sent).toContainEqual({ type: 'set_item', topic: 'X' })
  })

  it('setItem(null) sends a set_item frame with a null topic', () => {
    const { result } = renderHook(() => useRoom('ABCDEF', 'pid-1'))
    act(() => {
      deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    })
    act(() => {
      result.current.setItem(null)
    })
    const sent = lastSocket().sent.map((s) => JSON.parse(s))
    expect(sent).toContainEqual({ type: 'set_item', topic: null })
  })

  it('keeps a stable setItem reference across renders', () => {
    const { result, rerender } = renderHook(() => useRoom('ABCDEF', 'pid-1'))
    const first = result.current.setItem
    act(() => {
      deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    })
    rerender()
    expect(result.current.setItem).toBe(first)
  })

  it('setHostVoting sends a set_host_voting frame once live', () => {
    const { result } = renderHook(() => useRoom('ABCDEF', 'pid-1'))
    act(() => {
      deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    })
    act(() => {
      result.current.setHostVoting(false)
    })
    const sent = lastSocket().sent.map((s) => JSON.parse(s))
    expect(sent).toContainEqual({ type: 'set_host_voting', voting: false })
  })

  it('keeps a stable setHostVoting reference across renders', () => {
    const { result, rerender } = renderHook(() => useRoom('ABCDEF', 'pid-1'))
    const first = result.current.setHostVoting
    act(() => {
      deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    })
    rerender()
    expect(result.current.setHostVoting).toBe(first)
  })

  it('transferHost sends a transfer_host frame once live', () => {
    const { result } = renderHook(() => useRoom('ABCDEF', 'pid-1'))
    act(() => {
      deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    })
    act(() => {
      result.current.transferHost('p2')
    })
    const sent = lastSocket().sent.map((s) => JSON.parse(s))
    expect(sent).toContainEqual({ type: 'transfer_host', target_id: 'p2' })
  })

  it('keeps a stable transferHost reference across renders', () => {
    const { result, rerender } = renderHook(() => useRoom('ABCDEF', 'pid-1'))
    const first = result.current.transferHost
    act(() => {
      deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    })
    rerender()
    expect(result.current.transferHost).toBe(first)
  })

  it('removeParticipant sends a remove_participant frame once live', () => {
    const { result } = renderHook(() => useRoom('ABCDEF', 'pid-1'))
    act(() => {
      deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    })
    act(() => {
      result.current.removeParticipant('p2')
    })
    const sent = lastSocket().sent.map((s) => JSON.parse(s))
    expect(sent).toContainEqual({ type: 'remove_participant', target_id: 'p2' })
  })

  it('keeps a stable removeParticipant reference across renders', () => {
    const { result, rerender } = renderHook(() => useRoom('ABCDEF', 'pid-1'))
    const first = result.current.removeParticipant
    act(() => {
      deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    })
    rerender()
    expect(result.current.removeParticipant).toBe(first)
  })

  it('clears the persisted session when this client is removed', () => {
    const { result } = renderHook(() => useRoom('ABCDEF', 'pid-1'))
    act(() => {
      deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    })
    saveSession('ABCDEF', 'pid-1')

    act(() => {
      deliver(lastSocket(), {
        type: 'error',
        reason: 'removed',
        message: 'gone',
      })
    })

    expect(result.current.status).toBe('rejected')
    expect(loadSession()).toBeNull()
  })

  it('leaves the session alone for a non-terminal mid-session error', () => {
    renderHook(() => useRoom('ABCDEF', 'pid-1'))
    act(() => {
      deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    })
    saveSession('ABCDEF', 'pid-1')

    act(() => {
      deliver(lastSocket(), {
        type: 'error',
        reason: 'not_host',
        message: 'nope',
      })
    })

    expect(loadSession()).not.toBeNull()
  })

  it('reveal sends a reveal frame once live', () => {
    const { result } = renderHook(() => useRoom('ABCDEF', 'pid-1'))
    act(() => {
      deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    })
    act(() => {
      result.current.reveal()
    })
    const sent = lastSocket().sent.map((s) => JSON.parse(s))
    expect(sent).toContainEqual({ type: 'reveal' })
  })

  it('keeps a stable reveal reference across renders', () => {
    const { result, rerender } = renderHook(() => useRoom('ABCDEF', 'pid-1'))
    const first = result.current.reveal
    act(() => {
      deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    })
    rerender()
    expect(result.current.reveal).toBe(first)
  })

  it('reset sends a reset frame once live', () => {
    const { result } = renderHook(() => useRoom('ABCDEF', 'pid-1'))
    act(() => {
      deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    })
    act(() => {
      result.current.reset()
    })
    const sent = lastSocket().sent.map((s) => JSON.parse(s))
    expect(sent).toContainEqual({ type: 'reset' })
  })

  it('keeps a stable reset reference across renders', () => {
    const { result, rerender } = renderHook(() => useRoom('ABCDEF', 'pid-1'))
    const first = result.current.reset
    act(() => {
      deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    })
    rerender()
    expect(result.current.reset).toBe(first)
  })
})
