import { expect, request, test } from '@playwright/test'

// Room capacity (FR-5, D-6): at most 30 participants; the 31st join is rejected
// with a clear message. Driven over HTTP — spinning up 31 real browsers would be
// slow and adds nothing over exercising the same domain seam the socket uses.

const API_URL = process.env.HOWMUCH_API_URL ?? 'http://localhost:8000'
const CAPACITY = 30

test('a room accepts 30 participants and rejects the 31st (FR-5)', async () => {
  const api = await request.newContext({ baseURL: API_URL })

  // Creating the room adds the host as participant #1.
  const created = await api.post('/rooms', { data: { name: 'Host' } })
  expect(created.status()).toBe(201)
  const { room } = (await created.json()) as { room: { code: string } }
  const code = room.code

  // Fill the remaining 29 slots (participants #2..#30) — all should succeed.
  let joined = 1
  for (let i = 2; i <= CAPACITY; i++) {
    const res = await api.post(`/rooms/${code}/participants`, {
      data: { name: `P${i}` },
    })
    expect(res.status(), `participant #${i} should be admitted`).toBe(201)
    joined++
  }
  expect(joined).toBe(CAPACITY)

  // The 31st join is over capacity → 409 with an explanatory detail (FR-5).
  const overflow = await api.post(`/rooms/${code}/participants`, {
    data: { name: 'P31' },
  })
  expect(overflow.status()).toBe(409)
  const body = (await overflow.json()) as { detail: string }
  expect(body.detail.toLowerCase()).toMatch(/full|capacity|30/)

  await api.dispose()
})
