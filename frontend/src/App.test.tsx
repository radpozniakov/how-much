import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from './App'
import { clearSession } from './lib/session'

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
    expect(
      screen.getByText('A safe space to shock the manager with estimates'),
    ).toBeInTheDocument()
  })

  it('falls back to Landing for an empty room code', () => {
    renderAt('/room/')
    expect(
      screen.getByText('A safe space to shock the manager with estimates'),
    ).toBeInTheDocument()
  })

  it('falls back to Landing for an all-whitespace code (trim parity)', () => {
    renderAt('/room/%20%20')
    expect(
      screen.getByText('A safe space to shock the manager with estimates'),
    ).toBeInTheDocument()
  })

  it('falls back to Landing for an unrelated path', () => {
    renderAt('/foo/bar')
    expect(
      screen.getByText('A safe space to shock the manager with estimates'),
    ).toBeInTheDocument()
  })
})
