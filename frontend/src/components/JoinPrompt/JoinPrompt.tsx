import { useState } from 'react'
import type { FC, SyntheticEvent } from 'react'
import { joinRoom, requestErrorMessage } from '../../lib/api'
import { saveSession } from '../../lib/session'
import styles from './JoinPrompt.module.css'

export interface JoinPromptProps {
  code: string
  onJoined: (participantId: string) => void
}

// Deep-link / no-identity entry: prompt for a name, join over HTTP, then hand the
// new participant_id back so the room can connect.
export const JoinPrompt: FC<JoinPromptProps> = ({ code, onJoined }) => {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { participantId, room } = await joinRoom(code, name)
      saveSession(room.code, participantId)
      onJoined(participantId)
    } catch (err) {
      setError(requestErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <h1>Join room {code}</h1>
      <section className="card">
        <form className={styles.form} onSubmit={handleSubmit}>
          <label>
            Your name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoComplete="off"
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? 'Joining…' : 'Join'}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </form>
      </section>
    </main>
  )
}
