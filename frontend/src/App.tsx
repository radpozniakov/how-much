import type { FC } from 'react'
import { Route, Routes, useParams } from 'react-router'
import { Landing } from './pages/Landing'
import { Room } from './pages/Room'

const RoomRoute: FC = () => {
  const { code } = useParams<{ code: string }>()
  const trimmed = code?.trim()
  return trimmed ? <Room code={trimmed} /> : <Landing />
}

const App: FC = () => (
  <Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/room/:code" element={<RoomRoute />} />
    <Route path="*" element={<Landing />} />
  </Routes>
)

export default App
