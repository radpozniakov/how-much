import type { FC } from 'react'
import { CheckIcon } from '../icons'

export type CardState = 'not-voted' | 'voted' | 'revealed'

export interface ParticipantCardProps {
  name: string
  hasVoted: boolean
  revealed: boolean
  value?: string
}

function resolveState(
  hasVoted: boolean,
  revealed: boolean,
  value?: string,
): CardState {
  if (revealed && value !== undefined) return 'revealed'
  if (hasVoted) return 'voted'
  return 'not-voted'
}

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
