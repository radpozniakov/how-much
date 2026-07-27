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

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiError).status === 'number' &&
    typeof (value as ApiError).detail === 'string'
  )
}

export function requestErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    if (err.status === 0) return 'Could not reach the server. Try again.'
    if (err.status === 404) return 'No room with that code.'
    return err.detail
  }
  return 'Something went wrong. Try again.'
}

function normalizeDetail(body: unknown): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail.length > 0) {
      const first: unknown = detail[0]
      if (first && typeof first === 'object' && 'msg' in first) {
        const msg = (first as { msg: unknown }).msg
        if (typeof msg === 'string') return msg.replace(/^Value error, /, '')
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

export async function createRoom(
  name: string,
  cards = '',
): Promise<CreateResult> {
  const res = await post<CreateResponse>('/rooms', {
    name,
    cards: cards.trim() || null,
  })
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
