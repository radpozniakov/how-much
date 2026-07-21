// The topic length bound, client-side. This is the single frontend mirror of the
// backend source of truth `config.MAX_TOPIC_LENGTH` (backend/app/config.py) — the
// same value the `set_item` frame validator enforces in messages.py. The host
// topic input `maxLength`s to this, so an over-long topic can't be produced and
// `set_item` can never be rejected `bad_request` (parallels lib/deck.ts making
// `invalid_card` unreachable from the fixed deck).
export const MAX_TOPIC_LENGTH = 200
