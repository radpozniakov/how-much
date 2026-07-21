import type { RoomView } from '../types'

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
