import type { FC } from 'react'
import type { Participant, ResultsView } from '../../types'
import styles from './Results.module.css'

export interface ResultsProps {
  results: ResultsView
  participants: Participant[]
  hostId: string | null
}

export const Results: FC<ResultsProps> = ({
  results,
  participants,
  hostId,
}) => (
  <section className="card">
    <h2>Results</h2>
    <ul className={styles.results}>
      {participants.map((p) => (
        <li key={p.id}>
          <span>{p.name}</span>
          {/* host_id can be null during a transfer/empty window — never match undefined. */}
          {hostId !== null && p.id === hostId && (
            <span className={styles.badge}>host</span>
          )}
          {/* This view is only mounted once revealed, so votes is the sole
              source for the card value (FR-10) — no fallback to has_voted. */}
          <span className={styles.value}>{results.votes[p.id] ?? '—'}</span>
        </li>
      ))}
    </ul>
    <div className={styles.stats}>
      <span>
        <strong>Average:</strong>{' '}
        {results.average === null ? '—' : results.average.toFixed(1)}
      </span>
      {results.consensus && (
        <span className={`${styles.badge} ${styles.consensus}`}>Consensus</span>
      )}
    </div>
  </section>
)
