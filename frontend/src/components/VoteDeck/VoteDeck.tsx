import { useEffect, useRef, useState } from 'react'
import type { FC } from 'react'
import { FIBONACCI_DECK } from '../../lib/deck'
import styles from './VoteDeck.module.css'

export interface VoteDeckProps {
  // The caller's own has_voted from the snapshot — presence, not the value.
  hasVoted: boolean
  revealed: boolean
  onVote: (card: string) => void
  // The socket is not live (connecting / reconnecting) — cards are unclickable.
  disabled?: boolean
}

export const VoteDeck: FC<VoteDeckProps> = ({
  hasVoted,
  revealed,
  onVote,
  disabled = false,
}) => {
  // The one piece of local state S8 introduces: the card THIS user last picked.
  // The pre-reveal snapshot exposes has_voted (FR-10) but never the value, so
  // the highlight cannot be derived from it — it is a local UI affordance, not
  // optimistic vote state (has_voted itself stays authoritative in the snapshot).
  const [selected, setSelected] = useState<string | null>(null)

  // Reconciliation (Option A): clear the local selection on a has_voted
  // true->false transition. Every reachable true->false is a genuine vote-drop
  // (host reset, host opting out of voting, or a disconnect that removes the
  // vote), so a stale highlight must go. A fresh pick is false->true, so this
  // never trips on the user's own click (no click->echo deselect race). If a
  // future backend change introduces a true->false that should NOT clear (e.g. a
  // vote retraction that is not a round reset), this must move to a snapshot
  // round-id `key` instead — gated by review (see doc/05-backlog.md S8 tripwire).
  const prevHasVoted = useRef(hasVoted)
  useEffect(() => {
    if (prevHasVoted.current && !hasVoted) setSelected(null)
    prevHasVoted.current = hasVoted
  }, [hasVoted])

  const locked = revealed || disabled

  return (
    <section className="card">
      <h2>Your vote</h2>
      <div className={styles.deck}>
        {FIBONACCI_DECK.map((card) => (
          <button
            key={card}
            type="button"
            className={`${styles.card} ${selected === card ? styles.selected : ''}`}
            aria-pressed={selected === card}
            disabled={locked}
            onClick={() => {
              setSelected(card)
              onVote(card)
            }}
          >
            {card}
          </button>
        ))}
      </div>
    </section>
  )
}
