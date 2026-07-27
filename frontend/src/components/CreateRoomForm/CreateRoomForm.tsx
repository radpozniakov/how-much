import { useState } from 'react'
import type { FC, SyntheticEvent } from 'react'
import { useNavigate } from 'react-router'
import { createRoom, requestErrorMessage } from '../../lib/api'
import { FIBONACCI_DECK } from '../../lib/deck'
import { MAX_DECK_INPUT_LENGTH } from '../../lib/limits'
import { loadRecall, rememberInputs } from '../../lib/recall'
import { saveSession } from '../../lib/session'

const DEFAULT_DECK_HINT = FIBONACCI_DECK.join(', ')

export const CreateRoomForm: FC = () => {
  const navigate = useNavigate()
  const [name, setName] = useState(() => loadRecall().name)
  const [cards, setCards] = useState(() => loadRecall().cards)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: SyntheticEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { participantId, room } = await createRoom(name, cards)
      rememberInputs({ name: name.trim(), cards })
      saveSession(room.code, participantId)
      navigate(`/room/${room.code}`)
    } catch (err) {
      setError(requestErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2 className="card__title">Create a room</h2>
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
        <label className="field">
          <span className="field__label">Card values</span>
          <input
            aria-describedby="create-cards-hint"
            value={cards}
            onChange={(e) => setCards(e.target.value)}
            maxLength={MAX_DECK_INPUT_LENGTH}
            placeholder={DEFAULT_DECK_HINT}
            autoComplete="off"
          />
        </label>
        <span id="create-cards-hint" className="field__hint">
          Comma-separated numbers, fixed for the room. Leave blank for{' '}
          {DEFAULT_DECK_HINT}.
        </span>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create'}
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
