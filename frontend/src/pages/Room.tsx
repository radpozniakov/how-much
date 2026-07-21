import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { navigate } from '../lib/router'
import { clearSession, loadSession } from '../lib/session'
import { useRoom } from '../lib/useRoom'
import { JoinPrompt } from '../components/JoinPrompt/JoinPrompt'
import { Roster } from '../components/Roster/Roster'
import { ShareLink } from '../components/ShareLink/ShareLink'
import { StatusIndicator } from '../components/StatusIndicator/StatusIndicator'
import { Topic } from '../components/Topic/Topic'
import { VoteDeck } from '../components/VoteDeck/VoteDeck'

interface ConnectedRoomProps {
  code: string
  participantId: string
  onIdentityLost: () => void
}

// The connected view. It always calls useRoom (a hook can't be conditional), so
// it is only mounted once we have an identity.
const ConnectedRoom: FC<ConnectedRoomProps> = ({
  code,
  participantId,
  onIdentityLost,
}) => {
  const { room, status, error, castVote } = useRoom(code, participantId)

  // A stale-identity rejection: the hook has cleared the session; drop back to
  // the name prompt so the user rejoins fresh (D-39).
  useEffect(() => {
    if (status === 'rejected' && error?.reason === 'not_in_room') {
      onIdentityLost()
    }
  }, [status, error, onIdentityLost])

  if (status === 'rejected') {
    if (error?.reason === 'not_in_room') return null // parent swaps in JoinPrompt
    return (
      <main className="page">
        <h1>Room {code}</h1>
        <section className="card">
          <p>This room no longer exists.</p>
          <button type="button" onClick={() => navigate('/')}>
            Back to start
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="page">
      <header className="room-head">
        <h1>Room {code}</h1>
        <StatusIndicator status={status} />
      </header>

      <ShareLink code={code} />

      {error && (
        <p className="error" role="alert">
          {error.message}
        </p>
      )}

      {room ? (
        <>
          <Topic currentItem={room.current_item} />
          <Roster room={room} me={participantId} />
          <VoteDeck
            hasVoted={
              room.participants.find((p) => p.id === participantId)
                ?.has_voted ?? false
            }
            revealed={room.revealed}
            onVote={castVote}
            disabled={status !== 'live'}
          />
        </>
      ) : (
        <p>Connecting…</p>
      )}
    </main>
  )
}

interface RoomProps {
  code: string
}

export const Room: FC<RoomProps> = ({ code }) => {
  const initial = loadSession()
  const [participantId, setParticipantId] = useState<string | null>(
    initial && initial.code === code ? initial.participantId : null,
  )

  if (participantId === null) {
    return <JoinPrompt code={code} onJoined={setParticipantId} />
  }

  return (
    <ConnectedRoom
      code={code}
      participantId={participantId}
      onIdentityLost={() => {
        clearSession()
        setParticipantId(null)
      }}
    />
  )
}
