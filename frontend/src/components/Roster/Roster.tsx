import type { FC } from 'react'
import type { RoomView } from '../../types'

export interface RosterProps {
  room: RoomView
  me: string
}

export const Roster: FC<RosterProps> = ({ room, me }) => (
  <section className="card">
    <h2>Participants ({room.participants.length})</h2>
    <ul className="roster">
      {room.participants.map((p) => (
        <li key={p.id} className="roster__item">
          <span>{p.name}</span>
          {/* host_id can be null during a transfer/empty window — never match undefined. */}
          {room.host_id !== null && p.id === room.host_id && (
            <span className="roster__badge">host</span>
          )}
          {p.id === me && (
            <span className="roster__badge roster__badge--you">you</span>
          )}
          {/* Presence only — the card value is never shown pre-reveal (FR-10). */}
          {p.has_voted && (
            <span className="roster__badge roster__badge--voted">voted</span>
          )}
        </li>
      ))}
    </ul>
  </section>
)
