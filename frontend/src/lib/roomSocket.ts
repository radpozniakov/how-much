// The typed WebSocket client for one room. It lives OUTSIDE React (a plain
// class) and exposes an external store consumed via useSyncExternalStore — so
// StrictMode double-effects and re-renders can't spawn duplicate connections.
//
// The last room_state snapshot is the single source of truth (D-36): the store
// holds it and the UI renders it verbatim.
//
// getSnapshot() MUST return a cached, stable reference. `this.state` is replaced
// (a NEW object) only inside setState(); getSnapshot returns it unchanged
// otherwise. Building a fresh object per getSnapshot() call would make
// useSyncExternalStore loop forever ("getSnapshot should be cached") — a runtime
// crash the type-checker cannot catch (guarded by a unit test).
import { roomSocketUrl } from '../config'
import type { ClientFrame, RoomView, ServerFrame } from '../types'

const RECONNECT_DELAY_MS = 1000

// Error slugs that end the session outright, whatever phase they arrive in.
//
// Terminality here is otherwise **phase-based**, and for good reason (see
// `hasSnapshot`): a close before any snapshot is a handshake rejection, a close
// after one is a retryable drop, and mid-session errors don't close the socket at
// all. `removed` (FR-21/D-47) is the first frame that breaks that correspondence —
// it arrives mid-session, after a snapshot, and the server closes right behind it.
//
// Without naming it, the phase rule would send the removed client into a reconnect:
// one second of "reconnecting", then an `attach` the server refuses because the id
// is no longer a member, and the honest "the host removed you" would be overwritten
// by a misleading "not in this room". So the slug is checked explicitly, and this
// set is the only place terminality is not inferred from the connection phase.
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
  // Phase flag: a snapshot has arrived on THIS connection. Drives terminality —
  // a close before any snapshot is a handshake rejection (terminal); a close
  // after one is a live-phase drop (retryable). Not slug-based, because S8/S9
  // mid-session errors don't close the socket.
  private hasSnapshot = false
  // A TERMINAL_ERROR_REASONS frame has arrived on this connection, so the close
  // behind it must not be retried. Separate from `closedByClient` because that flag
  // means "we tore this down and want no status churn"; this one means "the server
  // ended it and the reason is already on screen".
  private terminal = false
  private closedByClient = false
  private pendingError: SocketError | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private readonly listeners = new Set<() => void>()

  // The cached snapshot — see the file header. Replaced only in setState().
  private state: RoomState = { room: null, status: 'connecting', error: null }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): RoomState => this.state

  /**
   * Send a client frame over the socket. A no-op (no throw, no queue) unless the
   * socket is `live` — a frame produced during handshake or a reconnect is
   * dropped, because the deck that produces it is disabled off-`live` anyway and
   * the user's next click is the resend. `this.state.status` is the atomically-
   * updated instance field (never React-stale in a class method).
   */
  send = (frame: ClientFrame): void => {
    if (this.ws === null || this.state.status !== 'live') return
    this.ws.send(JSON.stringify(frame))
  }

  private setState(next: Partial<RoomState>): void {
    this.state = { ...this.state, ...next }
    for (const listener of this.listeners) listener()
  }

  /** Open (or re-open) the socket for a participant already known to the room. */
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
        // Rejected on the frame, not on the close that follows it. Deliberately not
        // stashed in `pendingError` the way a handshake rejection is: this way the
        // reason reaches the screen even if the close is delayed or never arrives,
        // and `send` (which gates on `status === 'live'`) stops accepting frames for
        // a room this client is no longer in from the moment it is told so.
        this.terminal = true
        this.setState({ status: 'rejected', error: err })
      } else if (this.hasSnapshot) {
        // Live phase: a rejected action (e.g. non-host reveal). Non-fatal —
        // surface it to the acting user and keep the socket open.
        this.setState({ error: err })
      } else {
        // Handshake phase: the server sends the error, then closes. Stash the
        // reason so handleClose can report the terminal rejection.
        this.pendingError = err
      }
    }
  }

  private handleClose(): void {
    this.ws = null
    if (this.closedByClient) return
    // A terminal error already set the state and named the reason; the close is the
    // expected sequel to it, so there is nothing to report and nothing to retry.
    if (this.terminal) return
    if (!this.hasSnapshot) {
      // Terminal: the attach was rejected (unknown/stale id, missing room).
      this.setState({ status: 'rejected', error: this.pendingError })
    } else {
      // A live connection dropped — retry.
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

  /** Client-initiated close (unmount). Suppresses reconnect and status churn. */
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
