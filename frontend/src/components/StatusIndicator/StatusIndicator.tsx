import type { FC } from 'react'
import type { ConnectionStatus } from '../../lib/roomSocket'
import styles from './StatusIndicator.module.css'

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
  <span className={`${styles.status} ${styles[status]}`}>{LABELS[status]}</span>
)
