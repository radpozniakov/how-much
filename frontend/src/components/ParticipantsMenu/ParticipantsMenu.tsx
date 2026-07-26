import { useEffect, useId, useRef, useState } from 'react'
import type { FC, FocusEvent } from 'react'
import type { Participant } from '../../types'
import { UsersIcon } from '../icons'

export interface ParticipantsMenuProps {
  // Every participant in the room — including an opted-out host, who is absent
  // from the card grid (FR-17) but is still in the room and belongs in this list.
  participants: Participant[]
  // The viewer's own participant id; their row is tagged "me".
  currentParticipantId: string
}

// The host's roster control: a users icon beside their name in the header that
// opens a panel listing everyone in the room. This iteration RENDERS ONLY — the
// rows are plain text, not actions. It exists as the anchor for the per-row host
// actions planned next (delegate host, kick), which are new *functional* behavior
// and need backend frames plus a decision entry before they can be built.
export const ParticipantsMenu: FC<ParticipantsMenuProps> = ({
  participants,
  currentParticipantId,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // The panel is named by its visible title instead of a duplicate aria-label:
  // ParticipantGrid is already a list labelled "Participants", so a second
  // "Participants" label here would leave two identically-named regions.
  const titleId = useId()
  const panelId = useId()

  // Move focus into the panel on open. Without this the panel holds nothing
  // focusable, so a screen-reader user hears "expanded" and then has to hunt for
  // the content with the virtual cursor — and Tab would walk straight past it,
  // leaving an open panel behind. It also makes the Escape restore below real
  // rather than a no-op on an already-focused trigger.
  useEffect(() => {
    if (isOpen) panelRef.current?.focus()
  }, [isOpen])

  // Dismissal, only wired while open: Escape returns focus to the trigger so a
  // keyboard user is not dropped at the document root; an outside press just
  // closes, since the pointer has already moved focus itself.
  useEffect(() => {
    if (!isOpen) return

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setIsOpen(false)
      triggerRef.current?.focus()
    }

    // pointerdown, not click: the panel must not survive a press that starts
    // elsewhere. The trigger itself is inside rootRef, so its own press falls
    // through to onClick, which toggles the panel shut.
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [isOpen])

  // Tabbing out of the control dismisses it, matching the standard disclosure
  // pattern. Escape's own focus hand-off stays inside the root, so it does not
  // trip this; a null relatedTarget (focus left for the document) closes too.
  function handleBlur(e: FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget)) setIsOpen(false)
  }

  return (
    <div className="participants-menu" ref={rootRef} onBlur={handleBlur}>
      <button
        type="button"
        ref={triggerRef}
        className="icon-btn"
        aria-label="Room participants"
        title="Room participants"
        // No aria-haspopup: "true" is synonymous with "menu", which would promise
        // the menu semantics this panel deliberately does not have yet (see the
        // role="group" note below). aria-expanded + aria-controls describe it
        // honestly. aria-controls is omitted while closed so it never dangles.
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={() => setIsOpen((open) => !open)}
      >
        <UsersIcon />
      </button>

      {isOpen && (
        // role="group", not role="menu": menu semantics promise focusable
        // menuitems, and these rows are still inert text. The role tightens to
        // menu when the host actions land.
        <div
          className="participants-menu__panel"
          id={panelId}
          ref={panelRef}
          tabIndex={-1}
          role="group"
          aria-labelledby={titleId}
        >
          <p className="participants-menu__title">
            {/* The id sits on this span, not the <p>: including the count would
                make the group's accessible name "Participants 3", which is only
                a digit away from the grid's "Participants". */}
            <span id={titleId}>Participants</span>
            <span
              className="participants-menu__count"
              aria-label={`${participants.length} in the room`}
            >
              {participants.length}
            </span>
          </p>
          <ul className="participants-menu__list">
            {participants.map((p) => (
              <li key={p.id} className="participants-menu__item">
                <span className="participants-menu__name">{p.name}</span>
                {p.id === currentParticipantId && (
                  <span className="participants-menu__badge">me</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
