// The client-side mirror of the backend room contract. These shapes must match
// the server DTOs (backend/app/rooms/views.py) and WS envelope
// (backend/app/rooms/messages.py) — the snapshot is the single source of truth
// the UI renders (D-36).

export interface Participant {
  id: string
  name: string
  // Presence only — the card value is never exposed before reveal (FR-10).
  has_voted: boolean
}

export interface ResultsView {
  // participant_id -> card. Populated only for a revealed round.
  votes: Record<string, string>
  average: number | null
  consensus: boolean
}

export interface RoomView {
  code: string
  // Null during the transient empty / host-transfer window.
  host_id: string | null
  participants: Participant[]
  current_item: string | null
  host_voting: boolean
  revealed: boolean
  // Present only once revealed; null hides all card values pre-reveal (FR-10).
  results: ResultsView | null
}

// Server -> client frames (backend room_state_frame / error_frame).
export type ServerFrame =
  | { type: 'room_state'; room: RoomView }
  | { type: 'error'; reason: string; message: string }

// A round action sent over an established socket. Round frames carry NO
// participant_id: the socket fixed the caller's identity at handshake (backend
// messages.py), so the server attributes the action to the connection.
export interface CastVoteFrame {
  type: 'cast_vote'
  // A Fibonacci card as a string (e.g. '5'), matching the backend frame. The
  // deck is FIBONACCI_DECK (lib/deck.ts); validated server-side (InvalidCard).
  card: string
}

// Client -> server frames. The frontend only ever attaches (D-38): it learns its
// own participant_id over HTTP, so it never uses the socket-native `join`.
export type ClientFrame =
  { type: 'attach'; participant_id: string } | CastVoteFrame
// S9 will add: SetItemFrame | SetHostVotingFrame | RevealFrame | ResetFrame

// A normalized HTTP error. `detail` is always a rendered string (the backend
// sends either a string or a validation-error list — api.ts flattens both).
export interface ApiError {
  status: number
  detail: string
}
