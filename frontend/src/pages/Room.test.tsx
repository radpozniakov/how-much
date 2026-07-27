import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Room } from './Room'
import { loadRecall } from '../lib/recall'
import { clearSession, saveSession } from '../lib/session'
import { makeParticipant, makeResults, makeRoom } from '../test/fixtures'
import { MockWebSocket, deliver, lastSocket } from '../test/mockWebSocket'
import { FIBONACCI_DECK } from '../lib/deck'
import type { RoomView } from '../types'

const CODE = 'ABCDEF'

function renderRoomAs(participantId: string) {
  saveSession(CODE, participantId)
  return render(<Room code={CODE} />, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[`/room/${CODE}`]}>{children}</MemoryRouter>
    ),
  })
}

function connect(room: RoomView) {
  act(() => {
    deliver(lastSocket(), { type: 'room_state', room })
  })
}

beforeEach(() => {
  MockWebSocket.instances = []
  vi.stubGlobal('WebSocket', MockWebSocket)
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearSession()
  localStorage.clear()
})

describe('Room (S9 wiring)', () => {
  it('shows host controls to the host', () => {
    renderRoomAs('pid-1')
    connect(
      makeRoom({
        host_id: 'pid-1',
        participants: [makeParticipant({ id: 'pid-1', name: 'Alice' })],
      }),
    )
    expect(
      screen.getByRole('button', { name: 'Reveal cards' }),
    ).toBeInTheDocument()
  })

  it('hides host controls from a non-host', () => {
    renderRoomAs('pid-2')
    connect(
      makeRoom({
        host_id: 'pid-1',
        participants: [
          makeParticipant({ id: 'pid-1', name: 'Alice' }),
          makeParticipant({ id: 'pid-2', name: 'Bob' }),
        ],
      }),
    )
    expect(
      screen.queryByRole('button', { name: 'Reveal cards' }),
    ).not.toBeInTheDocument()
  })

  it('shows the participants roster to the host, listing everyone with self as "me"', async () => {
    const user = userEvent.setup()
    renderRoomAs('pid-1')
    connect(
      makeRoom({
        host_id: 'pid-1',
        host_voting: false,
        participants: [
          makeParticipant({ id: 'pid-1', name: 'Alice' }),
          makeParticipant({ id: 'pid-2', name: 'Bob' }),
        ],
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Room participants' }))

    const panel = screen.getByRole('group', { name: /participants/i })
    const rows = within(panel).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Alice')
    expect(rows[1]).toHaveTextContent('Bob')
    expect(within(rows[0]).getByText('me')).toBeInTheDocument()
    expect(within(rows[1]).queryByText('me')).not.toBeInTheDocument()
  })

  it('hides the participants roster from a non-host', () => {
    renderRoomAs('pid-2')
    connect(
      makeRoom({
        host_id: 'pid-1',
        participants: [
          makeParticipant({ id: 'pid-1', name: 'Alice' }),
          makeParticipant({ id: 'pid-2', name: 'Bob' }),
        ],
      }),
    )
    expect(
      screen.queryByRole('button', { name: 'Room participants' }),
    ).not.toBeInTheDocument()
  })

  it('hides the deck from an opted-out host (host_voting false)', () => {
    renderRoomAs('pid-1')
    connect(
      makeRoom({
        host_id: 'pid-1',
        host_voting: false,
        revealed: false,
        participants: [
          makeParticipant({ id: 'pid-1', name: 'Alice' }),
          makeParticipant({ id: 'pid-2', name: 'Bob' }),
        ],
      }),
    )
    expect(
      screen.queryByRole('region', { name: 'Your vote' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Reveal cards' }),
    ).toBeInTheDocument()
  })

  it('disables voting and revealing until an estimation subject is set', () => {
    renderRoomAs('pid-2')
    connect(
      makeRoom({
        host_id: 'pid-1',
        current_item: null,
        revealed: false,
        participants: [
          makeParticipant({ id: 'pid-1', name: 'Alice' }),
          makeParticipant({ id: 'pid-2', name: 'Bob' }),
        ],
      }),
    )
    for (const card of FIBONACCI_DECK) {
      expect(screen.getByRole('button', { name: card })).toBeDisabled()
    }
    expect(
      screen.getByText('Waiting for the estimation subject'),
    ).toBeInTheDocument()
  })

  it('disables the reveal control until an estimation subject is set', () => {
    renderRoomAs('pid-1')
    connect(
      makeRoom({
        host_id: 'pid-1',
        current_item: null,
        revealed: false,
        participants: [
          makeParticipant({ id: 'pid-1', name: 'Alice' }),
          makeParticipant({ id: 'pid-2', name: 'Bob' }),
        ],
      }),
    )
    expect(screen.getByRole('button', { name: 'Reveal cards' })).toBeDisabled()
  })

  it('disables the reveal control until at least one vote is cast', () => {
    renderRoomAs('pid-1')
    connect(
      makeRoom({
        host_id: 'pid-1',
        current_item: 'Estimate the login page',
        revealed: false,
        participants: [
          makeParticipant({ id: 'pid-1', name: 'Alice' }),
          makeParticipant({ id: 'pid-2', name: 'Bob', has_voted: false }),
        ],
      }),
    )
    expect(screen.getByRole('button', { name: 'Reveal cards' })).toBeDisabled()
  })

  it('enables the reveal control once a vote is cast', () => {
    renderRoomAs('pid-1')
    connect(
      makeRoom({
        host_id: 'pid-1',
        current_item: 'Estimate the login page',
        revealed: false,
        participants: [
          makeParticipant({ id: 'pid-1', name: 'Alice' }),
          makeParticipant({ id: 'pid-2', name: 'Bob', has_voted: true }),
        ],
      }),
    )
    expect(
      screen.getByRole('button', { name: 'Reveal cards' }),
    ).not.toBeDisabled()
  })

  it('hides the reveal control when no one can vote (opted-out host alone)', () => {
    renderRoomAs('pid-1')
    connect(
      makeRoom({
        host_id: 'pid-1',
        host_voting: false,
        revealed: false,
        participants: [makeParticipant({ id: 'pid-1', name: 'Alice' })],
      }),
    )
    expect(
      screen.queryByRole('button', { name: 'Reveal cards' }),
    ).not.toBeInTheDocument()
  })

  it('keeps the deck locked and moves results to the stats view once revealed', async () => {
    const user = userEvent.setup()
    renderRoomAs('pid-2')
    connect(
      makeRoom({
        host_id: 'pid-1',
        revealed: true,
        results: makeResults({
          votes: { 'pid-2': '5' },
          average: 5,
          consensus: true,
        }),
        participants: [
          makeParticipant({ id: 'pid-1', name: 'Alice' }),
          makeParticipant({ id: 'pid-2', name: 'Bob', has_voted: true }),
        ],
      }),
    )

    expect(
      screen.getByRole('region', { name: 'Your vote' }),
    ).toBeInTheDocument()
    for (const card of FIBONACCI_DECK) {
      expect(screen.getByRole('button', { name: card })).toBeDisabled()
    }
    expect(
      screen.queryByRole('heading', { name: 'Results' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Graph view' }))
    expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument()
  })

  it('clears the vote highlight on a pre-reveal reset while keeping the deck mounted', async () => {
    const user = userEvent.setup()
    renderRoomAs('pid-2')

    const bobUnvoted = makeParticipant({
      id: 'pid-2',
      name: 'Bob',
      has_voted: false,
    })
    const base = {
      host_id: 'pid-1' as const,
      current_item: 'Estimate the login page',
      revealed: false,
      participants: [
        makeParticipant({ id: 'pid-1', name: 'Alice' }),
        bobUnvoted,
      ],
    }
    connect(makeRoom(base))

    const five = screen.getByRole('button', { name: '5' })
    await user.click(five)
    expect(five).toHaveAttribute('aria-pressed', 'true')

    connect(
      makeRoom({
        ...base,
        participants: [
          makeParticipant({ id: 'pid-1', name: 'Alice' }),
          makeParticipant({ id: 'pid-2', name: 'Bob', has_voted: true }),
        ],
      }),
    )
    expect(screen.getByRole('button', { name: '5' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    connect(makeRoom(base))

    expect(
      screen.getByRole('region', { name: 'Your vote' }),
    ).toBeInTheDocument()
    for (const card of FIBONACCI_DECK) {
      expect(screen.getByRole('button', { name: card })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
    }
  })

  it('wires both room-control actions into the roster', async () => {
    const user = userEvent.setup()
    renderRoomAs('pid-1')
    connect(
      makeRoom({
        host_id: 'pid-1',
        participants: [
          makeParticipant({ id: 'pid-1', name: 'Alice' }),
          makeParticipant({ id: 'pid-2', name: 'Bob' }),
        ],
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Room participants' }))
    await user.click(screen.getByRole('button', { name: 'Remove from room' }))
    await user.click(screen.getByRole('button', { name: 'Confirm removal' }))

    const sent = lastSocket().sent.map((raw) => JSON.parse(raw))
    expect(sent).toContainEqual({
      type: 'remove_participant',
      target_id: 'pid-2',
    })
  })

  it('tells a removed participant what happened instead of a rejoin prompt', () => {
    renderRoomAs('pid-2')
    connect(
      makeRoom({
        host_id: 'pid-1',
        participants: [
          makeParticipant({ id: 'pid-1', name: 'Alice' }),
          makeParticipant({ id: 'pid-2', name: 'Bob' }),
        ],
      }),
    )

    act(() => {
      deliver(lastSocket(), {
        type: 'error',
        reason: 'removed',
        message: 'The host removed you from this room',
      })
    })

    expect(
      screen.getByText('The host removed you from this room'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Back to start' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: `Join room ${CODE}` }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText('This room no longer exists.')).toBeNull()
  })

  it('drops the room UI entirely once removed', () => {
    renderRoomAs('pid-2')
    connect(
      makeRoom({
        host_id: 'pid-1',
        current_item: 'Login page',
        participants: [
          makeParticipant({ id: 'pid-1', name: 'Alice' }),
          makeParticipant({ id: 'pid-2', name: 'Bob' }),
        ],
      }),
    )
    expect(
      screen.getByRole('region', { name: 'Your vote' }),
    ).toBeInTheDocument()

    act(() => {
      deliver(lastSocket(), {
        type: 'error',
        reason: 'removed',
        message: 'gone',
      })
    })

    expect(
      screen.queryByRole('region', { name: 'Your vote' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: CODE })).toBeNull()
  })

  it('keeps a non-host in the room when someone else is removed', () => {
    renderRoomAs('pid-3')
    connect(
      makeRoom({
        host_id: 'pid-1',
        current_item: 'Login page',
        participants: [
          makeParticipant({ id: 'pid-1', name: 'Alice' }),
          makeParticipant({ id: 'pid-2', name: 'Bob' }),
          makeParticipant({ id: 'pid-3', name: 'Carol' }),
        ],
      }),
    )

    connect(
      makeRoom({
        host_id: 'pid-1',
        current_item: 'Login page',
        participants: [
          makeParticipant({ id: 'pid-1', name: 'Alice' }),
          makeParticipant({ id: 'pid-3', name: 'Carol' }),
        ],
      }),
    )

    expect(
      screen.getByRole('region', { name: 'Your vote' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/removed you/)).toBeNull()
  })

  it("votes with the room's deck, not the client-side default", async () => {
    const user = userEvent.setup()
    renderRoomAs('pid-2')
    connect(
      makeRoom({
        host_id: 'pid-1',
        deck: ['1', '2', '4', '8', '12', '16'],
        current_item: 'Login page',
        participants: [
          makeParticipant({ id: 'pid-1', name: 'Alice' }),
          makeParticipant({ id: 'pid-2', name: 'Bob' }),
        ],
      }),
    )

    const deck = within(screen.getByRole('region', { name: 'Your vote' }))
    expect(deck.getAllByRole('button').map((b) => b.textContent)).toEqual([
      '1',
      '2',
      '4',
      '8',
      '12',
      '16',
    ])
    for (const absent of ['13', '21']) {
      expect(deck.queryByRole('button', { name: absent })).toBeNull()
    }

    await user.click(deck.getByRole('button', { name: '12' }))
    expect(JSON.parse(lastSocket().sent.at(-1)!)).toEqual({
      type: 'cast_vote',
      card: '12',
    })
  })

  it('remembers a committed rename for the next visit', async () => {
    const user = userEvent.setup()
    renderRoomAs('pid-1')
    connect(
      makeRoom({
        host_id: 'pid-1',
        participants: [makeParticipant({ id: 'pid-1', name: 'Alice' })],
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Alice' }))
    const input = screen.getByRole('textbox', { name: 'Your display name' })
    await user.clear(input)
    await user.type(input, 'Alicia{Enter}')

    expect(JSON.parse(lastSocket().sent.at(-1)!)).toEqual({
      type: 'set_name',
      name: 'Alicia',
    })
    expect(loadRecall().name).toBe('Alicia')
  })

  it('remembers nothing for a rename committed after the socket drops', async () => {
    const user = userEvent.setup()
    renderRoomAs('pid-1')
    const ws = lastSocket()
    connect(
      makeRoom({
        host_id: 'pid-1',
        participants: [makeParticipant({ id: 'pid-1', name: 'Alice' })],
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Alice' }))
    const input = screen.getByRole('textbox', { name: 'Your display name' })
    await user.clear(input)
    await user.type(input, 'Alicia')

    act(() => {
      ws.onclose?.()
    })
    await user.keyboard('{Enter}')

    expect(ws.sent.map((f) => JSON.parse(f).type)).not.toContain('set_name')
    expect(loadRecall().name).toBe('')
  })

  it('remembers nothing for a rename the header discards', async () => {
    const user = userEvent.setup()
    renderRoomAs('pid-1')
    connect(
      makeRoom({
        host_id: 'pid-1',
        participants: [makeParticipant({ id: 'pid-1', name: 'Alice' })],
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Alice' }))
    const input = screen.getByRole('textbox', { name: 'Your display name' })
    await user.clear(input)
    await user.type(input, 'Alicia{Escape}')

    expect(lastSocket().sent.map((f) => JSON.parse(f).type)).not.toContain(
      'set_name',
    )
    expect(loadRecall().name).toBe('')
  })
})
