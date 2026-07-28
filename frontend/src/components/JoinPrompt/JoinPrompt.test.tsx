import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { ReactElement } from 'react'
import { JoinPrompt } from './JoinPrompt'
import * as api from '../../lib/api'
import { loadRecall, rememberInputs } from '../../lib/recall'
import * as session from '../../lib/session'
import { makeRoom } from '../../test/fixtures'

const renderInRouter = (ui: ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>)

vi.mock('../../lib/api', async (importActual) => {
  const actual = await importActual<typeof api>()
  return { ...actual, joinRoom: vi.fn() }
})
vi.mock('../../lib/session', () => ({ saveSession: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  localStorage.clear()
})

describe('JoinPrompt', () => {
  it('joins and reports the new participant id', async () => {
    vi.mocked(api.joinRoom).mockResolvedValue({
      participantId: 'p9',
      room: makeRoom({ code: 'ABCDEF' }),
    })
    const onJoined = vi.fn()
    renderInRouter(<JoinPrompt code="ABCDEF" onJoined={onJoined} />)
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
    renderInRouter(<JoinPrompt code="ZZZZZZ" onJoined={onJoined} />)
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: 'Bob' },
    })
    fireEvent.click(screen.getByRole('button', { name: /join/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /no room with that code/i,
    )
    expect(onJoined).not.toHaveBeenCalled()
  })

  it('routes to the home page on the home button', async () => {
    render(
      <MemoryRouter initialEntries={['/room/ABCDEF']}>
        <Routes>
          <Route path="/" element={<div>home page</div>} />
          <Route
            path="/room/:code"
            element={<JoinPrompt code="ABCDEF" onJoined={vi.fn()} />}
          />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /go to home page/i }))
    expect(await screen.findByText('home page')).toBeInTheDocument()
  })

  it('starts the name from recall', () => {
    rememberInputs({ name: 'Bob' })
    renderInRouter(<JoinPrompt code="ABCDEF" onJoined={vi.fn()} />)
    expect(screen.getByLabelText(/name/i)).toHaveValue('Bob')
  })

  it('remembers the name on a successful join', async () => {
    vi.mocked(api.joinRoom).mockResolvedValue({
      participantId: 'p9',
      room: makeRoom({ code: 'ABCDEF' }),
    })
    const onJoined = vi.fn()
    renderInRouter(<JoinPrompt code="ABCDEF" onJoined={onJoined} />)
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: 'Bob' },
    })
    fireEvent.click(screen.getByRole('button', { name: /join/i }))

    await waitFor(() => expect(onJoined).toHaveBeenCalled())
    expect(loadRecall().name).toBe('Bob')
  })
})
