import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FC,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { MAX_TOPIC_LENGTH } from '../../lib/limits'

export interface StageProps {
  // The round's current_item from the snapshot; null when unset.
  currentItem: string | null
  // Whether the round has been revealed — drives the status line.
  revealed: boolean
  // Votes cast among eligible voters, and the eligible-voter total (FR-17).
  votesCast: number
  totalVoters: number
  // The host gets an inline-editable title; non-hosts a read-only one.
  isHost?: boolean
  // Topic editing is locked while the socket is not live or the round is
  // revealed. Only meaningful for the host.
  disabled?: boolean
  // Host-only: commit a new topic (null clears it). Absent for non-hosts.
  onSetTopic?: (topic: string | null) => void
  // Optional slot rendered directly under the status line (e.g. the host's
  // "I'm voting" toggle). Kept generic so Stage stays decoupled from host logic.
  statusControl?: ReactNode
}

// The centered task stage (spec §Stage): a white bordered card, max-width 900px,
// showing the task title (JetBrains Mono, multi-line), a status line, and a
// vote-progress counter. For the host the title doubles as an inline topic
// editor — the title text itself is a borderless textarea styled to look
// identical to the display heading. Commit on Enter or blur; Escape reverts.
export const Stage: FC<StageProps> = ({
  currentItem,
  revealed,
  votesCast,
  totalVoters,
  isHost = false,
  disabled = false,
  onSetTopic,
  statusControl,
}) => {
  const [draft, setDraft] = useState(currentItem ?? '')

  // Resync the draft when the canonical topic changes, using React's
  // adjust-state-during-render pattern (not an effect). This fires only on a
  // currentItem identity change — i.e. the host's own submit-echo coming back
  // from the server — so it never stomps the host's pre-submit typing.
  const [prevItem, setPrevItem] = useState(currentItem)
  if (currentItem !== prevItem) {
    setPrevItem(currentItem)
    setDraft(currentItem ?? '')
  }

  // Auto-grow the textarea to fit its content so the centered stage layout
  // holds across single- and multi-line topics.
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  // Set by Escape so the blur it triggers reverts instead of committing. A ref
  // (not state) because the blur handler runs in the same event, before any
  // state update from the keydown would be visible.
  const cancelRef = useRef(false)

  // Pending debounced-autosave timer, cleared on any explicit commit/cancel so
  // a stale save can't fire after the topic has already been settled.
  const autosaveTimer = useRef<number | undefined>(undefined)

  // The latest onSetTopic, read through a ref so the debounce effect below does
  // not restart its timer when the parent hands down a new callback identity.
  const onSetTopicRef = useRef(onSetTopic)
  useEffect(() => {
    onSetTopicRef.current = onSetTopic
  })

  // Commit the draft, unless a no-op (unchanged topic) or an Escape cancel.
  const commit = () => {
    window.clearTimeout(autosaveTimer.current)
    if (cancelRef.current) {
      cancelRef.current = false
      setDraft(currentItem ?? '')
      return
    }
    const trimmed = draft.trim()
    const next = trimmed === '' ? null : draft
    if (next === currentItem) return
    onSetTopic?.(next)
  }

  // Debounced autosave: when the host pauses typing but keeps focus in the
  // editor, commit the draft after 500ms — covering the case where they finish
  // the topic but never blur or press Enter. An explicit blur/Enter/Escape
  // clears this timer (via commit) so it never double-fires.
  useEffect(() => {
    if (!isHost || disabled) return
    const trimmed = draft.trim()
    const next = trimmed === '' ? null : draft
    if (next === currentItem) return
    autosaveTimer.current = window.setTimeout(() => {
      onSetTopicRef.current?.(next)
    }, 500)
    return () => window.clearTimeout(autosaveTimer.current)
  }, [draft, currentItem, disabled, isHost])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      // Enter commits (single-line topic); blur runs the commit.
      e.preventDefault()
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      cancelRef.current = true
      e.currentTarget.blur()
    }
  }

  // Whether an estimation subject has been committed. Until one is, voting is
  // blocked and the stage shows a distinct "waiting for the subject" status.
  const hasTopic = currentItem !== null && currentItem.trim() !== ''
  const status = revealed
    ? 'Votes revealed'
    : hasTopic
      ? 'Voting in progress'
      : 'Waiting for the estimation subject'

  return (
    <section className="stage" aria-label="Current task">
      {isHost ? (
        <textarea
          ref={textareaRef}
          className="stage__title stage__title--edit"
          aria-label="Topic"
          placeholder="Set a topic to start the round…"
          value={draft}
          rows={1}
          maxLength={MAX_TOPIC_LENGTH}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
        />
      ) : currentItem ? (
        <h2 className="stage__title">{currentItem}</h2>
      ) : (
        <p className="stage__title stage__title--empty">
          Waiting for the host to set a topic…
        </p>
      )}

      <div className="stage__meta">
        <span className="stage__status">{status}</span>
        {statusControl}
        {hasTopic && !revealed && (
          <span className="stage__counter counter">
            {votesCast}/{totalVoters}
          </span>
        )}
      </div>
    </section>
  )
}
