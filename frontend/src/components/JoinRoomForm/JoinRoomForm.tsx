import { useState } from 'react'
import type { FC, SyntheticEvent } from 'react'
import { useNavigate } from 'react-router'
import { joinRoom, requestErrorMessage } from '../../lib/api'
import { loadRecall, rememberInputs } from '../../lib/recall'
import { saveSession } from '../../lib/session'

export const JoinRoomForm: FC = () => {
  const navigate = useNavigate()
  // Starts from the name this device last submitted (FR-23/D-52), read once at
  // mount. The code is not recalled — it belongs to a room, not to a person.
  const [name, setName] = useState(() => loadRecall().name)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { participantId, room } = await joinRoom(code, name)
      rememberInputs({ name: name.trim() })
      saveSession(room.code, participantId)
      navigate(`/room/${room.code}`)
    } catch (err) {
      setError(requestErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2 className="card__title">Join a room</h2>
      <form onSubmit={handleSubmit}>
        <label className="field field--required">
          <span className="field__label">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoComplete="off"
            required
          />
        </label>
        <label className="field field--required">
          <span className="field__label">Room code</span>
          <input
            className="join-form__code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
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
  )
}
