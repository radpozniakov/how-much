// React binding for a RoomSocket. The socket is owned in a ref (created once)
// and driven by an effect keyed on identity; useSyncExternalStore reads its
// cached snapshot. StrictMode's mount→unmount→mount settles to one live socket
// because open()/close() are symmetric and close() suppresses reconnect.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { RoomSocket } from './roomSocket'
import type { RoomState } from './roomSocket'
import { clearSession } from './session'

// The read-only snapshot (RoomState) plus the actions a page can dispatch. S8
// added castVote; S9 added the host controls (setItem/setHostVoting/reveal/reset);
// the UX phase added setName (D-42); V1 adds transferHost (FR-20/D-45).
export interface RoomController extends RoomState {
  castVote: (card: string) => void
  setItem: (topic: string | null) => void
  setName: (name: string) => void
  setHostVoting: (voting: boolean) => void
  transferHost: (targetId: string) => void
  reveal: () => void
  reset: () => void
}

export function useRoom(code: string, participantId: string): RoomController {
  // A single stable instance for the lifetime of the component. useState's lazy
  // initializer runs once; the socket lives outside render, so reading it here
  // is safe (unlike a ref accessed during render).
  const [socket] = useState(() => new RoomSocket())

  useEffect(() => {
    socket.open(code, participantId)
    return () => {
      socket.close()
    }
  }, [socket, code, participantId])

  const state = useSyncExternalStore(socket.subscribe, socket.getSnapshot)

  // Stable across renders (the socket is stable); RoomSocket.send no-ops unless
  // the socket is live, so a click during connect/reconnect is safely dropped.
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

  // The target comes from the rendered snapshot, so it is always a live id at click
  // time — but the domain re-checks it anyway (the target may have left in between).
  const transferHost = useCallback(
    (targetId: string) => {
      socket.send({ type: 'transfer_host', target_id: targetId })
    },
    [socket],
  )

  const reveal = useCallback(() => {
    socket.send({ type: 'reveal' })
  }, [socket])

  const reset = useCallback(() => {
    socket.send({ type: 'reset' })
  }, [socket])

  // A terminal rejection for a stale identity means the persisted id is no
  // longer valid — drop it so the caller can fall back to a fresh join (D-39).
  useEffect(() => {
    if (
      state.status === 'rejected' &&
      (state.error?.reason === 'not_in_room' ||
        state.error?.reason === 'room_not_found')
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
    reveal,
    reset,
  }
}
