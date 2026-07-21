import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Topic } from './Topic'

// Topic is the host-only inline editor (S9); non-hosts read the topic from the
// Stage (S14), so this component no longer has a read-only variant to test.
describe('Topic', () => {
  it('seeds the host input from the current item', () => {
    render(<Topic currentItem="Login page" />)
    expect(screen.getByRole('textbox', { name: /topic/i })).toHaveValue(
      'Login page',
    )
  })

  it('submits the typed topic when the "Set topic" button is clicked', async () => {
    const user = userEvent.setup()
    const onSetTopic = vi.fn()
    render(<Topic currentItem={null} onSetTopic={onSetTopic} />)

    const input = screen.getByRole('textbox', { name: /topic/i })
    await user.type(input, 'New topic')
    await user.click(screen.getByRole('button', { name: /set topic/i }))

    expect(onSetTopic).toHaveBeenCalledWith('New topic')
  })

  it('submits the typed topic when Enter is pressed in the input', async () => {
    const user = userEvent.setup()
    const onSetTopic = vi.fn()
    render(<Topic currentItem={null} onSetTopic={onSetTopic} />)

    const input = screen.getByRole('textbox', { name: /topic/i })
    await user.type(input, 'New topic{Enter}')

    expect(onSetTopic).toHaveBeenCalledWith('New topic')
  })

  it('does not submit on blur', async () => {
    const user = userEvent.setup()
    const onSetTopic = vi.fn()
    render(
      <>
        <Topic currentItem={null} onSetTopic={onSetTopic} />
        <button type="button">elsewhere</button>
      </>,
    )

    const input = screen.getByRole('textbox', { name: /topic/i })
    await user.type(input, 'New topic')
    await user.click(screen.getByRole('button', { name: /elsewhere/i }))

    expect(onSetTopic).not.toHaveBeenCalled()
  })

  it('submits null on an empty or blank topic', async () => {
    const user = userEvent.setup()
    const onSetTopic = vi.fn()
    render(<Topic currentItem={null} onSetTopic={onSetTopic} />)

    const input = screen.getByRole('textbox', { name: /topic/i })
    expect(input).not.toBeRequired()

    await user.type(input, '   ')
    await user.click(screen.getByRole('button', { name: /set topic/i }))

    expect(onSetTopic).toHaveBeenCalledWith(null)
  })

  it('caps the input at MAX_TOPIC_LENGTH', () => {
    render(<Topic currentItem={null} />)
    expect(screen.getByRole('textbox', { name: /topic/i })).toHaveAttribute(
      'maxLength',
      '200',
    )
  })

  it('disables the input and button when disabled', () => {
    render(<Topic currentItem={null} disabled />)
    expect(screen.getByRole('textbox', { name: /topic/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /set topic/i })).toBeDisabled()
  })

  it('resyncs the field when currentItem changes', () => {
    const { rerender } = render(<Topic currentItem="Old topic" />)
    expect(screen.getByRole('textbox', { name: /topic/i })).toHaveValue(
      'Old topic',
    )

    rerender(<Topic currentItem="New topic" />)
    expect(screen.getByRole('textbox', { name: /topic/i })).toHaveValue(
      'New topic',
    )
  })

  it('does not stomp typing that happens after the submit echo', async () => {
    const user = userEvent.setup()
    const onSetTopic = vi.fn()
    const { rerender } = render(
      <Topic currentItem={null} onSetTopic={onSetTopic} />,
    )

    const input = screen.getByRole('textbox', { name: /topic/i })
    await user.type(input, 'abc')
    await user.click(screen.getByRole('button', { name: /set topic/i }))
    expect(onSetTopic).toHaveBeenCalledWith('abc')

    // The server echoes the submitted topic back as the new currentItem.
    rerender(<Topic currentItem="abc" onSetTopic={onSetTopic} />)

    await user.type(input, 'def')
    expect(input).toHaveValue('abcdef')
  })
})
