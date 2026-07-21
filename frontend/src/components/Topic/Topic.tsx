import { useState, type FC, type SyntheticEvent } from 'react'
import { MAX_TOPIC_LENGTH } from '../../lib/limits'

export interface TopicProps {
  // The round's current_item from the snapshot; null when unset.
  currentItem: string | null
  disabled?: boolean
  onSetTopic?: (topic: string | null) => void
}

// The host's inline topic editor (S9). Mounted only for the host — non-hosts
// read the current topic from the Stage (S14), so this component no longer has
// a read-only variant.
export const Topic: FC<TopicProps> = ({
  currentItem,
  disabled,
  onSetTopic,
}) => {
  const [draft, setDraft] = useState(currentItem ?? '')

  // Resync the draft when the canonical topic changes, using React's
  // adjust-state-during-render pattern (not an effect — which would trip
  // react-hooks/set-state-in-effect). This fires only on a currentItem
  // identity change — i.e. the host's own submit-echo coming back from the
  // server — so it never stomps the host's pre-submit typing.
  const [prevItem, setPrevItem] = useState(currentItem)
  if (currentItem !== prevItem) {
    setPrevItem(currentItem)
    setDraft(currentItem ?? '')
  }

  const handleSubmit = (e: SyntheticEvent) => {
    e.preventDefault()
    const trimmed = draft.trim()
    onSetTopic?.(trimmed === '' ? null : draft)
  }

  return (
    <section className="card">
      <h2>Topic</h2>
      <form className="topic__form" onSubmit={handleSubmit}>
        <input
          className="topic__input"
          type="text"
          aria-label="Topic"
          placeholder="Set a topic…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_TOPIC_LENGTH}
          disabled={disabled}
        />
        <button type="submit" disabled={disabled}>
          Set topic
        </button>
      </form>
    </section>
  )
}
