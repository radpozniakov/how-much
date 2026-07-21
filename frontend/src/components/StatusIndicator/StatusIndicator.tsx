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

export const StatusIndicator: FC<StatusIndicatorProps> = ({ status }) => (
  <span className={`status status--${status}`}>{LABELS[status]}</span>
)
