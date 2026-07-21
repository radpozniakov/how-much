import type { FC } from 'react'

export interface StageProps {
  // The round's current_item from the snapshot; null when unset.
  currentItem: string | null
  // Whether the round has been revealed — drives the status line.
  revealed: boolean
  // Votes cast among eligible voters, and the eligible-voter total (FR-17).
  votesCast: number
  totalVoters: number
  // Tailors the empty-state copy: the host is prompted to set a topic.
  isHost?: boolean
}

// The centered task stage (spec §Stage): a white bordered card, max-width 900px,
// showing the task title (JetBrains Mono, multi-line), a status line, and a
// vote-progress counter. Display only — the host edits the topic elsewhere.
export const Stage: FC<StageProps> = ({
  currentItem,
  revealed,
  votesCast,
  totalVoters,
  isHost = false,
}) => (
  <section className="stage" aria-label="Current task">
    {currentItem ? (
      <h2 className="stage__title">{currentItem}</h2>
    ) : (
      <p className="stage__title stage__title--empty">
        {isHost
          ? 'Set a topic to start the round…'
          : 'Waiting for the host to set a topic…'}
      </p>
    )}

    <div className="stage__meta">
      <span className="stage__status">
        {revealed ? 'Votes revealed' : 'Voting in progress'}
      </span>
      {!revealed && (
        <span className="stage__counter counter">
          {votesCast}/{totalVoters}
        </span>
      )}
    </div>
  </section>
)
