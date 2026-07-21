import type { FC } from 'react'
import { matchRoom, useRoute } from './lib/router'
import { Landing } from './pages/Landing'
import { Room } from './pages/Room'
import './App.css'

// Two routes (D-37): `/room/:code` → the room, everything else → create/join.
const App: FC = () => {
  const code = matchRoom(useRoute())
  return code ? <Room code={code} /> : <Landing />
}

export default App
