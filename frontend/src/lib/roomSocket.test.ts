import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomSocket } from './roomSocket'
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
    lastSocket().onopen?.()
    expect(lastSocket().sent).toHaveLength(1)
    expect(JSON.parse(lastSocket().sent[0])).toEqual({
      type: 'attach',
      participant_id: 'pid-1',
    })
  })

  it('goes live on room_state and stores the snapshot', () => {
    const socket = openSocket()
    deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    const state = socket.getSnapshot()
    expect(state.status).toBe('live')
    expect(state.room).toEqual(fakeRoom)
  })

  it('treats a handshake-phase close as terminal with no reconnect', () => {
    const socket = openSocket()
    lastSocket().onclose?.() // close before any snapshot arrives
    expect(socket.getSnapshot().status).toBe('rejected')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('carries a stashed handshake error reason into the rejection', () => {
    const socket = openSocket()
    deliver(lastSocket(), {
      type: 'error',
      reason: 'not_in_room',
      message: 'gone',
    })
    lastSocket().onclose?.()
    expect(socket.getSnapshot().status).toBe('rejected')
    expect(socket.getSnapshot().error?.reason).toBe('not_in_room')
  })

  it('reconnects after a live-phase drop', () => {
    const socket = openSocket()
    deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    const count = MockWebSocket.instances.length
    lastSocket().onclose?.()
    expect(socket.getSnapshot().status).toBe('reconnecting')
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(MockWebSocket.instances.length).toBe(count + 1)
  })

  it('keeps the socket open on a live-phase error frame', () => {
    const socket = openSocket()
    deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    const ws = lastSocket()
    deliver(ws, { type: 'error', reason: 'not_host', message: 'nope' })
    expect(socket.getSnapshot().status).toBe('live')
    expect(socket.getSnapshot().error?.reason).toBe('not_host')
    expect(ws.closed).toBe(false)
  })

  it('returns a stable getSnapshot ref until a mutation, then a new one', () => {
    const socket = openSocket()
    const a = socket.getSnapshot()
    expect(socket.getSnapshot()).toBe(a)
    deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    const b = socket.getSnapshot()
    expect(b).not.toBe(a)
    expect(socket.getSnapshot()).toBe(b)
  })

  it('suppresses reconnect when closed by the client', () => {
    const socket = openSocket()
    deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    const ws = lastSocket()
    socket.close()
    expect(ws.closed).toBe(true)
    expect(ws.onclose).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    expect(socket.getSnapshot().status).toBe('live')
  })

  it('sends a frame once live', () => {
    const socket = openSocket()
    deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    socket.send({ type: 'cast_vote', card: '5' })
    const sent = lastSocket().sent.map((s) => JSON.parse(s))
    expect(sent).toContainEqual({ type: 'cast_vote', card: '5' })
  })

  it('drops a send before the socket is live (handshake phase)', () => {
    const socket = openSocket()
    expect(socket.getSnapshot().status).toBe('connecting')
    socket.send({ type: 'cast_vote', card: '5' })
    expect(lastSocket().sent).toHaveLength(0)
  })

  it('drops a send while reconnecting', () => {
    const socket = openSocket()
    deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    const ws = lastSocket()
    ws.onclose?.() // live-phase drop -> reconnecting, this.ws cleared
    expect(socket.getSnapshot().status).toBe('reconnecting')
    socket.send({ type: 'cast_vote', card: '5' })
    expect(ws.sent).toHaveLength(0)
  })

  it('drops reveal/reset/set_item/set_host_voting sends before any room_state (connecting)', () => {
    const socket = openSocket()
    expect(socket.getSnapshot().status).toBe('connecting')
    socket.send({ type: 'reveal' })
    socket.send({ type: 'reset' })
    socket.send({ type: 'set_item', topic: 'X' })
    socket.send({ type: 'set_host_voting', voting: false })
    expect(lastSocket().sent).toHaveLength(0)
  })

  it('drops reveal/reset/set_item/set_host_voting sends while reconnecting', () => {
    const socket = openSocket()
    deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    const ws = lastSocket()
    ws.onclose?.() // live-phase drop -> reconnecting, this.ws cleared
    expect(socket.getSnapshot().status).toBe('reconnecting')
    socket.send({ type: 'reveal' })
    socket.send({ type: 'reset' })
    socket.send({ type: 'set_item', topic: 'X' })
    socket.send({ type: 'set_host_voting', voting: false })
    expect(ws.sent).toHaveLength(0)
  })

  it('sends a set_item frame with a topic once live', () => {
    const socket = openSocket()
    deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    socket.send({ type: 'set_item', topic: 'X' })
    expect(lastSocket().sent).toContainEqual(
      JSON.stringify({ type: 'set_item', topic: 'X' }),
    )
  })

  it('sends a set_item frame with a null topic once live', () => {
    const socket = openSocket()
    deliver(lastSocket(), { type: 'room_state', room: fakeRoom })
    socket.send({ type: 'set_item', topic: null })
    expect(lastSocket().sent).toContainEqual(
      JSON.stringify({ type: 'set_item', topic: null }),
    )
  })
})
