import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
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
        // An opted-out host is absent from the card grid (FR-17); the roster
        // must list them regardless, so assert with host_voting off.
        host_voting: false,
        participants: [
          makeParticipant({ id: 'pid-1', name: 'Alice' }),
          makeParticipant({ id: 'pid-2', name: 'Bob' }),
        ],
      }),
    )

    await user.click(screen.getByRole('button', { name: 'Room participants' }))

    // Scoped to the panel: ParticipantGrid is also a list of participants, so an
    // unscoped listitem query would match its cards too. Named, so a future
    // fieldset or grouped control on this page cannot silently capture it.
    const panel = screen.getByRole('group', { name: /participants/i })
    const rows = within(panel).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Alice')
    expect(rows[1]).toHaveTextContent('Bob')
    // getByText, not toHaveTextContent: the latter matches substrings, so the
    // negative assertion would wrongly pass for any name containing "me".
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
    // No voting deck for the facilitator...
    expect(
      screen.queryByRole('region', { name: 'Your vote' }),
    ).not.toBeInTheDocument()
    // ...but the host reveal control is still there (Bob can vote).
    expect(
      screen.getByRole('button', { name: 'Reveal cards' }),
    ).toBeInTheDocument()
  })

  it('disables voting and revealing until an estimation subject is set', () => {
    renderRoomAs('pid-2') // a non-host voter
    connect(
      makeRoom({
        host_id: 'pid-1',
        current_item: null, // no subject yet
        revealed: false,
        participants: [
          makeParticipant({ id: 'pid-1', name: 'Alice' }),
          makeParticipant({ id: 'pid-2', name: 'Bob' }),
        ],
      }),
    )
    // Every vote card is inactive...
    for (const card of FIBONACCI_DECK) {
      expect(screen.getByRole('button', { name: card })).toBeDisabled()
    }
    // ...and the stage announces the waiting state.
    expect(
      screen.getByText('Waiting for the estimation subject'),
    ).toBeInTheDocument()
  })

  it('disables the reveal control until an estimation subject is set', () => {
    renderRoomAs('pid-1') // the host
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
    renderRoomAs('pid-1') // the host
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
    renderRoomAs('pid-1') // the host
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

    // Cards view (default): the deck stays as the permanent bottom row (spec
    // §Voting cards) but is locked — every card disabled post-reveal. Results
    // are NOT rendered here; they live in the stats view now (S18).
    expect(
      screen.getByRole('region', { name: 'Your vote' }),
    ).toBeInTheDocument()
    for (const card of FIBONACCI_DECK) {
      expect(screen.getByRole('button', { name: card })).toBeDisabled()
    }
    expect(
      screen.queryByRole('heading', { name: 'Results' }),
    ).not.toBeInTheDocument()

    // Switching to the stats view surfaces the Results dashboard (S18).
    await user.click(screen.getByRole('tab', { name: 'Graph view' }))
    expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument()
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
      // A subject is set so voting is enabled (empty subject locks the deck).
      current_item: 'Estimate the login page',
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
      screen.getByRole('region', { name: 'Your vote' }),
    ).toBeInTheDocument()
    for (const card of FIBONACCI_DECK) {
      expect(screen.getByRole('button', { name: card })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
    }
  })
})
