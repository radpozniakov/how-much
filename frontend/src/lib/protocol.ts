import type { Participant, ResultsView, RoomView, ServerFrame } from '../types'

interface JoinResponse {
  participant_id: string
  room: RoomView
}

interface CreateResponse extends JoinResponse {
  link: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null
}

function isParticipant(value: unknown): value is Participant {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.has_voted === 'boolean'
  )
}

function isResultsView(value: unknown): value is ResultsView {
  return (
    isRecord(value) &&
    isRecord(value.votes) &&
    Object.values(value.votes).every((vote) => typeof vote === 'string') &&
    (value.average === null ||
      (typeof value.average === 'number' && Number.isFinite(value.average))) &&
    typeof value.consensus === 'boolean'
  )
}

function isRoomView(value: unknown): value is RoomView {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    Array.isArray(value.deck) &&
    value.deck.every((card) => typeof card === 'string') &&
    isNullableString(value.host_id) &&
    Array.isArray(value.participants) &&
    value.participants.every(isParticipant) &&
    isNullableString(value.current_item) &&
    typeof value.host_voting === 'boolean' &&
    typeof value.revealed === 'boolean' &&
    (value.results === null || isResultsView(value.results))
  )
}

function invalidPayload(name: string): Error {
  return new Error(`Invalid ${name} payload`)
}

export function parseRoomView(value: unknown): RoomView {
  if (!isRoomView(value)) throw invalidPayload('room')
  return value
}

export function parseServerFrame(value: unknown): ServerFrame {
  if (!isRecord(value)) throw invalidPayload('server frame')

  if (value.type === 'room_state' && isRoomView(value.room)) {
    return { type: 'room_state', room: value.room }
  }
  if (
    value.type === 'error' &&
    typeof value.reason === 'string' &&
    typeof value.message === 'string'
  ) {
    return { type: 'error', reason: value.reason, message: value.message }
  }

  throw invalidPayload('server frame')
}

export function parseJoinResponse(value: unknown): JoinResponse {
  if (
    !isRecord(value) ||
    typeof value.participant_id !== 'string' ||
    !isRoomView(value.room)
  ) {
    throw invalidPayload('join response')
  }
  return { participant_id: value.participant_id, room: value.room }
}

export function parseCreateResponse(value: unknown): CreateResponse {
  if (
    !isRecord(value) ||
    typeof value.participant_id !== 'string' ||
    !isRoomView(value.room) ||
    typeof value.link !== 'string'
  ) {
    throw invalidPayload('create response')
  }
  return {
    participant_id: value.participant_id,
    room: value.room,
    link: value.link,
  }
}
