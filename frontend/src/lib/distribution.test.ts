import { describe, expect, it } from 'vitest'
import { distribution } from './distribution'
import { FIBONACCI_DECK } from './deck'
import { makeParticipant } from '../test/fixtures'
import type { Participant } from '../types'

const DECK = [...FIBONACCI_DECK]

function people(...ids: string[]): Participant[] {
  return ids.map((id) => makeParticipant({ id, name: id.toUpperCase() }))
}

function namesAt(
  columns: { value: string; voters: Participant[] }[],
  value: string,
): string[] {
  return columns.find((c) => c.value === value)?.voters.map((v) => v.name) ?? []
}

describe('distribution', () => {
  // The two falsifiers below are the point of this module: they pass only for
  // an implementation that treats `average` and `consensus` as server facts.
  it('brackets the server average, never a mean derived from the votes', () => {
    const result = distribution(
      DECK,
      { a: '1', b: '8' },
      people('a', 'b'),
      20,
      false,
    )

    // A local mean of 1 and 8 is 4.5, which would bracket to 3/5.
    expect(result.average).toEqual({
      lo: '13',
      hi: '21',
      exact: false,
      t: 0.875,
    })
  })

  it('suppresses extremes on the server consensus flag, not on the votes', () => {
    const result = distribution(
      DECK,
      { a: '1', b: '8' },
      people('a', 'b'),
      4.5,
      true,
    )

    expect(result.extremes).toBeNull()
  })

  it('gives every deck value a column, so gaps read as gaps', () => {
    const result = distribution(
      DECK,
      { a: '3', b: '3' },
      people('a', 'b'),
      3,
      true,
    )

    expect(result.columns.map((c) => c.value)).toEqual(DECK)
    expect(result.columns.filter((c) => c.voters.length > 0)).toHaveLength(1)
  })

  it('sorts columns numerically even when the deck was entered out of order', () => {
    const result = distribution(
      ['8', '3', '1'],
      { a: '8' },
      people('a'),
      8,
      true,
    )

    expect(result.columns.map((c) => c.value)).toEqual(['1', '3', '8'])
  })

  // `parse_deck` normalizes and rejects duplicates, so '1' and '1.0' collapse
  // to one card and this deck cannot reach a real room (D-48). It is here to
  // pin the matching rule anyway: on any deck the server can build, exact and
  // numeric matching agree, so nothing reachable would catch the swap.
  it('matches votes to columns by exact string, not by numeric value', () => {
    const result = distribution(
      ['1', '1.0', '2'],
      { a: '1.0' },
      people('a'),
      1,
      true,
    )

    expect(namesAt(result.columns, '1')).toEqual([])
    expect(namesAt(result.columns, '1.0')).toEqual(['A'])
  })

  it('keeps participant order inside a column', () => {
    const result = distribution(
      DECK,
      { c: '5', a: '5', b: '5' },
      people('a', 'b', 'c'),
      5,
      true,
    )

    expect(namesAt(result.columns, '5')).toEqual(['A', 'B', 'C'])
  })

  it('carries every tied voter at both extremes', () => {
    const result = distribution(
      DECK,
      { a: '2', b: '2', c: '13', d: '13', e: '5' },
      people('a', 'b', 'c', 'd', 'e'),
      7,
      false,
    )

    expect(result.extremes?.low.value).toBe('2')
    expect(result.extremes?.low.voters.map((v) => v.name)).toEqual(['A', 'B'])
    expect(result.extremes?.high.value).toBe('13')
    expect(result.extremes?.high.voters.map((v) => v.name)).toEqual(['C', 'D'])
  })

  it('carries the largest tie a full room allows', () => {
    // Capacity is 30 and a 30-way tie would be consensus, so 29 at one extreme
    // is the widest an extreme can get while extremes still exist at all.
    const ids = Array.from({ length: 30 }, (_, i) => `p${i}`)
    const votes = Object.fromEntries(
      ids.map((id, i) => [id, i === 29 ? '21' : '1']),
    )

    const result = distribution(DECK, votes, people(...ids), 1.67, false)

    expect(result.extremes?.low.voters).toHaveLength(29)
    expect(result.extremes?.high.voters.map((v) => v.id)).toEqual(['p29'])
  })

  it('spreads a full 30-vote room across its columns', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `p${i}`)
    const votes = Object.fromEntries(
      ids.map((id, i) => [id, DECK[i % DECK.length]]),
    )

    const result = distribution(DECK, votes, people(...ids), 7.6, false)

    const counted = result.columns.reduce((n, c) => n + c.voters.length, 0)
    expect(counted).toBe(30)
    expect(result.extremes?.low.value).toBe('1')
    expect(result.extremes?.high.value).toBe('21')
  })

  it('suppresses extremes for a single vote, which the server calls consensus', () => {
    const result = distribution(DECK, { a: '5' }, people('a'), 5, true)

    expect(result.extremes).toBeNull()
    expect(result.average).toEqual({ lo: '5', hi: '5', exact: true, t: 0 })
  })

  it('marks a mean that lands on a deck tick as exact, without dividing', () => {
    const result = distribution(
      DECK,
      { a: '21', b: '21' },
      people('a', 'b'),
      21,
      true,
    )

    expect(result.average).toEqual({ lo: '21', hi: '21', exact: true, t: 0 })
  })

  it('brackets a mean between decimal deck ticks', () => {
    const result = distribution(
      ['0.5', '1', '1.5', '2'],
      { a: '1', b: '1.5' },
      people('a', 'b'),
      1.25,
      false,
    )

    expect(result.columns.map((c) => c.value)).toEqual(['0.5', '1', '1.5', '2'])
    expect(result.average).toEqual({ lo: '1', hi: '1.5', exact: false, t: 0.5 })
  })

  it('returns empty columns and no marks for a round with no votes', () => {
    const result = distribution(DECK, {}, people('a', 'b'), null, false)

    expect(result.columns.map((c) => c.value)).toEqual(DECK)
    expect(result.columns.every((c) => c.voters.length === 0)).toBe(true)
    expect(result.extremes).toBeNull()
    expect(result.average).toBeNull()
  })
})
