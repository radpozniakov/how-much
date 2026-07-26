import type { FC } from 'react'
import { CreateRoomForm } from '../components/CreateRoomForm/CreateRoomForm'
import { JoinRoomForm } from '../components/JoinRoomForm/JoinRoomForm'

export const Landing: FC = () => (
  <main className="landing">
    <section className="landing__intro">
      <h1 className="landing__title">How much 🤯 ?</h1>
      <p className="landing__description">
        A safe space to shock the manager with estimates
      </p>
    </section>
    <div className="landing__cards">
      <CreateRoomForm />
      <JoinRoomForm />
    </div>
  </main>
)
