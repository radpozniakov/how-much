// Runtime endpoints for the backend. Vite inlines VITE_* env at dev-server /
// build start; docker-compose sets these for the container. Defaults target the
// host-published ports, so `npm run dev` on the host works with no .env.
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
export const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000/ws'
