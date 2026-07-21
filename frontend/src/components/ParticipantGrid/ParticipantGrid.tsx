import type { FC } from 'react'
import type { Participant, ResultsView } from '../../types'
import { ParticipantCard } from '../ParticipantCard/ParticipantCard'

export interface ParticipantGridProps {
  participants: Participant[]
  revealed: boolean
  // The revealed round's results; null pre-reveal so no value is ever exposed
  // early (FR-10). Card values are read from results.votes once revealed.
  results: ResultsView | null
}

// The responsive participant grid (spec §Participant cards grid): one card per
// participant, directly under the stage and matching its width footprint. The
// parent hides this when the stats view (S18) is active.
export const ParticipantGrid: FC<ParticipantGridProps> = ({
  participants,
  revealed,
  results,
}) => (
  <ul className="participant-grid" aria-label="Participants">
    {participants.map((p) => (
      <ParticipantCard
        key={p.id}
        name={p.name}
        hasVoted={p.has_voted}
        revealed={revealed}
        value={revealed ? results?.votes[p.id] : undefined}
      />
    ))}
  </ul>
)
