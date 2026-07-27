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
  currentItem: string | null
  revealed: boolean
  votesCast: number
  totalVoters: number
  isHost?: boolean
  disabled?: boolean
  onSetTopic?: (topic: string | null) => void
  statusControl?: ReactNode
}

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

  const [prevItem, setPrevItem] = useState(currentItem)
  if (currentItem !== prevItem) {
    setPrevItem(currentItem)
    setDraft(currentItem ?? '')
  }

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  const cancelRef = useRef(false)

  const autosaveTimer = useRef<number | undefined>(undefined)

  const onSetTopicRef = useRef(onSetTopic)
  useEffect(() => {
    onSetTopicRef.current = onSetTopic
  })

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
      e.preventDefault()
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      cancelRef.current = true
      e.currentTarget.blur()
    }
  }

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
