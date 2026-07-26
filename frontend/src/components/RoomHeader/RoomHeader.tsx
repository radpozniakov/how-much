import { useEffect, useRef, useState } from 'react'
import type { FC, KeyboardEvent, ReactNode } from 'react'
import type { ConnectionStatus } from '../../lib/roomSocket'
import { MAX_DISPLAY_NAME_LENGTH } from '../../lib/limits'
import { StatusIndicator } from '../StatusIndicator/StatusIndicator'
import { CopyIcon, ExitIcon } from '../icons'

export interface RoomHeaderProps {
  // The room code — DN-D: the spec's "Room ID" is the room code, no separate id.
  code: string
  // The current participant's display name, shown bold top-right. Clicking it
  // (when live) turns it into an inline rename input.
  participantName: string
  // Commit a self-rename. The new name reaches the header + participant board via
  // the server snapshot echo, so this component holds no post-commit name state.
  onRename: (name: string) => void
  // Leave the room (clear the per-tab identity + navigate home).
  onExit: () => void
  status: ConnectionStatus
  // Optional control rendered beside the participant name. Host-only in practice
  // (the participants roster menu), but the header stays agnostic about who may
  // see it — Room decides, the same way Stage takes a `statusControl` slot.
  participantsMenu?: ReactNode
}

// The room header band (spec §Room page/Header): a `code | live | actions` strip
// top-left, hairline-separated, and the current participant name top-right. The
// participant-view segment control lives in its own section above the stage
// (ViewSwitcher). Monochrome, ghost icon buttons distinguished by content only.
export const RoomHeader: FC<RoomHeaderProps> = ({
  code,
  participantName,
  onRename,
  onExit,
  status,
  participantsMenu,
}) => {
  const [copied, setCopied] = useState(false)
  const nameRef = useRef<HTMLButtonElement>(null)

  // Recover focus when the participants menu disappears from under the user.
  //
  // What breaks without this: the menu is host-only, so the snapshot confirming a
  // handover unmounts the whole control — including the button the outgoing host
  // just activated to trigger it. Removing a focused element fires no blur or
  // focusout, so nothing notices; focus silently falls to document.body and a
  // keyboard user is stranded at the document root, mid-header, with no way back
  // but Tab from the top. This slice causes that, so this slice fixes it.
  //
  // The guard is deliberately narrow: only reclaim focus when it was genuinely
  // lost. A host whose role is moved out from under them while they are typing
  // elsewhere must not have the caret yanked into the header.
  useEffect(() => {
    if (participantsMenu) return
    if (document.activeElement === document.body) nameRef.current?.focus()
  }, [participantsMenu])

  // Rename is only offered on a live socket (RoomSocket.send no-ops otherwise),
  // mirroring how the Stage topic editor is disabled off-live.
  const canRename = status === 'live'
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(participantName)
  // Set by Escape so the blur it triggers reverts instead of committing (the
  // same pattern as the Stage editor). A ref because the blur handler runs in
  // the same event, before a keydown state update would be visible.
  const cancelRef = useRef(false)

  function beginEdit() {
    if (!canRename) return
    setDraft(participantName)
    setIsEditing(true)
  }

  // Commit the draft unless it's an Escape cancel, blank, or unchanged. The
  // display name updates from the server echo, so we only leave edit mode here.
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
      e.currentTarget.blur() // blur runs commit
    } else if (e.key === 'Escape') {
      cancelRef.current = true
      e.currentTarget.blur()
    }
  }

  async function copyLink() {
    // The shareable deep link for this room (FR-2a); the code is embedded in it.
    const url = `${window.location.origin}/room/${code}`
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        // Non-secure contexts (http://<lan-ip>) have no navigator.clipboard;
        // fall back to a throwaway selection + execCommand for the demo.
        const scratch = document.createElement('textarea')
        scratch.value = url
        document.body.appendChild(scratch)
        scratch.select()
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        document.execCommand('copy')
        document.body.removeChild(scratch)
      }
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Copy is a convenience; failure is non-fatal (the link is deterministic).
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
            title={copied ? 'Copied!' : 'Copy room link'}
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
        <span className="room-header__copied" role="status" aria-live="polite">
          {copied ? 'Link copied' : ''}
        </span>
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
