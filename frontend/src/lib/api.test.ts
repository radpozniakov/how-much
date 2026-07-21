import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRoom, isApiError, joinRoom } from './api'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(status: number, body: unknown) {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(res as unknown as Response)),
  )
}

describe('api error normalization', () => {
  it('passes a string detail through (404)', async () => {
    stubFetch(404, { detail: 'Room not found' })
    try {
      await joinRoom('ABCDEF', 'Bob')
      expect.unreachable('joinRoom should have thrown')
    } catch (err) {
      expect(isApiError(err)).toBe(true)
      if (isApiError(err)) {
        expect(err.status).toBe(404)
        expect(err.detail).toBe('Room not found')
      }
    }
  })

  it('flattens a validation-list detail to the first message (422)', async () => {
    stubFetch(422, {
      detail: [
        { loc: ['body', 'name'], msg: 'name must not be blank', type: 'x' },
      ],
    })
    try {
      await createRoom('')
      expect.unreachable('createRoom should have thrown')
    } catch (err) {
      expect(isApiError(err)).toBe(true)
      if (isApiError(err)) {
        expect(err.status).toBe(422)
        expect(err.detail).toBe('name must not be blank')
      }
    }
  })

  it('maps a network failure to status 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    try {
      await joinRoom('ABCDEF', 'Bob')
      expect.unreachable('joinRoom should have thrown')
    } catch (err) {
      expect(isApiError(err)).toBe(true)
      if (isApiError(err)) {
        expect(err.status).toBe(0)
        expect(err.detail).toBe('Could not reach the server.')
      }
    }
  })
})

describe('api success', () => {
  it('maps a create response to camelCase + canonical code', async () => {
    stubFetch(201, {
      participant_id: 'p1',
      room: { code: 'ABCDEF', participants: [] },
      link: 'http://localhost:5173/room/ABCDEF',
    })
    const result = await createRoom('Alice')
    expect(result.participantId).toBe('p1')
    expect(result.room.code).toBe('ABCDEF')
    expect(result.link).toBe('http://localhost:5173/room/ABCDEF')
  })
})
