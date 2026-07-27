export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export const WS_BASE_URL =
  import.meta.env.VITE_WS_BASE_URL ?? 'ws://localhost:8000'

export const roomSocketUrl = (code: string) => `${WS_BASE_URL}/ws/rooms/${code}`
