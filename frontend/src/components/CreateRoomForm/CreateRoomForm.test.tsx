import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CreateRoomForm } from './CreateRoomForm'
import * as api from '../../lib/api'
import * as session from '../../lib/session'
import { makeRoom } from '../../test/fixtures'

const navigate = vi.fn()

vi.mock('../../lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../../lib/api')>()
  return { ...actual, createRoom: vi.fn() }
})
vi.mock('react-router', async (importActual) => ({
  ...(await importActual<typeof import('react-router')>()),
  useNavigate: () => navigate,
}))
vi.mock('../../lib/session', () => ({ saveSession: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CreateRoomForm', () => {
  it('creates a room, saves the session, and navigates to it', async () => {
    vi.mocked(api.createRoom).mockResolvedValue({
      participantId: 'p1',
      room: makeRoom({ code: 'ABCDEF' }),
      link: 'http://localhost:5173/room/ABCDEF',
    })
    render(<CreateRoomForm />)
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: 'Alice' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/room/ABCDEF'))
    expect(api.createRoom).toHaveBeenCalledWith('Alice')
    expect(session.saveSession).toHaveBeenCalledWith('ABCDEF', 'p1')
  })

  it('surfaces a server error inline', async () => {
    vi.mocked(api.createRoom).mockRejectedValue({ status: 422, detail: 'bad' })
    render(<CreateRoomForm />)
    // Fill the required name field so submit reaches the API (the name input
    // is `required`; an empty submit is blocked by native validation).
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: 'Alice' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('bad')
    expect(navigate).not.toHaveBeenCalled()
  })
})
