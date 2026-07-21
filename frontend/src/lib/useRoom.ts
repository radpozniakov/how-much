// React binding for a RoomSocket. The socket is owned in a ref (created once)
// and driven by an effect keyed on identity; useSyncExternalStore reads its
// cached snapshot. StrictMode's mount→unmount→mount settles to one live socket
// because open()/close() are symmetric and close() suppresses reconnect.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { RoomSocket } from './roomSocket'
import type { RoomState } from './roomSocket'
import { clearSession } from './session'

// The read-only snapshot (RoomState) plus the actions a page can dispatch. S8
// adds castVote; S9 will add the host controls (reveal/reset/set_item/...).
export interface RoomController extends RoomState {
  castVote: (card: string) => void
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

  return { ...state, castVote }
}
