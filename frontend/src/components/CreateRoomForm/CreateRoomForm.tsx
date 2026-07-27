import { useState } from 'react'
import type { FC, SyntheticEvent } from 'react'
import { useNavigate } from 'react-router'
import { createRoom, requestErrorMessage } from '../../lib/api'
import { FIBONACCI_DECK } from '../../lib/deck'
import { MAX_DECK_INPUT_LENGTH } from '../../lib/limits'
import { loadRecall, rememberInputs } from '../../lib/recall'
import { saveSession } from '../../lib/session'

// What "leave it blank" gets you, spelled out rather than described. This is the
// one place the default deck is still named client-side (lib/deck.ts) — the room
// itself votes from the snapshot.
const DEFAULT_DECK_HINT = FIBONACCI_DECK.join(', ')

export const CreateRoomForm: FC = () => {
  const navigate = useNavigate()
  const [name, setName] = useState(() => loadRecall().name)
  // The host's card values as typed, sent raw (FR-22/D-48). Deliberately not
  // parsed or pre-validated here: the server owns the deck rules, so a second
  // implementation on this side could only drift from the one that decides.
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
        {/* The room's one creation-time option (FR-22/D-48). Optional, and fixed
            once the room exists — there is no later chance to change it, which is
            why it sits here and nowhere in the room UI. S22 owns the wording. */}
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
