import { useEffect, useId, useRef, useState } from 'react'
import type { FC, FocusEvent, KeyboardEvent } from 'react'
import type { Participant } from '../../types'
import { CheckMarkIcon, CloseIcon, CrownIcon, UsersIcon } from '../icons'

export interface ParticipantsMenuProps {
  // Every participant in the room — including an opted-out host, who is absent
  // from the card grid (FR-17) but is still in the room and belongs in this list.
  participants: Participant[]
  // The viewer's own participant id; their row is tagged "me".
  currentParticipantId: string
  // Who currently holds the role. Only used to label the host's row; authority
  // itself is enforced in the domain by `_require_host` (D-45), never here.
  hostId: string
  // Hand the role to another participant (FR-20/D-45).
  onTransferHost: (targetId: string) => void
  // Off-live: the socket drops sends anyway, so the action is disabled rather than
  // silently doing nothing (matching the topic editor and the reveal button).
  disabled?: boolean
}

// The host's roster control: a users icon beside their name in the header that
// opens a panel listing everyone in the room, with a per-row action handing the
// host role to that participant (FR-20/D-45). The action is a two-step confirm —
// handing over is irreversible from the outgoing host's side, so a single misclick
// should not strip them of their own controls mid-session.
export const ParticipantsMenu: FC<ParticipantsMenuProps> = ({
  participants,
  currentParticipantId,
  hostId,
  onTransferHost,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  // Which row is awaiting confirmation, if any. One at a time: opening a second
  // row's confirm replaces the first, so two rows can never both look armed.
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
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

  // Closing always clears any half-finished confirm, so reopening the panel never
  // shows a row still armed from last time.
  function close() {
    setIsOpen(false)
    setConfirmingId(null)
  }

  // Dismissal, only wired while open: Escape returns focus to the trigger so a
  // keyboard user is not dropped at the document root; an outside press just
  // closes, since the pointer has already moved focus itself.
  useEffect(() => {
    if (!isOpen) return

    function onKeyDown(e: KeyboardEvent | globalThis.KeyboardEvent) {
      if (e.key !== 'Escape') return
      // Layered dismissal: the confirm is the innermost layer, so the first Escape
      // cancels it and leaves the panel open; a second closes the panel. Handled
      // in THIS listener rather than a second document-level one, so there is no
      // ordering race between two subscriptions.
      if (confirmingId !== null) {
        setConfirmingId(null)
        return
      }
      close()
      triggerRef.current?.focus()
    }

    // pointerdown, not click: the panel must not survive a press that starts
    // elsewhere. The trigger itself is inside rootRef, so its own press falls
    // through to onClick, which toggles the panel shut.
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close()
    }

    document.addEventListener('keydown', onKeyDown as EventListener)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown as EventListener)
      document.removeEventListener('pointerdown', onPointerDown)
    }
    // confirmingId is load-bearing here, not incidental: without it this handler
    // closes over a stale null and Escape closes the whole panel from confirm
    // state (measured). Re-subscribing on each confirm toggle is two
    // addEventListener calls — cheap next to getting the layering wrong.
  }, [isOpen, confirmingId])

  // Tabbing out of the control dismisses it, matching the standard disclosure
  // pattern. Escape's own focus hand-off stays inside the root, so it does not
  // trip this; a null relatedTarget (focus left for the document) closes too.
  function handleBlur(e: FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget)) close()
  }

  // Arrow keys move between rows. Deliberately richer than `role="group"` implies:
  // ARIA forbids claiming a role you don't implement, not adding affordances beyond
  // one (D-46). No roving tabindex — every action button stays normally tabbable, so
  // Tab traversal and the tab-out-closes behaviour above both keep working natively.
  function handlePanelKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const actions = Array.from(
      panelRef.current?.querySelectorAll<HTMLButtonElement>(
        '[data-row-action]:not([disabled])',
      ) ?? [],
    )
    if (actions.length === 0) return
    e.preventDefault() // otherwise the panel scrolls instead of moving focus
    const at = actions.indexOf(document.activeElement as HTMLButtonElement)
    const step = e.key === 'ArrowDown' ? 1 : -1
    // Wraps. From the panel itself (at === -1) ArrowDown enters at the first row
    // and ArrowUp at the last, so both keys are a way in, not just a way around.
    const next =
      at === -1
        ? step === 1
          ? 0
          : actions.length - 1
        : (at + step + actions.length) % actions.length
    actions[next].focus()
  }

  // The host always sits at the top, whoever they currently are. The snapshot
  // arrives in join order (the domain's insertion order, which D-13's auto-transfer
  // depends on — so this is reordered for display here rather than server-side), and
  // after a handover the new host would otherwise be buried wherever they joined.
  // Everyone else keeps snapshot order, so rows only move when the role actually
  // moves. hostId may be '' during the transient unowned window, in which case
  // `find` misses and the list renders unchanged.
  const host = participants.find((p) => p.id === hostId)
  const ordered = host
    ? [host, ...participants.filter((p) => p.id !== hostId)]
    : participants

  function handleAction(id: string) {
    if (confirmingId !== id) {
      setConfirmingId(id)
      return
    }
    // Confirmed. Clear the row immediately: the outcome arrives either as a
    // snapshot (which unmounts this whole panel, since it is host-only) or as the
    // error banner Room already renders. Leaving a row stuck mid-confirm behind a
    // failure would be worse than resetting it.
    setConfirmingId(null)
    onTransferHost(id)
  }

  return (
    <div className="participants-menu" ref={rootRef} onBlur={handleBlur}>
      <button
        type="button"
        ref={triggerRef}
        className="icon-btn"
        aria-label="Room participants"
        title="Room participants"
        // No aria-haspopup, and now for a firmer reason than before: both possible
        // values have been considered and rejected on the record (D-46). "true" is
        // synonymous with "menu", which this panel is deliberately not — menuitem
        // cannot hold the confirm's two controls, and the menu pattern requires
        // activation to close the menu. "dialog" would promise dialog semantics it
        // equally lacks (it dismisses on tab-out rather than trapping focus). So
        // this is "not ever", not "not yet". aria-expanded + aria-controls describe
        // it honestly; aria-controls is omitted while closed so it never dangles.
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={() => (isOpen ? close() : setIsOpen(true))}
      >
        <UsersIcon />
      </button>

      {isOpen && (
        // role="group" is the terminal answer, not a placeholder (D-46). The rows
        // are actionable now, but they are buttons in a list — not menuitems — so
        // `menu` would promise semantics this panel does not implement. The
        // keyboard model above is deliberately richer than the role requires.
        <div
          className="participants-menu__panel"
          id={panelId}
          ref={panelRef}
          tabIndex={-1}
          role="group"
          aria-labelledby={titleId}
          onKeyDown={handlePanelKeyDown}
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
            {ordered.map((p) => {
              const isSelf = p.id === currentParticipantId
              const confirming = confirmingId === p.id
              return (
                <li key={p.id} className="participants-menu__item">
                  {/* The name stays a plain span, outside any button. A row-sized
                      button would swallow the name and badge into one control
                      whose accessible name is the whole row. */}
                  <span className="participants-menu__name">{p.name}</span>
                  {isSelf && (
                    <span className="participants-menu__badge">me</span>
                  )}
                  {p.id === hostId && (
                    <span className="participants-menu__badge">host</span>
                  )}
                  {!isSelf && (
                    // The action button MUST stay the same element type at the
                    // same index under the same parent across both states —
                    // measured: React then reuses the DOM node and focus survives
                    // the relabel. A confirm-only wrapper element, or differing
                    // explicit keys between states, both drop focus to
                    // document.body with no blur event to notice it, which is a
                    // silent keyboard trap. Relabelling and toggling the sibling
                    // below are the safe half of that finding.
                    <>
                      {/* Cancel renders BEFORE the action so the action keeps its
                          rightmost position across both states. Without this the
                          armed row shifts Confirm left and drops Cancel under the
                          cursor, so a mouse user clicking twice in the same place
                          cancels while the keyboard path (Enter, Enter) confirms —
                          the two input modes would disagree. A conditional sibling
                          holds a stable slot in the children array, so this does
                          not move the action button's index and focus still
                          survives the relabel. */}
                      {confirming && (
                        <button
                          type="button"
                          className="icon-btn participants-menu__row-cancel"
                          aria-label="Cancel"
                          title="Cancel"
                          onClick={() => setConfirmingId(null)}
                        >
                          <CloseIcon />
                        </button>
                      )}
                      <button
                        type="button"
                        data-row-action
                        className="icon-btn participants-menu__row-action"
                        // Icon-only, so the accessible name comes from aria-label
                        // rather than text. That keeps the relabel-in-place
                        // property: the button element itself persists across the
                        // swap and only its label and glyph change, so focus never
                        // moves. title mirrors it for a pointer tooltip, as the
                        // header's icon buttons do.
                        aria-label={confirming ? 'Confirm' : 'Make host'}
                        title={confirming ? 'Confirm' : 'Make host'}
                        disabled={disabled}
                        onClick={() => handleAction(p.id)}
                      >
                        {confirming ? <CheckMarkIcon /> : <CrownIcon />}
                      </button>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
