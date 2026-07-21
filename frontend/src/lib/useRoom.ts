// React binding for a RoomSocket. The socket is owned in a ref (created once)
// and driven by an effect keyed on identity; useSyncExternalStore reads its
// cached snapshot. StrictMode's mount→unmount→mount settles to one live socket
// because open()/close() are symmetric and close() suppresses reconnect.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { RoomSocket } from './roomSocket'
import type { RoomState } from './roomSocket'
import { clearSession } from './session'

export function useRoom(code: string, participantId: string): RoomState {
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

  return state
}
