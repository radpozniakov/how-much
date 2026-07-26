import type { FC } from 'react'

export interface HostVotingToggleProps {
  hostVoting: boolean
  // Locked once the round is revealed (host can't opt in/out mid-reveal).
  revealed: boolean
  // The socket is not live (connecting / reconnecting) — control is unusable.
  disabled?: boolean
  onSetHostVoting: (voting: boolean) => void
}

// The host's "I'm voting" opt-in. Shown directly below the stage status line
// ("Voting in progress").
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
  // The socket is not live (connecting / reconnecting) — control is unusable.
  disabled?: boolean
  onReveal: () => void
  onReset: () => void
}

// A single host action below the participant cards: it reveals the round, then
// flips to resetting it once revealed.
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
