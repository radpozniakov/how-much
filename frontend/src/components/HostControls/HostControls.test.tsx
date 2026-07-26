import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { HostVotingToggle, RevealButton } from './HostControls'

const revealBtn = () => screen.getByRole('button')
const hostVotingCheckbox = () =>
  screen.getByRole('checkbox', { name: /i'm voting/i })

describe('RevealButton', () => {
  it('shows "Reveal cards" and calls onReveal when not revealed', () => {
    const onReveal = vi.fn()
    render(
      <RevealButton revealed={false} onReveal={onReveal} onReset={() => {}} />,
    )
    expect(revealBtn()).toHaveTextContent(/reveal cards/i)
    fireEvent.click(revealBtn())
    expect(onReveal).toHaveBeenCalled()
  })

  it('shows "New voting" and calls onReset when revealed', () => {
    const onReset = vi.fn()
    render(
      <RevealButton revealed={true} onReveal={() => {}} onReset={onReset} />,
    )
    expect(revealBtn()).toHaveTextContent(/new voting/i)
    fireEvent.click(revealBtn())
    expect(onReset).toHaveBeenCalled()
  })

  it('is disabled when the socket is not live', () => {
    render(
      <RevealButton
        revealed={false}
        disabled
        onReveal={() => {}}
        onReset={() => {}}
      />,
    )
    expect(revealBtn()).toBeDisabled()
  })
})

describe('HostVotingToggle', () => {
  it('reflects hostVoting as checked', () => {
    render(
      <HostVotingToggle
        revealed={false}
        hostVoting={true}
        onSetHostVoting={() => {}}
      />,
    )
    expect(hostVotingCheckbox()).toBeChecked()
  })

  it('reflects hostVoting as unchecked', () => {
    render(
      <HostVotingToggle
        revealed={false}
        hostVoting={false}
        onSetHostVoting={() => {}}
      />,
    )
    expect(hostVotingCheckbox()).not.toBeChecked()
  })

  it('toggles hostVoting with the negation (true -> false)', () => {
    const onSetHostVoting = vi.fn()
    render(
      <HostVotingToggle
        revealed={false}
        hostVoting={true}
        onSetHostVoting={onSetHostVoting}
      />,
    )
    fireEvent.click(hostVotingCheckbox())
    expect(onSetHostVoting).toHaveBeenCalledWith(false)
  })

  it('toggles hostVoting with the negation (false -> true)', () => {
    const onSetHostVoting = vi.fn()
    render(
      <HostVotingToggle
        revealed={false}
        hostVoting={false}
        onSetHostVoting={onSetHostVoting}
      />,
    )
    fireEvent.click(hostVotingCheckbox())
    expect(onSetHostVoting).toHaveBeenCalledWith(true)
  })

  it('disables the checkbox once revealed', () => {
    render(
      <HostVotingToggle
        revealed={true}
        hostVoting={false}
        onSetHostVoting={() => {}}
      />,
    )
    expect(hostVotingCheckbox()).toBeDisabled()
  })

  it('disables the checkbox when the socket is not live', () => {
    render(
      <HostVotingToggle
        revealed={false}
        hostVoting={false}
        disabled
        onSetHostVoting={() => {}}
      />,
    )
    expect(hostVotingCheckbox()).toBeDisabled()
  })
})
