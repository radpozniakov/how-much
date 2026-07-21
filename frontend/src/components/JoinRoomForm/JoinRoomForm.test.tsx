import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JoinRoomForm } from './JoinRoomForm'
import * as api from '../../lib/api'
import * as router from '../../lib/router'
import * as session from '../../lib/session'
import { makeRoom } from '../../test/fixtures'

vi.mock('../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../lib/api')>()
  return { ...actual, joinRoom: vi.fn() }
})
vi.mock('../../lib/router', () => ({ navigate: vi.fn() }))
vi.mock('../../lib/session', () => ({ saveSession: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('JoinRoomForm', () => {
  it('uppercases the code and joins', async () => {
    vi.mocked(api.joinRoom).mockResolvedValue({
      participantId: 'p2',
      room: makeRoom({ code: 'ABCDEF' }),
    })
    render(<JoinRoomForm />)
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: 'Bob' },
    })
    fireEvent.change(screen.getByLabelText(/code/i), {
      target: { value: 'abcdef' },
    })
    fireEvent.click(screen.getByRole('button', { name: /join/i }))

    await waitFor(() =>
      expect(router.navigate).toHaveBeenCalledWith('/room/ABCDEF'),
    )
    expect(api.joinRoom).toHaveBeenCalledWith('ABCDEF', 'Bob')
    expect(session.saveSession).toHaveBeenCalledWith('ABCDEF', 'p2')
  })

  it('shows a 404 as a friendly inline error', async () => {
    vi.mocked(api.joinRoom).mockRejectedValue({ status: 404, detail: 'x' })
    render(<JoinRoomForm />)
    fireEvent.click(screen.getByRole('button', { name: /join/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /no room with that code/i,
    )
  })
})
