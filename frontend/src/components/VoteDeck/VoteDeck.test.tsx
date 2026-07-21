import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { VoteDeck } from './VoteDeck'
import { FIBONACCI_DECK } from '../../lib/deck'

const card = (name: string) => screen.getByRole('button', { name })

describe('VoteDeck', () => {
  it('renders every Fibonacci card', () => {
    render(<VoteDeck hasVoted={false} revealed={false} onVote={() => {}} />)
    for (const value of FIBONACCI_DECK) {
      expect(card(value)).toBeInTheDocument()
    }
  })

  it('votes and highlights the picked card', () => {
    const onVote = vi.fn()
    render(<VoteDeck hasVoted={false} revealed={false} onVote={onVote} />)
    fireEvent.click(card('5'))
    expect(onVote).toHaveBeenCalledWith('5')
    expect(card('5')).toHaveAttribute('aria-pressed', 'true')
  })

  it('changes the vote on re-pick and moves the highlight (FR-11)', () => {
    const onVote = vi.fn()
    render(<VoteDeck hasVoted={false} revealed={false} onVote={onVote} />)
    fireEvent.click(card('3'))
    fireEvent.click(card('8'))
    expect(onVote).toHaveBeenLastCalledWith('8')
    expect(card('3')).toHaveAttribute('aria-pressed', 'false')
    expect(card('8')).toHaveAttribute('aria-pressed', 'true')
  })

  it('disables every card once revealed', () => {
    render(<VoteDeck hasVoted={true} revealed={true} onVote={() => {}} />)
    for (const value of FIBONACCI_DECK) {
      expect(card(value)).toBeDisabled()
    }
  })

  it('disables every card when the socket is not live (disabled prop)', () => {
    render(
      <VoteDeck hasVoted={false} revealed={false} onVote={() => {}} disabled />,
    )
    for (const value of FIBONACCI_DECK) {
      expect(card(value)).toBeDisabled()
    }
  })

  it('clears the highlight when has_voted goes true->false (host reset)', () => {
    const { rerender } = render(
      <VoteDeck hasVoted={false} revealed={false} onVote={() => {}} />,
    )
    fireEvent.click(card('5'))
    // A reveal then reset flips my has_voted true, then false.
    rerender(<VoteDeck hasVoted={true} revealed={false} onVote={() => {}} />)
    rerender(<VoteDeck hasVoted={false} revealed={false} onVote={() => {}} />)
    expect(card('5')).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps the highlight across a snapshot still showing has_voted:false', () => {
    // Guards the click->echo race: between the click and the returning snapshot
    // the snapshot still says has_voted:false — the highlight must NOT clear.
    const { rerender } = render(
      <VoteDeck hasVoted={false} revealed={false} onVote={() => {}} />,
    )
    fireEvent.click(card('2'))
    rerender(<VoteDeck hasVoted={false} revealed={false} onVote={() => {}} />)
    expect(card('2')).toHaveAttribute('aria-pressed', 'true')
  })
})
