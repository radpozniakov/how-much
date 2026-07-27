import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CreateRoomForm } from './CreateRoomForm'
import * as api from '../../lib/api'
import { FIBONACCI_DECK } from '../../lib/deck'
import { loadRecall, rememberInputs } from '../../lib/recall'
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

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
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
    expect(api.createRoom).toHaveBeenCalledWith('Alice', '')
    expect(session.saveSession).toHaveBeenCalledWith('ABCDEF', 'p1')
  })

  it('surfaces a server error inline', async () => {
    vi.mocked(api.createRoom).mockRejectedValue({ status: 422, detail: 'bad' })
    render(<CreateRoomForm />)
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: 'Alice' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('bad')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('sends the card values as typed, unparsed', () => {
    vi.mocked(api.createRoom).mockResolvedValue({
      participantId: 'p1',
      room: makeRoom({ code: 'ABCDEF' }),
      link: 'http://localhost:5173/room/ABCDEF',
    })
    render(<CreateRoomForm />)
    fireEvent.change(screen.getByLabelText('Your name'), {
      target: { value: 'Alice' },
    })
    fireEvent.change(screen.getByLabelText('Card values'), {
      target: { value: ' 8, 5, 3 ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    expect(api.createRoom).toHaveBeenCalledWith('Alice', ' 8, 5, 3 ')
  })

  it('leaves the card-values field optional and describes the default', () => {
    render(<CreateRoomForm />)
    const cards = screen.getByLabelText('Card values')
    expect(cards).not.toBeRequired()
    expect(cards).toHaveAccessibleDescription(
      new RegExp(FIBONACCI_DECK.join(', ')),
    )
  })

  it('surfaces a rejected deck inline and stays on the page', async () => {
    vi.mocked(api.createRoom).mockRejectedValue({
      status: 422,
      detail: 'card values must not repeat',
    })
    render(<CreateRoomForm />)
    fireEvent.change(screen.getByLabelText('Your name'), {
      target: { value: 'Alice' },
    })
    fireEvent.change(screen.getByLabelText('Card values'), {
      target: { value: '1, 1, 2' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'card values must not repeat',
    )
    expect(navigate).not.toHaveBeenCalled()
  })

  it('starts both fields from what this device last submitted', () => {
    rememberInputs({ name: 'Alice', cards: '1, 2, 3' })
    render(<CreateRoomForm />)
    expect(screen.getByLabelText('Your name')).toHaveValue('Alice')
    expect(screen.getByLabelText('Card values')).toHaveValue('1, 2, 3')
  })

  it('leaves a recalled value editable, like any other input', async () => {
    vi.mocked(api.createRoom).mockResolvedValue({
      participantId: 'p1',
      room: makeRoom({ code: 'ABCDEF' }),
      link: 'http://localhost:5173/room/ABCDEF',
    })
    rememberInputs({ name: 'Alice', cards: '1, 2, 3' })
    render(<CreateRoomForm />)
    fireEvent.change(screen.getByLabelText('Your name'), {
      target: { value: 'Alicia' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() =>
      expect(api.createRoom).toHaveBeenCalledWith('Alicia', '1, 2, 3'),
    )
    expect(loadRecall()).toEqual({ name: 'Alicia', cards: '1, 2, 3' })
  })

  it('remembers the name and deck once the server accepts them', async () => {
    vi.mocked(api.createRoom).mockResolvedValue({
      participantId: 'p1',
      room: makeRoom({ code: 'ABCDEF' }),
      link: 'http://localhost:5173/room/ABCDEF',
    })
    render(<CreateRoomForm />)
    fireEvent.change(screen.getByLabelText('Your name'), {
      target: { value: 'Alice' },
    })
    fireEvent.change(screen.getByLabelText('Card values'), {
      target: { value: '1, 2, 3' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(loadRecall()).toEqual({ name: 'Alice', cards: '1, 2, 3' })
  })

  it('remembers nothing when the server rejects the deck', async () => {
    rememberInputs({ name: 'Alice', cards: '1, 2, 3' })
    vi.mocked(api.createRoom).mockRejectedValue({
      status: 422,
      detail: 'card values must not repeat',
    })
    render(<CreateRoomForm />)
    fireEvent.change(screen.getByLabelText('Card values'), {
      target: { value: '5, 5' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(loadRecall()).toEqual({ name: 'Alice', cards: '1, 2, 3' })
  })

  it('placeholders the card-values field with the default deck', () => {
    render(<CreateRoomForm />)
    expect(screen.getByLabelText('Card values')).toHaveAttribute(
      'placeholder',
      FIBONACCI_DECK.join(', '),
    )
  })

  it('shows the placeholder exactly when no deck is recalled', () => {
    const { unmount } = render(<CreateRoomForm />)
    expect(screen.getByLabelText('Card values')).toHaveValue('')
    unmount()

    rememberInputs({ cards: '1, 2, 3' })
    render(<CreateRoomForm />)
    expect(screen.getByLabelText('Card values')).toHaveValue('1, 2, 3')
  })

  it('remembers the name trimmed, matching what the server takes', async () => {
    vi.mocked(api.createRoom).mockResolvedValue({
      participantId: 'p1',
      room: makeRoom({ code: 'ABCDEF' }),
      link: 'http://localhost:5173/room/ABCDEF',
    })
    render(<CreateRoomForm />)
    fireEvent.change(screen.getByLabelText('Your name'), {
      target: { value: '  Alice  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(api.createRoom).toHaveBeenCalledWith('  Alice  ', '')
    expect(loadRecall().name).toBe('Alice')
  })

  it('starts with empty fields when storage refuses to be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled')
    })
    render(<CreateRoomForm />)
    expect(screen.getByLabelText('Your name')).toHaveValue('')
    expect(screen.getByLabelText('Card values')).toHaveValue('')
  })

  it('clears the recalled deck when the field is submitted blank', async () => {
    rememberInputs({ name: 'Alice', cards: '1, 2, 3' })
    vi.mocked(api.createRoom).mockResolvedValue({
      participantId: 'p1',
      room: makeRoom({ code: 'ABCDEF' }),
      link: 'http://localhost:5173/room/ABCDEF',
    })
    render(<CreateRoomForm />)
    fireEvent.change(screen.getByLabelText('Card values'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(loadRecall()).toEqual({ name: 'Alice', cards: '' })
  })
})
