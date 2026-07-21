import type { FC } from 'react'

export interface HostControlsProps {
  revealed: boolean
  hostVoting: boolean
  // The socket is not live (connecting / reconnecting) — controls are unusable.
  disabled?: boolean
  onReveal: () => void
  onReset: () => void
  onSetHostVoting: (voting: boolean) => void
}

export const HostControls: FC<HostControlsProps> = ({
  revealed,
  hostVoting,
  disabled = false,
  onReveal,
  onReset,
  onSetHostVoting,
}) => (
  <section className="card">
    <h2>Host controls</h2>
    <div className="host-controls__row">
      <button type="button" disabled={revealed || disabled} onClick={onReveal}>
        Reveal
      </button>
      <button type="button" disabled={disabled} onClick={onReset}>
        Reset
      </button>
      <label className="host-controls__checkbox">
        <input
          type="checkbox"
          checked={hostVoting}
          disabled={revealed || disabled}
          onChange={() => onSetHostVoting(!hostVoting)}
        />
        I'm voting
      </label>
    </div>
  </section>
)
