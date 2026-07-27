import { useEffect, useRef, useState } from 'react'
import type { FC } from 'react'

export interface VoteDeckProps {
  deck: string[]
  hasVoted: boolean
  revealed: boolean
  onVote: (card: string) => void
  disabled?: boolean
}

export const VoteDeck: FC<VoteDeckProps> = ({
  deck,
  hasVoted,
  revealed,
  onVote,
  disabled = false,
}) => {
  const [selected, setSelected] = useState<string | null>(null)

  const prevHasVoted = useRef(hasVoted)
  useEffect(() => {
    if (prevHasVoted.current && !hasVoted) setSelected(null)
    prevHasVoted.current = hasVoted
  }, [hasVoted])

  const locked = revealed || disabled

  return (
    <section className="vote-bar" aria-label="Your vote">
      <div className="vote-deck">
        {deck.map((card) => (
          <button
            key={card}
            type="button"
            className={`vote-deck__card ${selected === card ? 'vote-deck__card--selected' : ''}`}
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
