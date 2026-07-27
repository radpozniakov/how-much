import type { FC } from 'react'
import type { Participant, ResultsView } from '../../types'

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
    <ul className="results">
      {participants.map((p) => (
        <li key={p.id} className="results__item">
          <span>{p.name}</span>
          {hostId !== null && p.id === hostId && (
            <span className="results__badge">host</span>
          )}
          <span className="results__value">{results.votes[p.id] ?? '—'}</span>
        </li>
      ))}
    </ul>
    <div className="results__stats">
      <span>
        <strong>Average:</strong>{' '}
        {results.average === null ? '—' : results.average.toFixed(1)}
      </span>
      {results.consensus && (
        <span className="results__badge results__badge--consensus">
          Consensus
        </span>
      )}
    </div>
  </section>
)
