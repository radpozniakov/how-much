import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Results } from './Results'
import { makeParticipant, makeResults } from '../../test/fixtures'

const alice = makeParticipant({ id: 'p1', name: 'Alice' })
const bob = makeParticipant({ id: 'p2', name: 'Bob' })
const carol = makeParticipant({ id: 'p3', name: 'Carol' })

describe('Results', () => {
  it("renders each voter's card by name", () => {
    render(
      <Results
        results={makeResults({ votes: { p1: '5', p2: '8' } })}
        participants={[alice, bob]}
        hostId={null}
      />,
    )
    expect(screen.getByText('Alice').closest('li')).toHaveTextContent('5')
    expect(screen.getByText('Bob').closest('li')).toHaveTextContent('8')
  })

  it('renders an em dash for a participant absent from results.votes', () => {
    render(
      <Results
        results={makeResults({ votes: { p1: '5' } })}
        participants={[alice, carol]}
        hostId={null}
      />,
    )
    const carolRow = screen.getByText('Carol').closest('li')
    expect(carolRow).toHaveTextContent('—')
    for (const value of ['0', '1', '2', '3', '5', '8', '13', '21']) {
      expect(carolRow).not.toHaveTextContent(value)
    }
  })

  it('renders the average rounded to one decimal place', () => {
    render(
      <Results
        results={makeResults({ average: 6.5 })}
        participants={[alice]}
        hostId={null}
      />,
    )
    expect(screen.getByText(/6\.5/)).toBeInTheDocument()
  })

  it('renders an em dash for the average when it is null', () => {
    render(
      <Results
        // Give Alice a vote so the only remaining em dash is the average's.
        results={makeResults({ votes: { p1: '5' }, average: null })}
        participants={[alice]}
        hostId={null}
      />,
    )
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows the consensus badge only when results.consensus is true', () => {
    const { rerender } = render(
      <Results
        results={makeResults({ consensus: true })}
        participants={[alice]}
        hostId={null}
      />,
    )
    expect(screen.getByText('Consensus')).toBeInTheDocument()

    rerender(
      <Results
        results={makeResults({ consensus: false })}
        participants={[alice]}
        hostId={null}
      />,
    )
    expect(screen.queryByText('Consensus')).not.toBeInTheDocument()
  })

  it('marks the host with a host badge', () => {
    render(
      <Results
        results={makeResults()}
        participants={[alice, bob]}
        hostId="p1"
      />,
    )
    expect(screen.getByText('Alice').closest('li')).toHaveTextContent('host')
    expect(screen.getByText('Bob').closest('li')).not.toHaveTextContent('host')
  })

  it('handles the zero-votes boundary: every card is a dash, average is a dash, no consensus badge', () => {
    render(
      <Results
        results={makeResults({ votes: {}, average: null, consensus: false })}
        participants={[alice, bob]}
        hostId={null}
      />,
    )
    expect(screen.getByText('Alice').closest('li')).toHaveTextContent('—')
    expect(screen.getByText('Bob').closest('li')).toHaveTextContent('—')
    for (const value of ['0', '1', '2', '3', '5', '8', '13', '21']) {
      expect(screen.queryByText(value)).not.toBeInTheDocument()
    }
    expect(screen.queryByText('Consensus')).not.toBeInTheDocument()
  })
})
