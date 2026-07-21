import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { HostControls } from './HostControls'

const reveal = () => screen.getByRole('button', { name: /reveal/i })
const reset = () => screen.getByRole('button', { name: /reset/i })
const hostVotingCheckbox = () =>
  screen.getByRole('checkbox', { name: /i'm voting/i })

describe('HostControls', () => {
  it('calls onReveal when Reveal is clicked', () => {
    const onReveal = vi.fn()
    render(
      <HostControls
        revealed={false}
        hostVoting={false}
        onReveal={onReveal}
        onReset={() => {}}
        onSetHostVoting={() => {}}
      />,
    )
    fireEvent.click(reveal())
    expect(onReveal).toHaveBeenCalled()
  })

  it('calls onReset when Reset is clicked', () => {
    const onReset = vi.fn()
    render(
      <HostControls
        revealed={false}
        hostVoting={false}
        onReveal={() => {}}
        onReset={onReset}
        onSetHostVoting={() => {}}
      />,
    )
    fireEvent.click(reset())
    expect(onReset).toHaveBeenCalled()
  })

  it('reflects hostVoting as checked', () => {
    render(
      <HostControls
        revealed={false}
        hostVoting={true}
        onReveal={() => {}}
        onReset={() => {}}
        onSetHostVoting={() => {}}
      />,
    )
    expect(hostVotingCheckbox()).toBeChecked()
  })

  it('reflects hostVoting as unchecked', () => {
    render(
      <HostControls
        revealed={false}
        hostVoting={false}
        onReveal={() => {}}
        onReset={() => {}}
        onSetHostVoting={() => {}}
      />,
    )
    expect(hostVotingCheckbox()).not.toBeChecked()
  })

  it('toggles hostVoting with the negation (true -> false)', () => {
    const onSetHostVoting = vi.fn()
    render(
      <HostControls
        revealed={false}
        hostVoting={true}
        onReveal={() => {}}
        onReset={() => {}}
        onSetHostVoting={onSetHostVoting}
      />,
    )
    fireEvent.click(hostVotingCheckbox())
    expect(onSetHostVoting).toHaveBeenCalledWith(false)
  })

  it('toggles hostVoting with the negation (false -> true)', () => {
    const onSetHostVoting = vi.fn()
    render(
      <HostControls
        revealed={false}
        hostVoting={false}
        onReveal={() => {}}
        onReset={() => {}}
        onSetHostVoting={onSetHostVoting}
      />,
    )
    fireEvent.click(hostVotingCheckbox())
    expect(onSetHostVoting).toHaveBeenCalledWith(true)
  })

  it('disables Reveal and the checkbox but not Reset once revealed', () => {
    render(
      <HostControls
        revealed={true}
        hostVoting={false}
        onReveal={() => {}}
        onReset={() => {}}
        onSetHostVoting={() => {}}
      />,
    )
    expect(reveal()).toBeDisabled()
    expect(hostVotingCheckbox()).toBeDisabled()
    expect(reset()).not.toBeDisabled()
  })

  it('disables Reveal, Reset, and the checkbox when disabled (socket not live)', () => {
    render(
      <HostControls
        revealed={false}
        hostVoting={false}
        disabled
        onReveal={() => {}}
        onReset={() => {}}
        onSetHostVoting={() => {}}
      />,
    )
    expect(reveal()).toBeDisabled()
    expect(reset()).toBeDisabled()
    expect(hostVotingCheckbox()).toBeDisabled()
  })
})
