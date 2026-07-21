import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Stage } from './Stage'

describe('Stage', () => {
  it('renders the task title from currentItem', () => {
    render(
      <Stage
        currentItem="Bulk re-validate cycle items"
        revealed={false}
        votesCast={2}
        totalVoters={3}
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'Bulk re-validate cycle items' }),
    ).toBeInTheDocument()
  })

  it('shows a host prompt when no topic is set', () => {
    render(
      <Stage currentItem={null} revealed={false} votesCast={0} totalVoters={0} isHost />,
    )
    expect(screen.getByText(/Set a topic to start/i)).toBeInTheDocument()
  })

  it('shows a waiting message to non-hosts when no topic is set', () => {
    render(
      <Stage currentItem={null} revealed={false} votesCast={0} totalVoters={0} />,
    )
    expect(screen.getByText(/Waiting for the host/i)).toBeInTheDocument()
  })

  it('shows the voting status and progress counter pre-reveal', () => {
    render(
      <Stage currentItem="X" revealed={false} votesCast={2} totalVoters={3} />,
    )
    expect(screen.getByText('Voting in progress')).toBeInTheDocument()
    expect(screen.getByText('2/3')).toBeInTheDocument()
  })

  it('shows the revealed status and hides the counter once revealed', () => {
    render(
      <Stage currentItem="X" revealed={true} votesCast={3} totalVoters={3} />,
    )
    expect(screen.getByText('Votes revealed')).toBeInTheDocument()
    expect(screen.queryByText('3/3')).not.toBeInTheDocument()
  })
})
