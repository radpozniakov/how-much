import { useState } from 'react'
import type { FC } from 'react'
import type { ConnectionStatus } from '../../lib/roomSocket'
import { StatusIndicator } from '../StatusIndicator/StatusIndicator'

// The two participant-view modes swapped by the header segment control. The
// stats view content itself is S18; here the control only owns the toggle.
export type RoomView = 'cards' | 'stats'

export interface RoomHeaderProps {
  // The room code — DN-D: the spec's "Room ID" is the room code, no separate id.
  code: string
  // The current participant's display name, shown bold top-right.
  participantName: string
  view: RoomView
  onViewChange: (view: RoomView) => void
  // Leave the room (clear the per-tab identity + navigate home).
  onExit: () => void
  status: ConnectionStatus
}

// Placeholder labels ("View 1 (cards)" / "View 2 (stats)") are finalized in S22.
const SEGMENTS: { value: RoomView; label: string }[] = [
  { value: 'cards', label: 'View 1 (cards)' },
  { value: 'stats', label: 'View 2 (stats)' },
]

// The room header band (spec §Room page/Header): room code + copy/exit icon
// buttons top-left, a centered segment control, and the current participant name
// top-right. Monochrome, ghost icon buttons distinguished by content only.
export const RoomHeader: FC<RoomHeaderProps> = ({
  code,
  participantName,
  view,
  onViewChange,
  onExit,
  status,
}) => {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    // The shareable deep link for this room (FR-2a); the code is embedded in it.
    const url = `${window.location.origin}/room/${code}`
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        // Non-secure contexts (http://<lan-ip>) have no navigator.clipboard;
        // fall back to a throwaway selection + execCommand for the demo.
        const scratch = document.createElement('textarea')
        scratch.value = url
        document.body.appendChild(scratch)
        scratch.select()
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        document.execCommand('copy')
        document.body.removeChild(scratch)
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Copy is a convenience; failure is non-fatal (the link is deterministic).
    }
  }

  return (
    <header className="room-header">
      <div className="room-header__lead">
        <h1 className="room-header__code">Room {code}</h1>
        <button
          type="button"
          className="icon-btn"
          onClick={copyLink}
          aria-label="Copy room link"
          title={copied ? 'Copied!' : 'Copy room link'}
        >
          <CopyIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={onExit}
          aria-label="Leave room"
          title="Leave room"
        >
          <ExitIcon />
        </button>
        <span className="room-header__copied" role="status" aria-live="polite">
          {copied ? 'Link copied' : ''}
        </span>
      </div>

      <div
        className="segment"
        role="tablist"
        aria-label="Participant view"
      >
        {SEGMENTS.map((seg) => (
          <button
            key={seg.value}
            type="button"
            role="tab"
            aria-selected={view === seg.value}
            className={`segment__item ${view === seg.value ? 'segment__item--active' : ''}`}
            onClick={() => onViewChange(seg.value)}
          >
            {seg.label}
          </button>
        ))}
      </div>

      <div className="room-header__trail">
        <span className="room-header__name">{participantName}</span>
        <StatusIndicator status={status} />
      </div>
    </header>
  )
}

// Minimal outline glyphs (spec §Icon buttons); currentColor keeps them monochrome.
const CopyIcon: FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
)

const ExitIcon: FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5" />
    <path d="M21 12H9" />
  </svg>
)
