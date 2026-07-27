import type { FC } from 'react'
import type { Participant, ResultsView } from '../../types'
import { GraphView } from '../GraphView/GraphView'
import { Results } from '../Results/Results'

export interface StatsViewProps {
  deck: string[]
  participants: Participant[]
  results: ResultsView | null
  revealed: boolean
  hostId: string | null
}

export const StatsView: FC<StatsViewProps> = ({
  deck,
  participants,
  results,
  revealed,
  hostId,
}) =>
  revealed && results ? (
    <>
      <GraphView deck={deck} results={results} participants={participants} />
      <Results results={results} participants={participants} hostId={hostId} />
    </>
  ) : (
    <section className="stats-empty card" aria-label="Stats">
      <p className="stats-empty__hint">
        Vote values appear here once the host reveals the round.
      </p>
    </section>
  )
