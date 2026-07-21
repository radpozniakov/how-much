import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from 'react-router'
import { clearSession, loadSession } from '../lib/session'
import { useRoom } from '../lib/useRoom'
import { HostControls } from '../components/HostControls/HostControls'
import { JoinPrompt } from '../components/JoinPrompt/JoinPrompt'
import { ParticipantGrid } from '../components/ParticipantGrid/ParticipantGrid'
import { RoomHeader, type RoomView } from '../components/RoomHeader/RoomHeader'
import { Stage } from '../components/Stage/Stage'
import { StatsView } from '../components/StatsView/StatsView'
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

  // Which participant view the header segment control shows: the cards grid or
  // the stats view (S18). The two are swapped in the area under the stage.
  const [view, setView] = useState<RoomView>('cards')

  // Leaving the room: drop the per-tab identity and navigate home. Unmounting
  // ConnectedRoom closes the socket, which broadcasts the leave (FR-17).
  const exitRoom = () => {
    clearSession()
    navigate('/')
  }

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

  const me = room?.participants.find((p) => p.id === participantId)
  // host_id can be null during a transfer/empty window — never match null.
  const isHost = !!room && room.host_id !== null && room.host_id === participantId
  // An opted-out host is a facilitator, not a voter (D-14): no deck, and they
  // are excluded from the vote-progress denominator (FR-17).
  const canVote = !isHost || (room?.host_voting ?? false)
  const notLive = status !== 'live'

  const voters =
    room?.participants.filter(
      (p) => room.host_voting || p.id !== room.host_id,
    ) ?? []
  const votesCast = voters.filter((p) => p.has_voted).length

  return (
    <main className="room">
      <RoomHeader
        code={code}
        participantName={me?.name ?? ''}
        view={view}
        onViewChange={setView}
        onExit={exitRoom}
        status={status}
      />

      {error && (
        <p className="error" role="alert">
          {error.message}
        </p>
      )}

      {room ? (
        <>
          <Stage
            currentItem={room.current_item}
            revealed={room.revealed}
            votesCast={votesCast}
            totalVoters={voters.length}
            isHost={isHost}
          />

          {view === 'cards' ? (
            <ParticipantGrid
              participants={room.participants}
              revealed={room.revealed}
              results={room.results}
            />
          ) : (
            <StatsView
              participants={room.participants}
              results={room.results}
              revealed={room.revealed}
              hostId={room.host_id}
            />
          )}

          {isHost && (
            <Topic
              currentItem={room.current_item}
              disabled={notLive || room.revealed}
              onSetTopic={setItem}
            />
          )}

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

          {/* The voting cards row is a permanent bottom fixture (spec §Voting
              cards). After reveal the deck stays visible but locked; the round's
              values move to the stats view (S18), not a separate bottom panel. */}
          {canVote && (
            <VoteDeck
              hasVoted={me?.has_voted ?? false}
              revealed={room.revealed}
              onVote={castVote}
              disabled={notLive}
            />
          )}
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
