// The two HTTP calls the frontend makes (D-38): create a room and join one. Both
// return the caller's own participant_id — which the socket then `attach`es with,
// and which answers "am I host?". Everything else flows over the WebSocket.
import { API_URL } from '../config'
import type { ApiError, RoomView } from '../types'

interface JoinResponse {
  participant_id: string
  room: RoomView
}

interface CreateResponse extends JoinResponse {
  link: string
}

export interface JoinResult {
  participantId: string
  room: RoomView
}

export interface CreateResult extends JoinResult {
  link: string
}

/** Narrow an unknown caught value to our normalized ApiError. */
export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiError).status === 'number' &&
    typeof (value as ApiError).detail === 'string'
  )
}

/** Inline message for a failed create/join. 404/409/422 carry a useful detail;
 * 0 is a network failure. Shared by the landing and room join forms. */
export function requestErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    if (err.status === 0) return 'Could not reach the server. Try again.'
    if (err.status === 404) return 'No room with that code.'
    return err.detail // 409 (capacity), 422 (name), etc.
  }
  return 'Something went wrong. Try again.'
}

// The backend sends either {detail: "msg"} (domain errors: 404/409) or
// {detail: [{loc, msg, ...}]} (FastAPI validation: 422). Flatten both to a
// single human string so the UI never renders "[object Object]".
function normalizeDetail(body: unknown): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail.length > 0) {
      const first: unknown = detail[0]
      if (first && typeof first === 'object' && 'msg' in first) {
        const msg = (first as { msg: unknown }).msg
        if (typeof msg === 'string') return msg
      }
    }
  }
  return 'Request failed.'
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    const err: ApiError = { status: 0, detail: 'Could not reach the server.' }
    throw err
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok) {
    const err: ApiError = { status: res.status, detail: normalizeDetail(data) }
    throw err
  }
  return data as T
}

export async function createRoom(name: string): Promise<CreateResult> {
  const res = await post<CreateResponse>('/rooms', { name })
  // Use the server's canonical code (uppercase, D-17), never the raw input.
  return { participantId: res.participant_id, room: res.room, link: res.link }
}

export async function joinRoom(
  code: string,
  name: string,
): Promise<JoinResult> {
  const res = await post<JoinResponse>(
    `/rooms/${encodeURIComponent(code)}/participants`,
    { name },
  )
  return { participantId: res.participant_id, room: res.room }
}
