import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoomHeader } from './RoomHeader'

const noop = () => {}

function renderHeader(overrides: Partial<Parameters<typeof RoomHeader>[0]> = {}) {
  const props = {
    code: 'ABCDEF',
    participantName: 'Alice',
    view: 'cards' as const,
    onViewChange: noop,
    onExit: noop,
    status: 'live' as const,
    ...overrides,
  }
  return render(<RoomHeader {...props} />)
}

describe('RoomHeader', () => {
  it('shows the room code and the current participant name', () => {
    renderHeader()
    expect(
      screen.getByRole('heading', { name: 'Room ABCDEF' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('copies the shareable room link on the copy button', async () => {
    // userEvent.setup() installs a jsdom clipboard; spy on it to capture the
    // link the component writes.
    const user = userEvent.setup()
    const writeText = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockResolvedValue(undefined)
    renderHeader()

    await user.click(screen.getByRole('button', { name: 'Copy room link' }))

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/room/ABCDEF`,
    )
    expect(await screen.findByText('Link copied')).toBeInTheDocument()
  })

  it('leaves the room on the exit button', async () => {
    const onExit = vi.fn()
    const user = userEvent.setup()
    renderHeader({ onExit })

    await user.click(screen.getByRole('button', { name: 'Leave room' }))
    expect(onExit).toHaveBeenCalledOnce()
  })

  it('marks the active view tab and switches on click', async () => {
    const onViewChange = vi.fn()
    const user = userEvent.setup()
    renderHeader({ view: 'cards', onViewChange })

    const cards = screen.getByRole('tab', { name: 'View 1 (cards)' })
    const stats = screen.getByRole('tab', { name: 'View 2 (stats)' })
    expect(cards).toHaveAttribute('aria-selected', 'true')
    expect(stats).toHaveAttribute('aria-selected', 'false')

    await user.click(stats)
    expect(onViewChange).toHaveBeenCalledWith('stats')
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})
