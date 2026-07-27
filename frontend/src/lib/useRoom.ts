import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { RoomSocket } from './roomSocket'
import type { RoomState } from './roomSocket'
import { clearSession } from './session'

export interface RoomController extends RoomState {
  castVote: (card: string) => void
  setItem: (topic: string | null) => void
  setName: (name: string) => void
  setHostVoting: (voting: boolean) => void
  transferHost: (targetId: string) => void
  removeParticipant: (targetId: string) => void
  reveal: () => void
  reset: () => void
}

export function useRoom(code: string, participantId: string): RoomController {
  const [socket] = useState(() => new RoomSocket())

  useEffect(() => {
    socket.open(code, participantId)
    return () => {
      socket.close()
    }
  }, [socket, code, participantId])

  const state = useSyncExternalStore(socket.subscribe, socket.getSnapshot)

  const castVote = useCallback(
    (card: string) => {
      socket.send({ type: 'cast_vote', card })
    },
    [socket],
  )

  const setItem = useCallback(
    (topic: string | null) => {
      socket.send({ type: 'set_item', topic })
    },
    [socket],
  )

  const setName = useCallback(
    (name: string) => {
      socket.send({ type: 'set_name', name })
    },
    [socket],
  )

  const setHostVoting = useCallback(
    (voting: boolean) => {
      socket.send({ type: 'set_host_voting', voting })
    },
    [socket],
  )

  const transferHost = useCallback(
    (targetId: string) => {
      socket.send({ type: 'transfer_host', target_id: targetId })
    },
    [socket],
  )

  const removeParticipant = useCallback(
    (targetId: string) => {
      socket.send({ type: 'remove_participant', target_id: targetId })
    },
    [socket],
  )

  const reveal = useCallback(() => {
    socket.send({ type: 'reveal' })
  }, [socket])

  const reset = useCallback(() => {
    socket.send({ type: 'reset' })
  }, [socket])

  useEffect(() => {
    if (
      state.status === 'rejected' &&
      (state.error?.reason === 'not_in_room' ||
        state.error?.reason === 'room_not_found' ||
        state.error?.reason === 'removed')
    ) {
      clearSession()
    }
  }, [state.status, state.error])

  return {
    ...state,
    castVote,
    setItem,
    setName,
    setHostVoting,
    transferHost,
    removeParticipant,
    reveal,
    reset,
  }
}
