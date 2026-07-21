import type { FC } from 'react'
import styles from './Topic.module.css'

export interface TopicProps {
  // The round's current_item from the snapshot; null when unset.
  currentItem: string | null
}

// Read-only in S8 — everyone sees the topic the host set. The set-topic input
// is host-only and arrives in S9.
export const Topic: FC<TopicProps> = ({ currentItem }) => (
  <section className="card">
    <h2>Topic</h2>
    {currentItem ? (
      <p className={styles.topic}>{currentItem}</p>
    ) : (
      <p className={styles.placeholder}>Waiting for the host to set a topic…</p>
    )}
  </section>
)
