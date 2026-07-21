import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from './App'
import { clearSession } from './lib/session'

// Routing behavior, previously guarded by lib/router.test.ts's matchRoom cases,
// now lives in App's route table + the RoomRoute adapter (D-37). With no
// persisted session, /room/:code mounts Room → JoinPrompt (a plain form, no
// socket), whose "Join room {code}" heading proves the code was extracted.
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  clearSession()
})

describe('App routing', () => {
  it('deep-links /room/:code into the room', () => {
    renderAt('/room/ABCDEF')
    expect(
      screen.getByRole('heading', { name: 'Join room ABCDEF' }),
    ).toBeInTheDocument()
  })

  it('tolerates a trailing slash on the room path', () => {
    renderAt('/room/ABCDEF/')
    expect(
      screen.getByRole('heading', { name: 'Join room ABCDEF' }),
    ).toBeInTheDocument()
  })

  it('renders Landing at the root', () => {
    renderAt('/')
    expect(screen.getByText('Planning-poker estimation')).toBeInTheDocument()
  })

  it('falls back to Landing for an empty room code', () => {
    renderAt('/room/')
    expect(screen.getByText('Planning-poker estimation')).toBeInTheDocument()
  })

  it('falls back to Landing for an all-whitespace code (trim parity)', () => {
    renderAt('/room/%20%20')
    expect(screen.getByText('Planning-poker estimation')).toBeInTheDocument()
  })

  it('falls back to Landing for an unrelated path', () => {
    renderAt('/foo/bar')
    expect(screen.getByText('Planning-poker estimation')).toBeInTheDocument()
  })
})
