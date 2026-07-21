// A controllable WebSocket stand-in for tests — jsdom has no WebSocket. The
// RoomSocket only uses send/close and the onopen/onmessage/onclose handler
// slots, so this mimics exactly that surface. Install it with
// `vi.stubGlobal('WebSocket', MockWebSocket)` and drive it via the helpers.
export class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  sent: string[] = []
  closed = false

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.closed = true
  }
}

/** The most recently constructed socket (the one RoomSocket is driving). */
export function lastSocket(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1]
}

/** Deliver a server frame to a socket's onmessage handler. */
export function deliver(ws: MockWebSocket, frame: unknown) {
  ws.onmessage?.({ data: JSON.stringify(frame) })
}
