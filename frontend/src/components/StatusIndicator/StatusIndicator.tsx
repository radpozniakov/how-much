import type { FC } from 'react'
import type { ConnectionStatus } from '../../lib/roomSocket'

export interface StatusIndicatorProps {
  status: ConnectionStatus
}

const LABELS: Record<ConnectionStatus, string> = {
  connecting: 'connecting…',
  live: 'live',
  reconnecting: 'reconnecting…',
  rejected: 'disconnected',
}

// Plain text, no chrome: it is one segment of the header's `code | live |
// actions` strip, where the separators do the framing. The word alone ("live")
// does not say what it describes, so the meaning rides along as a hover title
// and an accessible label rather than as visible caption text.
export const StatusIndicator: FC<StatusIndicatorProps> = ({ status }) => (
  <span
    className={`status status--${status}`}
    title="Connection status"
    aria-label={`Connection status: ${LABELS[status]}`}
  >
    {LABELS[status]}
  </span>
)
