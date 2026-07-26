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
  // The room's card values in the host's order (FR-22/D-48), chosen at creation
  // and fixed for the room's life. Riding the snapshot is how it reaches clients:
  // VoteDeck renders this, not the lib/deck.ts constant, and a reconnecting
  // participant gets it for free — session.ts persists nothing new.
  deck: string[]
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
  // A card as a string (e.g. '5'), matching the backend frame. It must be one of
  // the values in the snapshot's `RoomView.deck` — which since V4 is the room's
  // own, host-chosen deck, not a client-side constant. Validated server-side
  // against `Room.deck` (InvalidCard).
  card: string
}

// The four host/round frames (S9). Like CastVoteFrame they carry NO
// participant_id — the socket fixed the caller's identity at handshake. Each
// mirrors the authoritative backend frame in messages.py.
export interface SetItemFrame {
  type: 'set_item'
  // The topic, or null/blank to clear it. Bounded to MAX_TOPIC_LENGTH
  // (lib/limits.ts) client-side so an over-long set_item can't be produced.
  topic: string | null
}

export interface SetHostVotingFrame {
  type: 'set_host_voting'
  voting: boolean
}

// Self-service rename (not host-gated). Like the other round frames it carries
// NO participant_id — the socket fixed the caller's identity at handshake, so the
// server renames the connected participant, never someone else. Mirrors the
// authoritative backend SetNameFrame in messages.py.
export interface SetNameFrame {
  type: 'set_name'
  // The new display name. Bounded to MAX_DISPLAY_NAME_LENGTH (lib/limits.ts)
  // client-side; trimmed + validated server-side (messages.py SetNameFrame).
  name: string
}

// Hand the host role to another participant (FR-20/D-45). Like every other round
// frame it carries NO actor id — the socket fixed the caller's identity at
// handshake, so the server attributes the handover to whoever is connected. That is
// the same anti-spoofing property D-42 documents for set_name, and it matters more
// here: this frame moves authority durably rather than mutating a round.
//
// The field is `target_id`, not `participant_id`, so it can never be misread as the
// actor id that round frames pointedly omit. Mirrors the backend TransferHostFrame.
export interface TransferHostFrame {
  type: 'transfer_host'
  // A participant id from the current snapshot. Validated server-side against
  // room.participants (not_in_room) and against self-targeting (cannot_target_self).
  target_id: string
}

// Remove another participant from the room (FR-21/D-47). The same shape as
// TransferHostFrame, deliberately: they are the room-control pair, host-on-
// participant rather than host-on-round, and both carry a target and no actor id.
//
// Not a ban (D-15) — the removed person still holds the room code and may rejoin as
// a fresh participant. Validated server-side against room.participants
// (not_in_room) and against self-targeting (cannot_target_self); a host who wants
// out hands over instead. Mirrors the backend RemoveParticipantFrame.
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

// Client -> server frames. The frontend only ever attaches (D-38): it learns its
// own participant_id over HTTP, so it never uses the socket-native `join`.
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

// A normalized HTTP error. `detail` is always a rendered string (the backend
// sends either a string or a validation-error list — api.ts flattens both).
export interface ApiError {
  status: number
  detail: string
}
