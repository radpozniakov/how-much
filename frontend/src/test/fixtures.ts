import { FIBONACCI_DECK } from '../lib/deck'
import type { Participant, ResultsView, RoomView } from '../types'

export function makeRoom(overrides: Partial<RoomView> = {}): RoomView {
  return {
    code: 'ABCDEF',
    deck: [...FIBONACCI_DECK],
    host_id: null,
    participants: [],
    current_item: null,
    host_voting: true,
    revealed: false,
    results: null,
    ...overrides,
  }
}

export function makeParticipant(
  overrides: Partial<Participant> = {},
): Participant {
  return { id: 'p1', name: 'Alice', has_voted: false, ...overrides }
}

export function makeResults(overrides: Partial<ResultsView> = {}): ResultsView {
  return { votes: {}, average: null, consensus: false, ...overrides }
}
