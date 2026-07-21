import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Room } from './Room'
import { clearSession, saveSession } from '../lib/session'
import { makeParticipant, makeResults, makeRoom } from '../test/fixtures'
import { MockWebSocket, deliver, lastSocket } from '../test/mockWebSocket'
import { FIBONACCI_DECK } from '../lib/deck'
import type { RoomView } from '../types'

const CODE = 'ABCDEF'

// Seed the per-tab identity so Room mounts ConnectedRoom (not the JoinPrompt).
function renderRoomAs(participantId: string) {
  saveSession(CODE, participantId)
  return render(<Room code={CODE} />, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[`/room/${CODE}`]}>{children}</MemoryRouter>
    ),
  })
}

// Push a server snapshot onto the live socket, making the room render.
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
    expect(screen.getByRole('button', { name: 'Reveal' })).toBeInTheDocument()
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
      screen.queryByRole('button', { name: 'Reveal' }),
    ).not.toBeInTheDocument()
  })

  it('hides the deck from an opted-out host (host_voting false)', () => {
    renderRoomAs('pid-1')
    connect(
      makeRoom({
        host_id: 'pid-1',
        host_voting: false,
        revealed: false,
        participants: [makeParticipant({ id: 'pid-1', name: 'Alice' })],
      }),
    )
    // No voting deck for the facilitator...
    expect(
      screen.queryByRole('heading', { name: 'Your vote' }),
    ).not.toBeInTheDocument()
    // ...but the host controls are still there.
    expect(screen.getByRole('button', { name: 'Reveal' })).toBeInTheDocument()
  })

  it('renders Results and no deck once revealed', () => {
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
    expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Your vote' }),
    ).not.toBeInTheDocument()
  })

  // The S8 tripwire, automated at the Room level: a PRE-REVEAL reset
  // (has_voted true->false while revealed stays false) is the one path where
  // VoteDeck's edge-detection, not a layout unmount, clears the local
  // highlight. The deck must stay mounted AND the highlight must clear.
  it('clears the vote highlight on a pre-reveal reset while keeping the deck mounted', async () => {
    const user = userEvent.setup()
    renderRoomAs('pid-2') // a non-host voter

    const bobUnvoted = makeParticipant({
      id: 'pid-2',
      name: 'Bob',
      has_voted: false,
    })
    const base = {
      host_id: 'pid-1' as const,
      revealed: false,
      participants: [
        makeParticipant({ id: 'pid-1', name: 'Alice' }),
        bobUnvoted,
      ],
    }
    connect(makeRoom(base))

    // Pick a card — the highlight is local (aria-pressed).
    const five = screen.getByRole('button', { name: '5' })
    await user.click(five)
    expect(five).toHaveAttribute('aria-pressed', 'true')

    // The vote registers (has_voted false->true): the highlight persists.
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

    // Host resets WITHOUT revealing (has_voted true->false, revealed stays
    // false): the highlight must clear and the deck must remain.
    connect(makeRoom(base))

    expect(
      screen.getByRole('heading', { name: 'Your vote' }),
    ).toBeInTheDocument()
    for (const card of FIBONACCI_DECK) {
      expect(screen.getByRole('button', { name: card })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
    }
  })
})
