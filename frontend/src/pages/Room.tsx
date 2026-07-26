import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { useNavigate } from 'react-router'
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
    setName,
    setHostVoting,
    transferHost,
    removeParticipant,
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
  //
  // Deliberately keyed on `not_in_room` alone and NOT on `removed`, even though the
  // hook clears the session for both. A stale id is a non-event to explain — the room
  // is fine and rejoining is the obvious next step, so the prompt IS the message. A
  // removal is a thing that happened to someone, and dropping them straight onto a
  // rejoin form would both fail to tell them and invite an immediate rejoin as the
  // path of least resistance. Nothing stops that rejoin (removal is not a ban, D-15);
  // it just should not be the default.
  useEffect(() => {
    if (status === 'rejected' && error?.reason === 'not_in_room') {
      onIdentityLost()
    }
  }, [status, error, onIdentityLost])

  if (status === 'rejected') {
    if (error?.reason === 'not_in_room') return null // parent swaps in JoinPrompt
    // Removed by the host (FR-21/D-47). The message is the server's, kept in one
    // place beside the slug it travels with, so S22 can settle the wording without
    // touching this branch — the same reason the error banner below renders
    // `error.message` verbatim rather than mapping slugs to local copy.
    if (error?.reason === 'removed') {
      return (
        // Structurally identical to the swept-room branch below, deliberately: no
        // role="status" or aria-live on the message. A live region created *with* its
        // content already in it does not reliably announce, so it would claim a
        // behaviour it does not deliver. What this view actually needs is focus moved
        // into it on the swap — real work, and S21's, alongside the same gap on the
        // branch below. Flagged there rather than half-solved here.
        <main className="page">
          <h1>Room {code}</h1>
          <section className="card">
            <p>{error.message}</p>
            <button type="button" onClick={() => navigate('/')}>
              Back to start
            </button>
          </section>
        </main>
      )
    }
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
  const isHost =
    !!room && room.host_id !== null && room.host_id === participantId
  // An opted-out host is a facilitator, not a voter (D-14): no deck, and they
  // are excluded from the vote-progress denominator (FR-17).
  const canVote = !isHost || (room?.host_voting ?? false)
  const notLive = status !== 'live'
  // No estimation subject set yet: voting and revealing are blocked until the
  // host names one (the stage shows a "waiting for the subject" status).
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
        onRename={setName}
        onExit={exitRoom}
        status={status}
        // Host-only roster beside the name. Gated here rather than inside the
        // header so the header stays a dumb band. It carries both room-control
        // actions: the handover (FR-20/D-45) and the removal (FR-21/D-47). Note the
        // gate is a rendering affordance only — the domain's _require_host is the
        // boundary, so hiding this control is not what makes it host-only.
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
          {/* Dedicated section above the stage: swap cards ↔ graph view. */}
          <ViewSwitcher view={view} onViewChange={setView} />

          <Stage
            currentItem={room.current_item}
            revealed={room.revealed}
            votesCast={votesCast}
            totalVoters={voters.length}
            isHost={isHost}
            disabled={notLive || room.revealed}
            onSetTopic={setItem}
            // Host "I'm voting" opt-in, directly below the stage status line.
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
              // Only eligible voters get a card: an opted-out host (host_voting
              // false) is a facilitator and is excluded from the grid (FR-17).
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

          {/* Single host action below the participant cards: reveal → reset.
              Only shown when someone can actually vote (FR-17). */}
          {isHost && voters.length > 0 && (
            <RevealButton
              revealed={room.revealed}
              // Revealing needs at least one cast vote; the reset ("New voting")
              // action stays enabled so the host can always start a new round.
              disabled={
                notLive || noTopic || (!room.revealed && votesCast === 0)
              }
              onReveal={reveal}
              onReset={reset}
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
