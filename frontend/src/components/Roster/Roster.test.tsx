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
})
