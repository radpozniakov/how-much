import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ParticipantGrid } from './ParticipantGrid'
import { makeParticipant, makeResults } from '../../test/fixtures'

describe('ParticipantGrid', () => {
  it('renders one card per participant', () => {
    render(
      <ParticipantGrid
        participants={[
          makeParticipant({ id: 'a', name: 'Ann' }),
          makeParticipant({ id: 'b', name: 'Ben', has_voted: true }),
        ]}
        revealed={false}
        results={null}
      />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Ann').closest('li')).toHaveAttribute(
      'data-state',
      'not-voted',
    )
    expect(screen.getByText('Ben').closest('li')).toHaveAttribute(
      'data-state',
      'voted',
    )
  })

  it('shows each card value once revealed', () => {
    render(
      <ParticipantGrid
        participants={[
          makeParticipant({ id: 'a', name: 'Ann', has_voted: true }),
          makeParticipant({ id: 'b', name: 'Ben', has_voted: true }),
        ]}
        revealed={true}
        results={makeResults({ votes: { a: '5', b: '8' } })}
      />,
    )
    expect(screen.getByText('Ann').closest('li')).toHaveTextContent('5')
    expect(screen.getByText('Ben').closest('li')).toHaveTextContent('8')
  })
})
