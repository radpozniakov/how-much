import type { FC } from 'react'
import { Route, Routes, useParams } from 'react-router'
import { Landing } from './pages/Landing'
import { Room } from './pages/Room'
import './App.css'

// The room code lives in the path (`/room/:code`, D-37); this adapter reads it
// and hands it to Room as a prop so Room stays independent of the router.
// React Router decodes the param but doesn't trim it, so an all-whitespace code
// falls back to Landing — matching the old matchRoom()'s trim+empty guard.
const RoomRoute: FC = () => {
  const { code } = useParams<{ code: string }>()
  const trimmed = code?.trim()
  return trimmed ? <Room code={trimmed} /> : <Landing />
}

// Two routes (D-37): `/room/:code` → the room, everything else → create/join.
const App: FC = () => (
  <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/room/:code" element={<RoomRoute />} />
    <Route path="*" element={<Landing />} />
  </Routes>
)

export default App
