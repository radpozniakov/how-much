import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatsView } from './StatsView'
import { makeParticipant, makeResults } from '../../test/fixtures'

const alice = makeParticipant({ id: 'p1', name: 'Alice' })
const bob = makeParticipant({ id: 'p2', name: 'Bob' })

describe('StatsView', () => {
  it('re-presents the existing results — each vote, average, consensus — once revealed', () => {
    render(
      <StatsView
        participants={[alice, bob]}
        results={makeResults({
          votes: { p1: '5', p2: '5' },
          average: 5,
          consensus: true,
        })}
        revealed
        hostId={null}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument()
    expect(screen.getByText('Alice').closest('li')).toHaveTextContent('5')
    expect(screen.getByText('Bob').closest('li')).toHaveTextContent('5')
    expect(screen.getByText(/Average:/)).toBeInTheDocument()
    expect(screen.getByText('Consensus')).toBeInTheDocument()
  })

  it('shows a neutral waiting state pre-reveal and never leaks a value (FR-10)', () => {
    const { container } = render(
      <StatsView
        participants={[alice, bob]}
        results={makeResults({ votes: { p1: '5', p2: '8' } })}
        revealed={false}
        hostId={null}
      />,
    )

    expect(
      screen.queryByRole('heading', { name: 'Results' }),
    ).not.toBeInTheDocument()
    expect(container.textContent).not.toContain('5')
    expect(container.textContent).not.toContain('8')
  })

  it('falls back to the waiting state when revealed but results are still null', () => {
    render(
      <StatsView
        participants={[alice]}
        results={null}
        revealed
        hostId={null}
      />,
    )

    expect(
      screen.queryByRole('heading', { name: 'Results' }),
    ).not.toBeInTheDocument()
  })
})
