import { describe, expect, it } from 'vitest'
import { makeResults, makeRoom } from '../test/fixtures'
import {
  parseCreateResponse,
  parseJoinResponse,
  parseRoomView,
  parseServerFrame,
} from './protocol'

describe('protocol validation', () => {
  it('accepts a complete room snapshot', () => {
    const room = makeRoom({
      results: makeResults({ votes: { p1: '5' }, average: 5 }),
    })

    expect(parseRoomView(room)).toBe(room)
    expect(parseServerFrame({ type: 'room_state', room })).toEqual({
      type: 'room_state',
      room,
    })
  })

  it('accepts server error frames', () => {
    const frame = { type: 'error', reason: 'not_host', message: 'No' }
    expect(parseServerFrame(frame)).toEqual(frame)
  })

  it.each([
    null,
    {},
    { ...makeRoom(), deck: [1] },
    { ...makeRoom(), participants: [{ id: 'p1', name: 'Alice' }] },
    { ...makeRoom(), results: { votes: { p1: 5 } } },
  ])('rejects an invalid room snapshot', (value) => {
    expect(() => parseRoomView(value)).toThrow('Invalid room payload')
  })

  it.each([
    { type: 'unknown' },
    { type: 'error', reason: 1, message: 'No' },
    { type: 'room_state', room: {} },
  ])('rejects an invalid server frame', (value) => {
    expect(() => parseServerFrame(value)).toThrow(
      'Invalid server frame payload',
    )
  })

  it('validates HTTP response envelopes', () => {
    const room = makeRoom()
    expect(parseJoinResponse({ participant_id: 'p1', room })).toEqual({
      participant_id: 'p1',
      room,
    })
    expect(
      parseCreateResponse({ participant_id: 'p1', room, link: '/room/ABCDEF' }),
    ).toEqual({ participant_id: 'p1', room, link: '/room/ABCDEF' })

    expect(() => parseJoinResponse({ participant_id: 'p1', room: {} })).toThrow(
      'Invalid join response payload',
    )
    expect(() => parseCreateResponse({ participant_id: 'p1', room })).toThrow(
      'Invalid create response payload',
    )
  })
})
