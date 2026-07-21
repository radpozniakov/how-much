import type { FC } from 'react'
import type { Participant, ResultsView } from '../../types'
import { Results } from '../Results/Results'

export interface StatsViewProps {
  participants: Participant[]
  // The revealed round's results; null pre-reveal so no value is exposed early
  // (FR-10).
  results: ResultsView | null
  revealed: boolean
  hostId: string | null
}

// The stats view swapped in by the header segment control (S18). It re-presents
// the EXISTING results only — each vote, average, consensus (DN-B) — by reusing
// the Results dashboard; it adds no new analytics (distribution charts stay out
// of scope, FR-16 / D-16). Pre-reveal there is nothing to show without leaking a
// value (FR-10), so it renders a neutral waiting state with no "Results" heading.
export const StatsView: FC<StatsViewProps> = ({
  participants,
  results,
  revealed,
  hostId,
}) =>
  revealed && results ? (
    <Results results={results} participants={participants} hostId={hostId} />
  ) : (
    <section className="stats-empty card" aria-label="Stats">
      <p className="stats-empty__hint">
        Vote values appear here once the host reveals the round.
      </p>
    </section>
  )
