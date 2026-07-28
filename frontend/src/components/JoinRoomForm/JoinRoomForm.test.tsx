import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { JoinRoomForm } from './JoinRoomForm'
import * as api from '../../lib/api'
import { loadRecall, rememberInputs } from '../../lib/recall'
import * as session from '../../lib/session'
import { makeRoom } from '../../test/fixtures'
import type * as ReactRouter from 'react-router'

const navigate = vi.fn()

vi.mock('../../lib/api', async (importActual) => {
  const actual = await importActual<typeof api>()
  return { ...actual, joinRoom: vi.fn() }
})
vi.mock('react-router', async (importActual) => ({
  ...(await importActual<typeof ReactRouter>()),
  useNavigate: () => navigate,
}))
vi.mock('../../lib/session', () => ({ saveSession: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  localStorage.clear()
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

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/room/ABCDEF'))
    expect(api.joinRoom).toHaveBeenCalledWith('ABCDEF', 'Bob')
    expect(session.saveSession).toHaveBeenCalledWith('ABCDEF', 'p2')
  })

  it('shows a 404 as a friendly inline error', async () => {
    vi.mocked(api.joinRoom).mockRejectedValue({ status: 404, detail: 'x' })
    render(<JoinRoomForm />)
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: 'Bob' },
    })
    fireEvent.change(screen.getByLabelText(/code/i), {
      target: { value: 'abcdef' },
    })
    fireEvent.click(screen.getByRole('button', { name: /join/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /no room with that code/i,
    )
  })

  it('starts the name from recall and leaves the code empty', () => {
    rememberInputs({ name: 'Bob', cards: '1, 2, 3' })
    render(<JoinRoomForm />)
    expect(screen.getByLabelText(/name/i)).toHaveValue('Bob')
    expect(screen.getByLabelText(/code/i)).toHaveValue('')
  })

  it('remembers the name on a successful join, deck untouched', async () => {
    rememberInputs({ name: 'Bob', cards: '1, 2, 3' })
    vi.mocked(api.joinRoom).mockResolvedValue({
      participantId: 'p2',
      room: makeRoom({ code: 'ABCDEF' }),
    })
    render(<JoinRoomForm />)
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: 'Bobby' },
    })
    fireEvent.change(screen.getByLabelText(/code/i), {
      target: { value: 'abcdef' },
    })
    fireEvent.click(screen.getByRole('button', { name: /join/i }))

    await waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(loadRecall()).toEqual({ name: 'Bobby', cards: '1, 2, 3' })
  })

  it('remembers nothing when the join fails', async () => {
    rememberInputs({ name: 'Bob' })
    vi.mocked(api.joinRoom).mockRejectedValue({ status: 404, detail: 'x' })
    render(<JoinRoomForm />)
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: 'Bobby' },
    })
    fireEvent.change(screen.getByLabelText(/code/i), {
      target: { value: 'zzzzzz' },
    })
    fireEvent.click(screen.getByRole('button', { name: /join/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(loadRecall().name).toBe('Bob')
  })
})
