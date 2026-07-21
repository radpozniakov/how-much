import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomSocket } from './roomSocket'
import type { RoomView } from '../types'

// jsdom has no WebSocket, so we control one entirely. The RoomSocket only uses
// send/close and the onopen/onmessage/onclose handler slots.
class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  sent: string[] = []
  closed = false

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.closed = true
  }
}

function last(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1]
}

function deliver(ws: MockWebSocket, frame: unknown) {
  ws.onmessage?.({ data: JSON.stringify(frame) })
}

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
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function openSocket(): RoomSocket {
  const socket = new RoomSocket()
  socket.open('ABCDEF', 'pid-1')
  return socket
}

describe('RoomSocket', () => {
  it('sends an attach frame on open', () => {
    const socket = openSocket()
    expect(socket.getSnapshot().status).toBe('connecting')
    last().onopen?.()
    expect(last().sent).toHaveLength(1)
    expect(JSON.parse(last().sent[0])).toEqual({
      type: 'attach',
      participant_id: 'pid-1',
    })
  })

  it('goes live on room_state and stores the snapshot', () => {
    const socket = openSocket()
    deliver(last(), { type: 'room_state', room: fakeRoom })
    const state = socket.getSnapshot()
    expect(state.status).toBe('live')
    expect(state.room).toEqual(fakeRoom)
  })

  it('treats a handshake-phase close as terminal with no reconnect', () => {
    const socket = openSocket()
    last().onclose?.() // close before any snapshot arrives
    expect(socket.getSnapshot().status).toBe('rejected')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('carries a stashed handshake error reason into the rejection', () => {
    const socket = openSocket()
    deliver(last(), { type: 'error', reason: 'not_in_room', message: 'gone' })
    last().onclose?.()
    expect(socket.getSnapshot().status).toBe('rejected')
    expect(socket.getSnapshot().error?.reason).toBe('not_in_room')
  })

  it('reconnects after a live-phase drop', () => {
    const socket = openSocket()
    deliver(last(), { type: 'room_state', room: fakeRoom })
    const count = MockWebSocket.instances.length
    last().onclose?.()
    expect(socket.getSnapshot().status).toBe('reconnecting')
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(MockWebSocket.instances.length).toBe(count + 1)
  })

  it('keeps the socket open on a live-phase error frame', () => {
    const socket = openSocket()
    deliver(last(), { type: 'room_state', room: fakeRoom })
    const ws = last()
    deliver(ws, { type: 'error', reason: 'not_host', message: 'nope' })
    expect(socket.getSnapshot().status).toBe('live')
    expect(socket.getSnapshot().error?.reason).toBe('not_host')
    expect(ws.closed).toBe(false)
  })

  it('returns a stable getSnapshot ref until a mutation, then a new one', () => {
    const socket = openSocket()
    const a = socket.getSnapshot()
    expect(socket.getSnapshot()).toBe(a)
    deliver(last(), { type: 'room_state', room: fakeRoom })
    const b = socket.getSnapshot()
    expect(b).not.toBe(a)
    expect(socket.getSnapshot()).toBe(b)
  })

  it('suppresses reconnect when closed by the client', () => {
    const socket = openSocket()
    deliver(last(), { type: 'room_state', room: fakeRoom })
    const ws = last()
    socket.close()
    expect(ws.closed).toBe(true)
    expect(ws.onclose).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    expect(socket.getSnapshot().status).toBe('live')
  })
})
