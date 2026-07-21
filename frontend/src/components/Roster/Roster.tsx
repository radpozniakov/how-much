import type { FC } from 'react'
import type { RoomView } from '../../types'
import styles from './Roster.module.css'

export interface RosterProps {
  room: RoomView
  me: string
}

export const Roster: FC<RosterProps> = ({ room, me }) => (
  <section className="card">
    <h2>Participants ({room.participants.length})</h2>
    <ul className={styles.roster}>
      {room.participants.map((p) => (
        <li key={p.id}>
          <span>{p.name}</span>
          {/* host_id can be null during a transfer/empty window — never match undefined. */}
          {room.host_id !== null && p.id === room.host_id && (
            <span className={styles.badge}>host</span>
          )}
          {p.id === me && (
            <span className={`${styles.badge} ${styles.you}`}>you</span>
          )}
          {/* Presence only — the card value is never shown pre-reveal (FR-10). */}
          {p.has_voted && (
            <span className={`${styles.badge} ${styles.voted}`}>voted</span>
          )}
        </li>
      ))}
    </ul>
  </section>
)
