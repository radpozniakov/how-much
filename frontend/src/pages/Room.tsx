import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from 'react-router'
import { clearSession, loadSession } from '../lib/session'
import { useRoom } from '../lib/useRoom'
import { HostControls } from '../components/HostControls/HostControls'
import { JoinPrompt } from '../components/JoinPrompt/JoinPrompt'
import { Results } from '../components/Results/Results'
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
  const navigate = useNavigate()
  const {
    room,
    status,
    error,
    castVote,
    setItem,
    setHostVoting,
    reveal,
    reset,
  } = useRoom(code, participantId)

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
        (() => {
          const me = room.participants.find((p) => p.id === participantId)
          // host_id can be null during a transfer/empty window — never match null.
          const isHost = room.host_id !== null && room.host_id === participantId
          // An opted-out host is a facilitator, not a voter (D-14): no deck.
          const canVote = !isHost || room.host_voting
          const notLive = status !== 'live'
          return (
            <>
              <Topic
                currentItem={room.current_item}
                isHost={isHost}
                disabled={notLive || room.revealed}
                onSetTopic={setItem}
              />
              <Roster room={room} me={participantId} />
              {isHost && (
                <HostControls
                  revealed={room.revealed}
                  hostVoting={room.host_voting}
                  disabled={notLive}
                  onReveal={reveal}
                  onReset={reset}
                  onSetHostVoting={setHostVoting}
                />
              )}
              {room.revealed && room.results ? (
                <Results
                  results={room.results}
                  participants={room.participants}
                  hostId={room.host_id}
                />
              ) : (
                canVote && (
                  <VoteDeck
                    hasVoted={me?.has_voted ?? false}
                    revealed={room.revealed}
                    onVote={castVote}
                    disabled={notLive}
                  />
                )
              )}
            </>
          )
        })()
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
