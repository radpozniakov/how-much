import { useState, type FC, type SyntheticEvent } from 'react'
import { MAX_TOPIC_LENGTH } from '../../lib/limits'
import styles from './Topic.module.css'

export interface TopicProps {
  // The round's current_item from the snapshot; null when unset.
  currentItem: string | null
  isHost?: boolean
  disabled?: boolean
  onSetTopic?: (topic: string | null) => void
}

// Read-only for everyone except the host. The host gets an inline editor
// (S9); non-hosts still just see the topic the host set (S8 behavior,
// unchanged).
export const Topic: FC<TopicProps> = ({
  currentItem,
  isHost,
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

  if (!isHost) {
    return (
      <section className="card">
        <h2>Topic</h2>
        {currentItem ? (
          <p className={styles.topic}>{currentItem}</p>
        ) : (
          <p className={styles.placeholder}>
            Waiting for the host to set a topic…
          </p>
        )}
      </section>
    )
  }

  const handleSubmit = (e: SyntheticEvent) => {
    e.preventDefault()
    const trimmed = draft.trim()
    onSetTopic?.(trimmed === '' ? null : draft)
  }

  return (
    <section className="card">
      <h2>Topic</h2>
      <form className={styles.form} onSubmit={handleSubmit}>
        <input
          className={styles.input}
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
