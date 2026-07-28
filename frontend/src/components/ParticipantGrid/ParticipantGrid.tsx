import type { FC } from 'react'
import type { Participant, ResultsView } from '../../types'
import { ParticipantCard } from '../ParticipantCard/ParticipantCard'

export interface ParticipantGridProps {
  participants: Participant[]
  revealed: boolean
  results: ResultsView | null
}

export const ParticipantGrid: FC<ParticipantGridProps> = ({
  participants,
  revealed,
  results,
}) => (
  <ul className="participant-grid" aria-label="Participants">
    {participants.map((p) => {
      const value = revealed ? results?.votes[p.id] : undefined
      return (
        <ParticipantCard
          key={p.id}
          name={p.name}
          hasVoted={p.has_voted}
          revealed={revealed}
          {...(value === undefined ? {} : { value })}
        />
      )
    })}
  </ul>
)
