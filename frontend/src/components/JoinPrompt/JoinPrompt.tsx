import { useState } from 'react'
import type { FC, SyntheticEvent } from 'react'
import { useNavigate } from 'react-router'
import { joinRoom, requestErrorMessage } from '../../lib/api'
import { MAX_DISPLAY_NAME_LENGTH } from '../../lib/limits'
import { saveSession } from '../../lib/session'
import { HomeIcon } from '../icons'

export interface JoinPromptProps {
  code: string
  onJoined: (participantId: string) => void
}

// Deep-link / no-identity entry: prompt for a name, join over HTTP, then hand the
// new participant_id back so the room can connect.
export const JoinPrompt: FC<JoinPromptProps> = ({ code, onJoined }) => {
  const navigate = useNavigate()
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
    <main className="landing">
      <button
        type="button"
        className="icon-btn join-home"
        onClick={() => navigate('/')}
        aria-label="Go to home page"
        title="Home"
      >
        <HomeIcon />
      </button>
      <section className="card join-card">
        <h2 className="card__title">Join room {code}</h2>
        <form onSubmit={handleSubmit}>
          <label className="field field--required">
            <span className="field__label">Your name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              autoComplete="off"
              required
            />
          </label>
          <button type="submit" className="primary" disabled={busy}>
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
