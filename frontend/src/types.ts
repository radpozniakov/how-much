export interface Participant {
  id: string
  name: string
  has_voted: boolean
}

export interface ResultsView {
  votes: Record<string, string>
  average: number | null
  consensus: boolean
}

export interface RoomView {
  code: string
  deck: string[]
  host_id: string | null
  participants: Participant[]
  current_item: string | null
  host_voting: boolean
  revealed: boolean
  results: ResultsView | null
}

export type ServerFrame =
  | { type: 'room_state'; room: RoomView }
  | { type: 'error'; reason: string; message: string }

export interface CastVoteFrame {
  type: 'cast_vote'
  card: string
}

export interface SetItemFrame {
  type: 'set_item'
  topic: string | null
}

export interface SetHostVotingFrame {
  type: 'set_host_voting'
  voting: boolean
}

export interface SetNameFrame {
  type: 'set_name'
  name: string
}

export interface TransferHostFrame {
  type: 'transfer_host'
  target_id: string
}

export interface RemoveParticipantFrame {
  type: 'remove_participant'
  target_id: string
}

export interface RevealFrame {
  type: 'reveal'
}

export interface ResetFrame {
  type: 'reset'
}

export type ClientFrame =
  | { type: 'attach'; participant_id: string }
  | CastVoteFrame
  | SetItemFrame
  | SetNameFrame
  | SetHostVotingFrame
  | TransferHostFrame
  | RemoveParticipantFrame
  | RevealFrame
  | ResetFrame

export interface ApiError {
  status: number
  detail: string
}
