import type { Participant, ResultsView, RoomView } from '../types'

// A default RoomView for component tests; override any field per case.
export function makeRoom(overrides: Partial<RoomView> = {}): RoomView {
  return {
    code: 'ABCDEF',
    host_id: null,
    participants: [],
    current_item: null,
    host_voting: true,
    revealed: false,
    results: null,
    ...overrides,
  }
}

// A single participant; presence only (no card value pre-reveal, FR-10).
export function makeParticipant(
  overrides: Partial<Participant> = {},
): Participant {
  return { id: 'p1', name: 'Alice', has_voted: false, ...overrides }
}

// A revealed round's results (S9). Defaults to an empty, non-consensus round;
// override votes/average/consensus per case.
export function makeResults(overrides: Partial<ResultsView> = {}): ResultsView {
  return { votes: {}, average: null, consensus: false, ...overrides }
}
