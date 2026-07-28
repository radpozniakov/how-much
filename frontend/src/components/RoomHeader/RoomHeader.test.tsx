import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoomHeader } from './RoomHeader'

const noop = () => {}

function renderHeader(
  overrides: Partial<Parameters<typeof RoomHeader>[0]> = {},
) {
  const props = {
    code: 'ABCDEF',
    participantName: 'Alice',
    onRename: noop,
    onExit: noop,
    status: 'live' as const,
    ...overrides,
  }
  return render(<RoomHeader {...props} />)
}

describe('RoomHeader', () => {
  it('shows the room code and the current participant name', () => {
    renderHeader()
    expect(screen.getByRole('heading', { name: 'ABCDEF' })).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  describe('participantsMenu slot', () => {
    it('is absent by default', () => {
      renderHeader()
      expect(screen.queryByTestId('slot')).not.toBeInTheDocument()
    })

    it('renders the injected control beside the name', () => {
      renderHeader({ participantsMenu: <span data-testid="slot">roster</span> })
      expect(screen.getByTestId('slot')).toBeInTheDocument()
    })

    it('recovers focus when the control vanishes from under the user', async () => {
      const user = userEvent.setup()
      const { rerender } = renderHeader({
        participantsMenu: <button type="button">Make host</button>,
      })

      await user.click(screen.getByRole('button', { name: 'Make host' }))
      expect(screen.getByRole('button', { name: 'Make host' })).toHaveFocus()

      rerender(
        <RoomHeader
          code="ABCDEF"
          participantName="Alice"
          onRename={noop}
          onExit={noop}
          status="live"
        />,
      )

      expect(screen.getByRole('button', { name: 'Alice' })).toHaveFocus()
    })

    it('keeps the control mounted while the name is being edited', async () => {
      const user = userEvent.setup()
      renderHeader({ participantsMenu: <span data-testid="slot">roster</span> })

      await user.click(screen.getByRole('button', { name: 'Alice' }))

      expect(
        screen.getByRole('textbox', { name: 'Your display name' }),
      ).toBeInTheDocument()
      expect(screen.getByTestId('slot')).toBeInTheDocument()
    })
  })

  it('copies the shareable room link on the copy button', async () => {
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

  it('shows an error when copying the room link fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('Permission denied'),
    )
    renderHeader()

    await user.click(screen.getByRole('button', { name: 'Copy room link' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not copy link',
    )
    expect(screen.queryByText('Link copied')).not.toBeInTheDocument()
  })

  it('leaves the room on the exit button', async () => {
    const onExit = vi.fn()
    const user = userEvent.setup()
    renderHeader({ onExit })

    await user.click(screen.getByRole('button', { name: 'Leave room' }))
    expect(onExit).toHaveBeenCalledOnce()
  })

  describe('inline rename', () => {
    it('turns the name into an input seeded with the current name on click', async () => {
      const user = userEvent.setup()
      renderHeader()

      await user.click(screen.getByRole('button', { name: 'Alice' }))

      const input = screen.getByRole('textbox', { name: 'Your display name' })
      expect(input).toHaveValue('Alice')
    })

    it('commits a changed name on Enter (trimmed) and leaves edit mode', async () => {
      const onRename = vi.fn()
      const user = userEvent.setup()
      renderHeader({ onRename })

      await user.click(screen.getByRole('button', { name: 'Alice' }))
      const input = screen.getByRole('textbox', { name: 'Your display name' })
      await user.clear(input)
      await user.type(input, '  Alicia  {Enter}')

      expect(onRename).toHaveBeenCalledExactlyOnceWith('Alicia')
      expect(
        screen.queryByRole('textbox', { name: 'Your display name' }),
      ).not.toBeInTheDocument()
    })

    it('commits on blur', async () => {
      const onRename = vi.fn()
      const user = userEvent.setup()
      renderHeader({ onRename })

      await user.click(screen.getByRole('button', { name: 'Alice' }))
      const input = screen.getByRole('textbox', { name: 'Your display name' })
      await user.clear(input)
      await user.type(input, 'Bob')
      await user.tab()

      expect(onRename).toHaveBeenCalledExactlyOnceWith('Bob')
    })

    it('reverts on Escape without renaming', async () => {
      const onRename = vi.fn()
      const user = userEvent.setup()
      renderHeader({ onRename })

      await user.click(screen.getByRole('button', { name: 'Alice' }))
      const input = screen.getByRole('textbox', { name: 'Your display name' })
      await user.clear(input)
      await user.type(input, 'Zzz{Escape}')

      expect(onRename).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Alice' })).toBeInTheDocument()
    })

    it('does not rename when the value is unchanged', async () => {
      const onRename = vi.fn()
      const user = userEvent.setup()
      renderHeader({ onRename })

      await user.click(screen.getByRole('button', { name: 'Alice' }))
      const input = screen.getByRole('textbox', { name: 'Your display name' })
      await user.type(input, '{Enter}')

      expect(onRename).not.toHaveBeenCalled()
    })

    it('does not rename when the value is blank', async () => {
      const onRename = vi.fn()
      const user = userEvent.setup()
      renderHeader({ onRename })

      await user.click(screen.getByRole('button', { name: 'Alice' }))
      const input = screen.getByRole('textbox', { name: 'Your display name' })
      await user.clear(input)
      await user.type(input, '   {Enter}')

      expect(onRename).not.toHaveBeenCalled()
    })

    it('is not editable when the socket is not live', async () => {
      const onRename = vi.fn()
      const user = userEvent.setup()
      renderHeader({ onRename, status: 'connecting' })

      const nameButton = screen.getByRole('button', { name: 'Alice' })
      expect(nameButton).toBeDisabled()
      await user.click(nameButton)
      expect(
        screen.queryByRole('textbox', { name: 'Your display name' }),
      ).not.toBeInTheDocument()
    })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})
