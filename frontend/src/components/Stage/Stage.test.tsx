import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Stage } from './Stage'

describe('Stage', () => {
  it('renders the task title from currentItem for a non-host', () => {
    render(
      <Stage
        currentItem="Bulk re-validate cycle items"
        revealed={false}
        votesCast={2}
        totalVoters={3}
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'Bulk re-validate cycle items' }),
    ).toBeInTheDocument()
  })

  it('shows a waiting message to non-hosts when no topic is set', () => {
    render(
      <Stage currentItem={null} revealed={false} votesCast={0} totalVoters={0} />,
    )
    expect(screen.getByText(/Waiting for the host/i)).toBeInTheDocument()
  })

  it('shows the voting status and progress counter pre-reveal', () => {
    render(
      <Stage currentItem="X" revealed={false} votesCast={2} totalVoters={3} />,
    )
    expect(screen.getByText('Voting in progress')).toBeInTheDocument()
    expect(screen.getByText('2/3')).toBeInTheDocument()
  })

  it('shows the revealed status and hides the counter once revealed', () => {
    render(
      <Stage currentItem="X" revealed={true} votesCast={3} totalVoters={3} />,
    )
    expect(screen.getByText('Votes revealed')).toBeInTheDocument()
    expect(screen.queryByText('3/3')).not.toBeInTheDocument()
  })

  it('shows the waiting-for-subject status and hides the counter when no topic', () => {
    render(
      <Stage currentItem={null} revealed={false} votesCast={0} totalVoters={2} />,
    )
    expect(
      screen.getByText('Waiting for the estimation subject'),
    ).toBeInTheDocument()
    expect(screen.queryByText('0/2')).not.toBeInTheDocument()
  })

  // ── Host inline topic editor (merged from the former Topic component) ──

  it('gives the host an editable title seeded from the current item', () => {
    render(
      <Stage currentItem="Login page" revealed={false} votesCast={0} totalVoters={0} isHost />,
    )
    expect(screen.getByRole('textbox', { name: /topic/i })).toHaveValue(
      'Login page',
    )
  })

  it('shows the host a "set a topic" placeholder when empty', () => {
    render(
      <Stage currentItem={null} revealed={false} votesCast={0} totalVoters={0} isHost />,
    )
    expect(screen.getByPlaceholderText(/Set a topic to start/i)).toBeInTheDocument()
  })

  it('commits the typed topic when Enter is pressed', async () => {
    const user = userEvent.setup()
    const onSetTopic = vi.fn()
    render(
      <Stage
        currentItem={null}
        revealed={false}
        votesCast={0}
        totalVoters={0}
        isHost
        onSetTopic={onSetTopic}
      />,
    )
    await user.type(screen.getByRole('textbox', { name: /topic/i }), 'New topic{Enter}')
    expect(onSetTopic).toHaveBeenCalledWith('New topic')
  })

  it('commits the typed topic on blur', async () => {
    const user = userEvent.setup()
    const onSetTopic = vi.fn()
    render(
      <>
        <Stage
          currentItem={null}
          revealed={false}
          votesCast={0}
          totalVoters={0}
          isHost
          onSetTopic={onSetTopic}
        />
        <button type="button">elsewhere</button>
      </>,
    )
    await user.type(screen.getByRole('textbox', { name: /topic/i }), 'New topic')
    await user.click(screen.getByRole('button', { name: /elsewhere/i }))
    expect(onSetTopic).toHaveBeenCalledWith('New topic')
  })

  it('reverts and does not commit when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onSetTopic = vi.fn()
    render(
      <Stage
        currentItem="Original"
        revealed={false}
        votesCast={0}
        totalVoters={0}
        isHost
        onSetTopic={onSetTopic}
      />,
    )
    const input = screen.getByRole('textbox', { name: /topic/i })
    await user.type(input, ' edits{Escape}')
    expect(onSetTopic).not.toHaveBeenCalled()
    expect(input).toHaveValue('Original')
  })

  it('autosaves the draft after a 500ms pause while focus stays in the editor', () => {
    vi.useFakeTimers()
    try {
      const onSetTopic = vi.fn()
      render(
        <Stage
          currentItem={null}
          revealed={false}
          votesCast={0}
          totalVoters={0}
          isHost
          onSetTopic={onSetTopic}
        />,
      )
      const input = screen.getByRole('textbox', { name: /topic/i })
      // Type without blurring — focus stays in the editor.
      fireEvent.change(input, { target: { value: 'Autosaved topic' } })
      expect(onSetTopic).not.toHaveBeenCalled()

      vi.advanceTimersByTime(499)
      expect(onSetTopic).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      expect(onSetTopic).toHaveBeenCalledExactlyOnceWith('Autosaved topic')
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels a pending autosave when Escape is pressed', () => {
    vi.useFakeTimers()
    try {
      const onSetTopic = vi.fn()
      render(
        <Stage
          currentItem="Original"
          revealed={false}
          votesCast={0}
          totalVoters={0}
          isHost
          onSetTopic={onSetTopic}
        />,
      )
      const input = screen.getByRole('textbox', { name: /topic/i })
      // Focus so the handler's .blur() actually dispatches a blur event.
      input.focus()
      fireEvent.change(input, { target: { value: 'Original edits' } })
      // Escape blurs the editor, which reverts and clears the pending autosave.
      fireEvent.keyDown(input, { key: 'Escape' })

      vi.advanceTimersByTime(500)
      expect(onSetTopic).not.toHaveBeenCalled()
      expect(input).toHaveValue('Original')
    } finally {
      vi.useRealTimers()
    }
  })

  it('commits null on a blank topic', async () => {
    const user = userEvent.setup()
    const onSetTopic = vi.fn()
    render(
      <Stage
        currentItem="Existing"
        revealed={false}
        votesCast={0}
        totalVoters={0}
        isHost
        onSetTopic={onSetTopic}
      />,
    )
    const input = screen.getByRole('textbox', { name: /topic/i })
    await user.clear(input)
    await user.type(input, '   {Enter}')
    expect(onSetTopic).toHaveBeenCalledWith(null)
  })

  it('does not re-send an unchanged topic on blur', async () => {
    const user = userEvent.setup()
    const onSetTopic = vi.fn()
    render(
      <>
        <Stage
          currentItem="Unchanged"
          revealed={false}
          votesCast={0}
          totalVoters={0}
          isHost
          onSetTopic={onSetTopic}
        />
        <button type="button">elsewhere</button>
      </>,
    )
    await user.click(screen.getByRole('textbox', { name: /topic/i }))
    await user.click(screen.getByRole('button', { name: /elsewhere/i }))
    expect(onSetTopic).not.toHaveBeenCalled()
  })

  it('caps the editor at MAX_TOPIC_LENGTH', () => {
    render(
      <Stage currentItem={null} revealed={false} votesCast={0} totalVoters={0} isHost />,
    )
    expect(screen.getByRole('textbox', { name: /topic/i })).toHaveAttribute(
      'maxLength',
      '200',
    )
  })

  it('disables the editor when disabled', () => {
    render(
      <Stage
        currentItem={null}
        revealed={false}
        votesCast={0}
        totalVoters={0}
        isHost
        disabled
      />,
    )
    expect(screen.getByRole('textbox', { name: /topic/i })).toBeDisabled()
  })

  it('resyncs the editor when currentItem changes (submit echo)', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <Stage currentItem={null} revealed={false} votesCast={0} totalVoters={0} isHost />,
    )
    const input = screen.getByRole('textbox', { name: /topic/i })
    await user.type(input, 'abc')

    // The server echoes the submitted topic back as the new currentItem.
    rerender(
      <Stage currentItem="abc" revealed={false} votesCast={0} totalVoters={0} isHost />,
    )
    expect(input).toHaveValue('abc')

    // Post-echo typing is not stomped by a stale resync.
    await user.type(input, 'def')
    expect(input).toHaveValue('abcdef')
  })
})
