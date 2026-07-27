import type { FC } from 'react'
import type { Participant, ResultsView } from '../../types'
import type { Column } from '../../lib/distribution'
import { distribution } from '../../lib/distribution'

export interface GraphViewProps {
  deck: string[]
  results: ResultsView
  participants: Participant[]
}

function names(column: Column): string {
  return column.voters.map((v) => v.name).join(', ')
}

export const GraphView: FC<GraphViewProps> = ({
  deck,
  results,
  participants,
}) => {
  const { columns, extremes, average } = distribution(
    deck,
    results.votes,
    participants,
    results.average,
    results.consensus,
  )

  // `average` is null exactly on the empty round, so it is also the zero-cast
  // signal — read off the distribution rather than counting the votes again.
  // `Results` still renders the round in full, dashes and `Average: —` alike.
  // The second clause restates that same fact for the type checker: a mark
  // exists only when the server sent a mean.
  const mean = results.average
  if (average === null || mean === null) return null

  // Evenly-spaced ticks: a true numeric axis crowds 1,2,3,5 into the first
  // sixth of the default deck. `t` is the fraction between the bracketing pair,
  // so the global position is the pair's index plus that fraction.
  const span = Math.max(columns.length - 1, 1)
  const at = (value: string) => columns.findIndex((c) => c.value === value)
  const position = ((at(average.lo) + average.t) / span) * 100

  const extreme = (value: string) =>
    extremes !== null &&
    (extremes.low.value === value || extremes.high.value === value)

  return (
    <section className="card graph">
      <h2 className="card__title">Graph</h2>

      <div className="graph__histogram" aria-hidden="true">
        {columns.map((column) => (
          <div
            key={column.value}
            className={
              extreme(column.value)
                ? 'graph__column graph__column--extreme'
                : 'graph__column'
            }
          >
            <div className="graph__stack">
              {column.voters.map((voter) => (
                <span
                  key={voter.id}
                  className="graph__unit"
                  title={voter.name}
                />
              ))}
            </div>
            <span className="graph__axis">{column.value}</span>
          </div>
        ))}
      </div>

      {extremes !== null && (
        <p className="graph__extremes">
          Lowest <span className="graph__number">{extremes.low.value}</span> —{' '}
          {names(extremes.low)} · Highest{' '}
          <span className="graph__number">{extremes.high.value}</span> —{' '}
          {names(extremes.high)}
        </p>
      )}

      <div className="graph__rail" aria-hidden="true">
        <span className="graph__mark" style={{ left: `${position}%` }} />
        {columns.map((column, i) => (
          <span
            key={column.value}
            className="graph__tick"
            style={{ left: `${(i / span) * 100}%` }}
          >
            {column.value}
          </span>
        ))}
      </div>
      <p className="graph__caption">
        Average <span className="graph__number">{mean.toFixed(1)}</span> —{' '}
        {average.exact ? (
          <>
            on <span className="graph__number">{average.lo}</span>
          </>
        ) : (
          <>
            between <span className="graph__number">{average.lo}</span> and{' '}
            <span className="graph__number">{average.hi}</span>
          </>
        )}
      </p>
    </section>
  )
}
