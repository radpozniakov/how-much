import { useEffect, useRef, useState } from 'react'
import type { FC, KeyboardEvent, ReactNode } from 'react'
import type { ConnectionStatus } from '../../lib/roomSocket'
import { MAX_DISPLAY_NAME_LENGTH } from '../../lib/limits'
import { StatusIndicator } from '../StatusIndicator/StatusIndicator'
import { CopyIcon, ExitIcon } from '../icons'

export interface RoomHeaderProps {
  code: string
  participantName: string
  onRename: (name: string) => void
  onExit: () => void
  status: ConnectionStatus
  participantsMenu?: ReactNode
}

export const RoomHeader: FC<RoomHeaderProps> = ({
  code,
  participantName,
  onRename,
  onExit,
  status,
  participantsMenu,
}) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  )
  const nameRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (participantsMenu) return
    if (document.activeElement === document.body) nameRef.current?.focus()
  }, [participantsMenu])

  const canRename = status === 'live'
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(participantName)
  const cancelRef = useRef(false)

  function beginEdit() {
    if (!canRename) return
    setDraft(participantName)
    setIsEditing(true)
  }

  function commit() {
    setIsEditing(false)
    if (cancelRef.current) {
      cancelRef.current = false
      return
    }
    const trimmed = draft.trim()
    if (trimmed === '' || trimmed === participantName) return
    onRename(trimmed)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      cancelRef.current = true
      e.currentTarget.blur()
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}/room/${code}`
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const scratch = document.createElement('textarea')
        scratch.value = url
        document.body.appendChild(scratch)
        scratch.select()
        try {
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          if (!document.execCommand('copy')) throw new Error('Copy failed')
        } finally {
          document.body.removeChild(scratch)
        }
      }
      setCopyStatus('copied')
      window.setTimeout(() => setCopyStatus('idle'), 1500)
    } catch {
      setCopyStatus('failed')
      window.setTimeout(() => setCopyStatus('idle'), 3000)
    }
  }

  return (
    <header className="room-header">
      <div className="room-header__lead">
        <h1 className="room-header__code">{code}</h1>
        <span className="room-header__sep" aria-hidden="true" />
        <StatusIndicator status={status} />
        <span className="room-header__sep" aria-hidden="true" />
        <div className="room-header__actions">
          <button
            type="button"
            className="icon-btn"
            onClick={copyLink}
            aria-label="Copy room link"
            title={copyStatus === 'copied' ? 'Copied!' : 'Copy room link'}
          >
            <CopyIcon />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onExit}
            aria-label="Leave room"
            title="Leave room"
          >
            <ExitIcon />
          </button>
        </div>
        {copyStatus === 'failed' ? (
          <span className="room-header__copied" role="alert">
            Could not copy link
          </span>
        ) : (
          <span
            className="room-header__copied"
            role="status"
            aria-live="polite"
          >
            {copyStatus === 'copied' ? 'Link copied' : ''}
          </span>
        )}
      </div>

      <div className="room-header__trail">
        {isEditing ? (
          <input
            className="room-header__name room-header__name--edit"
            aria-label="Your display name"
            value={draft}
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commit}
          />
        ) : (
          <button
            type="button"
            ref={nameRef}
            className="room-header__name"
            onClick={beginEdit}
            disabled={!canRename}
            title={canRename ? 'Rename yourself' : undefined}
          >
            {participantName}
          </button>
        )}
        {participantsMenu}
      </div>
    </header>
  )
}
