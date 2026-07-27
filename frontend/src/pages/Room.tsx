import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from 'react-router'
import { rememberInputs } from '../lib/recall'
import { clearSession, loadSession } from '../lib/session'
import { useRoom } from '../lib/useRoom'
import {
  HostVotingToggle,
  RevealButton,
} from '../components/HostControls/HostControls'
import { JoinPrompt } from '../components/JoinPrompt/JoinPrompt'
import { ParticipantGrid } from '../components/ParticipantGrid/ParticipantGrid'
import { ParticipantsMenu } from '../components/ParticipantsMenu/ParticipantsMenu'
import { RoomHeader } from '../components/RoomHeader/RoomHeader'
import { Stage } from '../components/Stage/Stage'
import { StatsView } from '../components/StatsView/StatsView'
import {
  ViewSwitcher,
  type RoomView,
} from '../components/ViewSwitcher/ViewSwitcher'
import { VoteDeck } from '../components/VoteDeck/VoteDeck'

interface ConnectedRoomProps {
  code: string
  participantId: string
  onIdentityLost: () => void
}

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
    setName,
    setHostVoting,
    transferHost,
    removeParticipant,
    reveal,
    reset,
  } = useRoom(code, participantId)

  const [view, setView] = useState<RoomView>('cards')

  const exitRoom = () => {
    clearSession()
    navigate('/')
  }

  const renameSelf = (newName: string) => {
    if (status !== 'live') return
    rememberInputs({ name: newName })
    setName(newName)
  }

  useEffect(() => {
    if (status === 'rejected' && error?.reason === 'not_in_room') {
      onIdentityLost()
    }
  }, [status, error, onIdentityLost])

  if (status === 'rejected') {
    if (error?.reason === 'not_in_room') return null
    if (error?.reason === 'removed') {
      return (
        <main className="page">
          <h1 className="landing__title">Room {code}</h1>
          <p className="landing__description">{error.message}</p>
          <button type="button" onClick={() => navigate('/')}>
            Back to start
          </button>
        </main>
      )
    }
    return (
      <main className="page">
        <h1 className="landing__title">Room {code}</h1>
        <p className="landing__description">This room no longer exists.</p>
        <button type="button" onClick={() => navigate('/')}>
          Back to start
        </button>
      </main>
    )
  }

  const me = room?.participants.find((p) => p.id === participantId)
  const isHost =
    !!room && room.host_id !== null && room.host_id === participantId
  const canVote = !isHost || (room?.host_voting ?? false)
  const notLive = status !== 'live'
  const noTopic = !room?.current_item?.trim()

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
        onRename={renameSelf}
        onExit={exitRoom}
        status={status}
        participantsMenu={
          isHost && room ? (
            <ParticipantsMenu
              participants={room.participants}
              currentParticipantId={participantId}
              hostId={room.host_id ?? ''}
              onTransferHost={transferHost}
              onRemoveParticipant={removeParticipant}
              disabled={notLive}
            />
          ) : undefined
        }
      />

      {error && (
        <p className="error" role="alert">
          {error.message}
        </p>
      )}

      {room ? (
        <>
          <ViewSwitcher view={view} onViewChange={setView} />

          <Stage
            currentItem={room.current_item}
            revealed={room.revealed}
            votesCast={votesCast}
            totalVoters={voters.length}
            isHost={isHost}
            disabled={notLive || room.revealed}
            onSetTopic={setItem}
            statusControl={
              isHost ? (
                <HostVotingToggle
                  revealed={room.revealed}
                  hostVoting={room.host_voting}
                  disabled={notLive}
                  onSetHostVoting={setHostVoting}
                />
              ) : undefined
            }
          />

          {view === 'cards' ? (
            <ParticipantGrid
              participants={voters}
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

          {isHost && voters.length > 0 && (
            <RevealButton
              revealed={room.revealed}
              disabled={
                notLive || noTopic || (!room.revealed && votesCast === 0)
              }
              onReveal={reveal}
              onReset={reset}
            />
          )}

          {canVote && (
            <VoteDeck
              deck={room.deck}
              hasVoted={me?.has_voted ?? false}
              revealed={room.revealed}
              onVote={castVote}
              disabled={notLive || noTopic}
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
