// Runtime endpoints for the backend. Vite inlines VITE_* env at dev-server /
// build start; docker-compose sets these for the container. Defaults target the
// host-published ports, so `npm run dev` on the host works with no .env.
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

// WebSocket *base* (scheme + host, no path). The room socket path is appended
// per-room via roomSocketUrl below. This is a base — not a full endpoint — so a
// stale value can't silently double the path; the T1 `/ws` echo is retired (S10).
export const WS_BASE_URL =
  import.meta.env.VITE_WS_BASE_URL ?? 'ws://localhost:8000'

// The per-room socket endpoint (backend: app/rooms/ws.py `/ws/rooms/{code}`).
export const roomSocketUrl = (code: string) => `${WS_BASE_URL}/ws/rooms/${code}`
