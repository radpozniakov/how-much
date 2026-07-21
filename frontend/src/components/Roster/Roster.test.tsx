import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Roster } from './Roster'
import { makeRoom } from '../../test/fixtures'

const withPeople = makeRoom({
  host_id: 'pid-1',
  participants: [
    { id: 'pid-1', name: 'Alice', has_voted: false },
    { id: 'pid-2', name: 'Bob', has_voted: false },
  ],
})

describe('Roster', () => {
  it('lists every participant', () => {
    render(<Roster room={withPeople} me="pid-2" />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('marks the host and the current user', () => {
    render(<Roster room={withPeople} me="pid-2" />)
    expect(screen.getByText('host')).toBeInTheDocument()
    expect(screen.getByText('you')).toBeInTheDocument()
  })

  it('shows no host badge when host_id is null', () => {
    render(<Roster room={{ ...withPeople, host_id: null }} me="pid-2" />)
    expect(screen.queryByText('host')).not.toBeInTheDocument()
  })

  it('marks who has voted as presence only, never a card value (FR-10)', () => {
    const voting = makeRoom({
      host_id: 'pid-1',
      participants: [
        { id: 'pid-1', name: 'Alice', has_voted: true },
        { id: 'pid-2', name: 'Bob', has_voted: false },
      ],
    })
    render(<Roster room={voting} me="pid-2" />)
    // Exactly one 'voted' badge (Alice); Bob has none.
    expect(screen.getAllByText('voted')).toHaveLength(1)
    // No card value is rendered anywhere in the roster.
    for (const value of ['0', '1', '2', '3', '5', '8', '13', '21']) {
      expect(screen.queryByText(value)).not.toBeInTheDocument()
    }
  })
})
