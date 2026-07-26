// The **default** estimation deck, client-side: the frontend mirror of
// `config.FIBONACCI_DECK` (D-8 / FR-9). Values are STRINGS to match the
// `cast_vote` frame (types.ts CastVoteFrame).
//
// Since V4 (D-48) this is no longer the deck the room votes with — `RoomView.deck`
// is, and `VoteDeck` renders that. This array's one remaining job is to tell a host
// creating a room what leaving the card-values field blank will give them, so it is
// a mirror of the *default* rather than of the only deck.
//
// Its old note — that drift between this array and the backend is the only route to
// `invalid_card` — no longer holds, because nothing votes from here. What replaces
// it is stronger: the deck is immutable and arrives in the snapshot, so a client can
// only click cards the room actually holds. `invalid_card` stays unreachable from
// the UI and remains the guard against hand-crafted frames.
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
