import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ParticipantCard } from './ParticipantCard'

// The card component renders an <li>; wrap in a <ul> for valid DOM.
function renderCard(props: Parameters<typeof ParticipantCard>[0]) {
  return render(
    <ul>
      <ParticipantCard {...props} />
    </ul>,
  )
}

describe('ParticipantCard', () => {
  it('not-voted: dashed `?` face, no value', () => {
    renderCard({ name: 'Ivan', hasVoted: false, revealed: false })
    const item = screen.getByRole('listitem')
    expect(item).toHaveAttribute('data-state', 'not-voted')
    expect(item).toHaveTextContent('?')
    expect(item).toHaveTextContent('Ivan')
  })

  it('voted/hidden: no numeric value is shown pre-reveal (FR-10)', () => {
    renderCard({ name: 'Julia', hasVoted: true, revealed: false, value: '8' })
    const item = screen.getByRole('listitem')
    expect(item).toHaveAttribute('data-state', 'voted')
    expect(item).not.toHaveTextContent('8')
    expect(item).not.toHaveTextContent('?')
  })

  it('voted/revealed: shows the numeric value', () => {
    renderCard({ name: 'Sergiy', hasVoted: true, revealed: true, value: '16' })
    const item = screen.getByRole('listitem')
    expect(item).toHaveAttribute('data-state', 'revealed')
    expect(item).toHaveTextContent('16')
  })

  it('revealed abstainer (no value) falls back to the not-voted glyph', () => {
    renderCard({ name: 'Roman', hasVoted: false, revealed: true })
    const item = screen.getByRole('listitem')
    expect(item).toHaveAttribute('data-state', 'not-voted')
    expect(item).toHaveTextContent('?')
  })
})
