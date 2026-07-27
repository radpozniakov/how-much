import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GraphView } from './GraphView'
import { StatsView } from '../StatsView/StatsView'
import { FIBONACCI_DECK } from '../../lib/deck'
import { makeParticipant, makeResults } from '../../test/fixtures'

const DECK = [...FIBONACCI_DECK]

const alice = makeParticipant({ id: 'p1', name: 'Alice' })
const bob = makeParticipant({ id: 'p2', name: 'Bob' })
const carol = makeParticipant({ id: 'p3', name: 'Carol' })
const dave = makeParticipant({ id: 'p4', name: 'Dave' })

function graph(
  votes: Record<string, string>,
  average: number | null,
  consensus: boolean,
  participants = [alice, bob, carol],
) {
  return render(
    <GraphView
      deck={DECK}
      results={makeResults({ votes, average, consensus })}
      participants={participants}
    />,
  )
}

describe('GraphView', () => {
  it('renders all three widgets for a split round', () => {
    const { container } = graph({ p1: '2', p2: '5', p3: '13' }, 6.67, false)

    // Histogram: a column per deck value so gaps read as gaps, one unit per
    // vote, each unit naming its voter on hover.
    expect(container.querySelectorAll('.graph__column')).toHaveLength(
      DECK.length,
    )
    const units = container.querySelectorAll('.graph__unit')
    expect(units).toHaveLength(3)
    expect([...units].map((u) => u.getAttribute('title'))).toEqual([
      'Alice',
      'Bob',
      'Carol',
    ])

    // Min/max highlight, and the line that names the voters behind it.
    expect(container.querySelectorAll('.graph__column--extreme')).toHaveLength(
      2,
    )
    expect(container.querySelector('.graph__extremes')).toHaveTextContent(
      'Lowest 2 — Alice · Highest 13 — Carol',
    )

    // Average on the deck scale.
    expect(container.querySelector('.graph__caption')).toHaveTextContent(
      'Average 6.7 — between 5 and 8',
    )
    expect(container.querySelectorAll('.graph__tick')).toHaveLength(DECK.length)
  })

  it('renders nothing at all when no vote was cast', () => {
    const { container } = graph({}, null, false)

    expect(container).toBeEmptyDOMElement()
  })

  it('drops the extremes line on a consensus round', () => {
    const { container } = graph({ p1: '5', p2: '5' }, 5, true)

    expect(container.querySelector('.graph__extremes')).toBeNull()
    expect(container.querySelectorAll('.graph__column--extreme')).toHaveLength(
      0,
    )
    expect(container.querySelector('.graph__caption')).toHaveTextContent(
      'Average 5.0 — on 5',
    )
  })

  it('names every tied voter at both extremes', () => {
    const { container } = graph(
      { p1: '2', p2: '2', p3: '13', p4: '13' },
      7.5,
      false,
      [alice, bob, carol, dave],
    )

    expect(container.querySelector('.graph__extremes')).toHaveTextContent(
      'Lowest 2 — Alice, Bob · Highest 13 — Carol, Dave',
    )
  })

  it('says the average sits on a tick when it lands on one exactly', () => {
    const { container } = graph({ p1: '3', p2: '13' }, 8, false)

    expect(container.querySelector('.graph__caption')).toHaveTextContent(
      'Average 8.0 — on 8',
    )
  })

  // D-56/8: the graphic is decoration, the two text lines are the payload of
  // the slice, so only the former leaves the accessible tree.
  it('hides the graphic from assistive tech but not the two text lines', () => {
    const { container } = graph({ p1: '2', p2: '5', p3: '13' }, 6.67, false)

    expect(container.querySelector('.graph__histogram')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(
      container.querySelector('.graph__extremes')?.closest('[aria-hidden]'),
    ).toBeNull()
    expect(
      container.querySelector('.graph__caption')?.closest('[aria-hidden]'),
    ).toBeNull()
    expect(container.querySelectorAll('button, a, [tabindex]')).toHaveLength(0)
  })

  // D-56/14. Three assertions elsewhere are unscoped and would start matching
  // two elements the moment this card printed any of these strings:
  // StatsView's `getByText(/Average:/)` and `getByText('Consensus')`, and the
  // twelve e2e `card(page,'Results')` locators, which match a heading by
  // substring. Pinned here so a copy edit fails with a reason attached rather
  // than as a multi-match somewhere that never mentions the Graph card.
  it('prints none of the strings that would collide with unscoped assertions', () => {
    const { container } = graph({ p1: '2', p2: '5', p3: '13' }, 6.67, false)
    const card = container.querySelector('.graph')

    expect(card?.textContent).not.toContain('Average:')
    expect(card?.textContent).not.toContain('Consensus')
    for (const heading of container.querySelectorAll('h1, h2, h3, h4')) {
      expect(heading.textContent).not.toContain('Results')
    }
  })

  // Composed with `Results`, which renders the same average from the same
  // props, so the assertion is scoped to the Graph card: an average that
  // disagrees with the votes (a local mean of 1 and 8 is 4.5) fails this only
  // if the widget derives the number instead of reading it.
  it('reports the average it was given, not one derived from the votes', () => {
    const { container } = render(
      <StatsView
        deck={DECK}
        participants={[alice, bob]}
        results={makeResults({
          votes: { p1: '1', p2: '8' },
          average: 20,
          consensus: false,
        })}
        revealed
        hostId={null}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Graph' })).toBeInTheDocument()
    expect(container.querySelector('.graph__caption')).toHaveTextContent(
      'Average 20.0 — between 13 and 21',
    )
  })
})
