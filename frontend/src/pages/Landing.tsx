import type { FC } from 'react'
import { CreateRoomForm } from '../components/CreateRoomForm/CreateRoomForm'
import { JoinRoomForm } from '../components/JoinRoomForm/JoinRoomForm'

export const Landing: FC = () => (
  <main className="page">
    <h1>how&#8209;much</h1>
    <p className="tagline">Planning-poker estimation</p>
    <CreateRoomForm />
    <JoinRoomForm />
  </main>
)
