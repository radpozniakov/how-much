import type { FC } from 'react'

export interface HostVotingToggleProps {
  hostVoting: boolean
  revealed: boolean
  disabled?: boolean
  onSetHostVoting: (voting: boolean) => void
}

export const HostVotingToggle: FC<HostVotingToggleProps> = ({
  hostVoting,
  revealed,
  disabled = false,
  onSetHostVoting,
}) => (
  <label className="host-voting">
    <input
      type="checkbox"
      className="checkbox"
      checked={hostVoting}
      disabled={revealed || disabled}
      onChange={() => onSetHostVoting(!hostVoting)}
    />
    I&apos;m voting
  </label>
)

export interface RevealButtonProps {
  revealed: boolean
  disabled?: boolean
  onReveal: () => void
  onReset: () => void
}

export const RevealButton: FC<RevealButtonProps> = ({
  revealed,
  disabled = false,
  onReveal,
  onReset,
}) => (
  <div className="host-reveal">
    <button
      type="button"
      className="host-reveal__btn"
      disabled={disabled}
      onClick={revealed ? onReset : onReveal}
    >
      {revealed ? 'New voting' : 'Reveal cards'}
    </button>
  </div>
)
