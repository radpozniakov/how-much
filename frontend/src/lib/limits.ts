// The topic length bound, client-side. This is the single frontend mirror of the
// backend source of truth `config.MAX_TOPIC_LENGTH` (backend/app/config.py) — the
// same value the `set_item` frame validator enforces in messages.py. The host
// topic input `maxLength`s to this, so an over-long topic can't be produced and
// `set_item` can never be rejected `bad_request` (parallels lib/deck.ts making
// `invalid_card` unreachable from the fixed deck).
export const MAX_TOPIC_LENGTH = 200

// The card-values input bound, client-side. Mirrors the backend source of truth
// `config.MAX_DECK_INPUT_LENGTH` — the bound `parse_deck` applies to the raw
// comma-separated string before splitting it.
//
// Unlike the two bounds above, this one does NOT make server rejection
// unreachable, and cannot: the deck's real rules (numeric, non-negative, no
// duplicates, 2-15 cards) are richer than any input attribute can express, so
// CreateRoomForm surfaces the 422 inline. This just stops the one failure a
// `maxLength` can genuinely prevent.
export const MAX_DECK_INPUT_LENGTH = 200

// The display-name length bound, client-side. Mirrors the backend source of truth
// `config.MAX_DISPLAY_NAME_LENGTH` (backend/app/config.py) — the same value the
// `set_name` frame validator enforces in messages.py. The rename input and the
// JoinPrompt `maxLength` to this, so an over-long name can't be produced and
// `set_name` can never be rejected `bad_request` (parallels MAX_TOPIC_LENGTH).
export const MAX_DISPLAY_NAME_LENGTH = 40
