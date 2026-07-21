import { useState } from 'react'
import type { FC, SyntheticEvent } from 'react'
import { joinRoom, requestErrorMessage } from '../../lib/api'
import { navigate } from '../../lib/router'
import { saveSession } from '../../lib/session'
import styles from './JoinRoomForm.module.css'

export const JoinRoomForm: FC = () => {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { participantId, room } = await joinRoom(code, name)
      saveSession(room.code, participantId)
      navigate(`/room/${room.code}`)
    } catch (err) {
      setError(requestErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>Join a room</h2>
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
        <label>
          Room code
          <input
            className={styles.code}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
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
  )
}
