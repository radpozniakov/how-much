import type { FC } from 'react'
import { CheckIcon } from '../icons'

// The three color-free card states (spec §Participant card). Distinguished by
// border style + inner content ONLY — never color (spec §Notes for regeneration).
export type CardState = 'not-voted' | 'voted' | 'revealed'

export interface ParticipantCardProps {
  name: string
  hasVoted: boolean
  revealed: boolean
  // The revealed numeric card value, present only for a revealed round (FR-10).
  value?: string
}

// Derive the visible state. Pre-reveal the value is never exposed (FR-10): a
// voter shows a checkmark, not the number. Post-reveal, a cast card shows its
// value; an abstainer falls back to the not-voted glyph.
function resolveState(
  hasVoted: boolean,
  revealed: boolean,
  value?: string,
): CardState {
  if (revealed && value !== undefined) return 'revealed'
  if (hasVoted) return 'voted'
  return 'not-voted'
}

// A portrait card: a face (dashed `?` / solid checkmark / solid numeric value)
// with the participant name bold below (spec §Participant card).
export const ParticipantCard: FC<ParticipantCardProps> = ({
  name,
  hasVoted,
  revealed,
  value,
}) => {
  const state = resolveState(hasVoted, revealed, value)

  return (
    <li
      className={`participant-card participant-card--${state}`}
      data-state={state}
    >
      <div className="participant-card__face" aria-hidden="true">
        {state === 'not-voted' && (
          <span className="participant-card__mark">?</span>
        )}
        {state === 'voted' && <CheckIcon />}
        {state === 'revealed' && (
          <span className="participant-card__value">{value}</span>
        )}
      </div>
      <span className="participant-card__name">{name}</span>
    </li>
  )
}
