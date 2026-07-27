import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { VoteDeck } from './VoteDeck'
import { FIBONACCI_DECK } from '../../lib/deck'

const card = (name: string) => screen.getByRole('button', { name })

const DEFAULT_DECK = [...FIBONACCI_DECK]

describe('VoteDeck', () => {
  it('renders every card in the deck it is given', () => {
    render(
      <VoteDeck
        deck={DEFAULT_DECK}
        hasVoted={false}
        revealed={false}
        onVote={() => {}}
      />,
    )
    for (const value of DEFAULT_DECK) {
      expect(card(value)).toBeInTheDocument()
    }
  })

  it('votes and highlights the picked card', () => {
    const onVote = vi.fn()
    render(
      <VoteDeck
        deck={DEFAULT_DECK}
        hasVoted={false}
        revealed={false}
        onVote={onVote}
      />,
    )
    fireEvent.click(card('5'))
    expect(onVote).toHaveBeenCalledWith('5')
    expect(card('5')).toHaveAttribute('aria-pressed', 'true')
  })

  it('changes the vote on re-pick and moves the highlight (FR-11)', () => {
    const onVote = vi.fn()
    render(
      <VoteDeck
        deck={DEFAULT_DECK}
        hasVoted={false}
        revealed={false}
        onVote={onVote}
      />,
    )
    fireEvent.click(card('3'))
    fireEvent.click(card('8'))
    expect(onVote).toHaveBeenLastCalledWith('8')
    expect(card('3')).toHaveAttribute('aria-pressed', 'false')
    expect(card('8')).toHaveAttribute('aria-pressed', 'true')
  })

  it('disables every card once revealed', () => {
    render(
      <VoteDeck
        deck={DEFAULT_DECK}
        hasVoted={true}
        revealed={true}
        onVote={() => {}}
      />,
    )
    for (const value of DEFAULT_DECK) {
      expect(card(value)).toBeDisabled()
    }
  })

  it('disables every card when the socket is not live (disabled prop)', () => {
    render(
      <VoteDeck
        deck={DEFAULT_DECK}
        hasVoted={false}
        revealed={false}
        onVote={() => {}}
        disabled
      />,
    )
    for (const value of DEFAULT_DECK) {
      expect(card(value)).toBeDisabled()
    }
  })

  it('clears the highlight when has_voted goes true->false (host reset)', () => {
    const props = {
      deck: DEFAULT_DECK,
      revealed: false,
      onVote: () => {},
    }
    const { rerender } = render(<VoteDeck {...props} hasVoted={false} />)
    fireEvent.click(card('5'))
    rerender(<VoteDeck {...props} hasVoted={true} />)
    rerender(<VoteDeck {...props} hasVoted={false} />)
    expect(card('5')).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps the highlight across a snapshot still showing has_voted:false', () => {
    const props = {
      deck: DEFAULT_DECK,
      hasVoted: false,
      revealed: false,
      onVote: () => {},
    }
    const { rerender } = render(<VoteDeck {...props} />)
    fireEvent.click(card('2'))
    rerender(<VoteDeck {...props} />)
    expect(card('2')).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders a host-chosen deck and nothing from the default', () => {
    render(
      <VoteDeck
        deck={['1', '2', '4', '8', '12', '16']}
        hasVoted={false}
        revealed={false}
        onVote={() => {}}
      />,
    )
    for (const value of ['1', '2', '4', '8', '12', '16']) {
      expect(card(value)).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: '13' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '21' })).not.toBeInTheDocument()
  })

  it('renders the deck in the order given, never sorted', () => {
    render(
      <VoteDeck
        deck={['8', '5', '3']}
        hasVoted={false}
        revealed={false}
        onVote={() => {}}
      />,
    )
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      '8',
      '5',
      '3',
    ])
  })

  it('votes a decimal card verbatim', () => {
    const onVote = vi.fn()
    render(
      <VoteDeck
        deck={['1', '1.5', '2', '3']}
        hasVoted={false}
        revealed={false}
        onVote={onVote}
      />,
    )
    fireEvent.click(card('1.5'))
    expect(onVote).toHaveBeenCalledWith('1.5')
  })
})
