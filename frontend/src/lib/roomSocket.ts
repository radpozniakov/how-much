import { roomSocketUrl } from '../config'
import type { ClientFrame, RoomView, ServerFrame } from '../types'

const RECONNECT_DELAY_MS = 1000

const TERMINAL_ERROR_REASONS: ReadonlySet<string> = new Set(['removed'])

export type ConnectionStatus =
  'connecting' | 'live' | 'reconnecting' | 'rejected'

export interface SocketError {
  reason: string
  message: string
}

export interface RoomState {
  room: RoomView | null
  status: ConnectionStatus
  error: SocketError | null
}

export class RoomSocket {
  private code = ''
  private participantId = ''
  private ws: WebSocket | null = null
  private hasSnapshot = false
  private terminal = false
  private closedByClient = false
  private pendingError: SocketError | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private readonly listeners = new Set<() => void>()

  private state: RoomState = { room: null, status: 'connecting', error: null }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): RoomState => this.state

  send = (frame: ClientFrame): void => {
    if (this.ws === null || this.state.status !== 'live') return
    this.ws.send(JSON.stringify(frame))
  }

  private setState(next: Partial<RoomState>): void {
    this.state = { ...this.state, ...next }
    for (const listener of this.listeners) listener()
  }

  open(code: string, participantId: string): void {
    this.code = code
    this.participantId = participantId
    this.closedByClient = false
    this.setState({ status: 'connecting', room: null, error: null })
    this.connect()
  }

  private connect(): void {
    this.hasSnapshot = false
    this.terminal = false
    this.pendingError = null
    const ws = new WebSocket(roomSocketUrl(this.code))
    this.ws = ws
    ws.onopen = () => {
      const frame: ClientFrame = {
        type: 'attach',
        participant_id: this.participantId,
      }
      ws.send(JSON.stringify(frame))
    }
    ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(event)
    }
    ws.onclose = () => {
      this.handleClose()
    }
  }

  private handleMessage(event: MessageEvent): void {
    let frame: ServerFrame
    try {
      frame = JSON.parse(String(event.data)) as ServerFrame
    } catch {
      return
    }
    if (frame.type === 'room_state') {
      this.hasSnapshot = true
      this.setState({ room: frame.room, status: 'live', error: null })
    } else if (frame.type === 'error') {
      const err: SocketError = { reason: frame.reason, message: frame.message }
      if (TERMINAL_ERROR_REASONS.has(frame.reason)) {
        this.terminal = true
        this.setState({ status: 'rejected', error: err })
      } else if (this.hasSnapshot) {
        this.setState({ error: err })
      } else {
        this.pendingError = err
      }
    }
  }

  private handleClose(): void {
    this.ws = null
    if (this.closedByClient) return
    if (this.terminal) return
    if (!this.hasSnapshot) {
      this.setState({ status: 'rejected', error: this.pendingError })
    } else {
      this.setState({ status: 'reconnecting' })
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    this.clearRetry()
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.connect()
    }, RECONNECT_DELAY_MS)
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  close(): void {
    this.closedByClient = true
    this.clearRetry()
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
  }
}
