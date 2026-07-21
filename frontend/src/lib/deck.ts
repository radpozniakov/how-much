// The estimation deck, client-side. This is the single frontend mirror of the
// backend source of truth `config.FIBONACCI_DECK` (D-8 / FR-9): Fibonacci
// numbers only, no `?`/coffee/40/100. Values are STRINGS to match the
// `cast_vote` frame (types.ts CastVoteFrame) — the card travels as a string and
// is validated against this same set server-side. Drift between this array and
// the backend deck is the only way a cast can ever be rejected `invalid_card`.
export const FIBONACCI_DECK = [
  '0',
  '1',
  '2',
  '3',
  '5',
  '8',
  '13',
  '21',
] as const
