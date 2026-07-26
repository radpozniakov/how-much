import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { VoteDeck } from './VoteDeck'
import { FIBONACCI_DECK } from '../../lib/deck'

const card = (name: string) => screen.getByRole('button', { name })

// The deck is a prop since V4 (FR-22/D-48), so every case has to supply one.
// Most of these are about the deck's *behavior* rather than its values, so they
// use the default; the host-chosen cases below name their own.
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
    // A reveal then reset flips my has_voted true, then false.
    rerender(<VoteDeck {...props} hasVoted={true} />)
    rerender(<VoteDeck {...props} hasVoted={false} />)
    expect(card('5')).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps the highlight across a snapshot still showing has_voted:false', () => {
    // Guards the click->echo race: between the click and the returning snapshot
    // the snapshot still says has_voted:false — the highlight must NOT clear.
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

  // --- host-chosen decks (FR-22/D-48) ---------------------------------------

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
    // 13 and 21 are Fibonacci cards this room does not hold. Their absence is the
    // point: the component renders the room's deck, not a client-side constant.
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
    // The card travels as the string the deck holds — no numeric round-trip on
    // this side, which is what keeps consensus (a string comparison) exact.
    const onVote = vi.fn()
    render(
      <VoteDeck
        deck={['0', '0.5', '1', '2']}
        hasVoted={false}
        revealed={false}
        onVote={onVote}
      />,
    )
    fireEvent.click(card('0.5'))
    expect(onVote).toHaveBeenCalledWith('0.5')
  })
})
