import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JoinPrompt } from './JoinPrompt'
import * as api from '../../lib/api'
import * as session from '../../lib/session'
import { makeRoom } from '../../test/fixtures'

vi.mock('../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../lib/api')>()
  return { ...actual, joinRoom: vi.fn() }
})
vi.mock('../../lib/session', () => ({ saveSession: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('JoinPrompt', () => {
  it('joins and reports the new participant id', async () => {
    vi.mocked(api.joinRoom).mockResolvedValue({
      participantId: 'p9',
      room: makeRoom({ code: 'ABCDEF' }),
    })
    const onJoined = vi.fn()
    render(<JoinPrompt code="ABCDEF" onJoined={onJoined} />)
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: 'Bob' },
    })
    fireEvent.click(screen.getByRole('button', { name: /join/i }))

    await waitFor(() => expect(onJoined).toHaveBeenCalledWith('p9'))
    expect(api.joinRoom).toHaveBeenCalledWith('ABCDEF', 'Bob')
    expect(session.saveSession).toHaveBeenCalledWith('ABCDEF', 'p9')
  })

  it('surfaces a join error inline without reporting a join', async () => {
    vi.mocked(api.joinRoom).mockRejectedValue({ status: 404, detail: 'x' })
    const onJoined = vi.fn()
    render(<JoinPrompt code="ZZZZZZ" onJoined={onJoined} />)
    fireEvent.click(screen.getByRole('button', { name: /join/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /no room with that code/i,
    )
    expect(onJoined).not.toHaveBeenCalled()
  })
})
