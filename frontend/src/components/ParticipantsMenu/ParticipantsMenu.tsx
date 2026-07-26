import { useEffect, useId, useRef, useState } from 'react'
import type { FC, FocusEvent, KeyboardEvent } from 'react'
import type { Participant } from '../../types'
import {
  CheckMarkIcon,
  CloseIcon,
  CrownIcon,
  UserMinusIcon,
  UsersIcon,
} from '../icons'

// The two host-on-participant actions a row offers (FR-20/FR-21). Named rather than
// booleans because the confirm state has to say *which* action is armed, not just
// that one is: with two buttons on a row, "armed" alone would leave the confirm
// ambiguous and could fire the wrong one.
type RowAction = 'transfer' | 'remove'

// A row plus the action armed on it. One at a time across the whole panel: arming
// anything replaces whatever was armed before, so two controls can never both look
// live and the panel always has exactly one consequential press available.
interface Armed {
  id: string
  action: RowAction
}

// A row's two button positions. Named by ordinal rather than by the action or by a
// direction: `first` holds Make host *or* Cancel and `second` holds Remove *or*
// Confirm, so any name drawn from one of those states would be a lie in the other,
// and flex order — not a class — decides which way round they read on screen.
type Slot = 'first' | 'second'

interface ActionSpec {
  idle: string
  confirm: string
  Glyph: typeof CrownIcon
  // Where this action's own button lives while the row is idle. Also where focus is
  // returned when a pending confirm for it is cancelled.
  home: Slot
}

// The two row actions: Make host in the first position, Remove in the second.
//
// Labels name their action even when armed. With two irreversible actions on one
// row, a bare "Confirm" would tell a screen-reader user that something is about to
// happen but not which of them — which is why V1's "Confirm" became "Confirm
// handover" when the second action arrived. Kept together here so S22 can settle the
// copy in one place instead of hunting through markup.
const ACTIONS: Record<RowAction, ActionSpec> = {
  transfer: {
    idle: 'Make host',
    confirm: 'Confirm handover',
    Glyph: CrownIcon,
    home: 'first',
  },
  remove: {
    idle: 'Remove from room',
    confirm: 'Confirm removal',
    // A person-minus, not a trash can: removal takes someone out of this room and
    // deletes nothing — they keep the code and can rejoin (D-15).
    Glyph: UserMinusIcon,
    home: 'second',
  },
}

// Which action each position owns while the row is idle — the inverse of `home`.
const IDLE_ACTION: Record<Slot, RowAction> = {
  first: 'transfer',
  second: 'remove',
}

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
  // Remove another participant from the room (FR-21/D-47).
  onRemoveParticipant: (targetId: string) => void
  // Off-live: the socket drops sends anyway, so the action is disabled rather than
  // silently doing nothing (matching the topic editor and the reveal button).
  disabled?: boolean
}

// The host's roster control: a users icon beside their name in the header that
// opens a panel listing everyone in the room, with two per-row actions — hand them
// the host role (FR-20/D-45) or remove them from the room (FR-21/D-47). Each is a
// two-step confirm, for the same reason from opposite directions: a handover is
// irreversible from the outgoing host's side, and a removal is irreversible from the
// removed participant's. One misclick should do neither.
export const ParticipantsMenu: FC<ParticipantsMenuProps> = ({
  participants,
  currentParticipantId,
  hostId,
  onTransferHost,
  onRemoveParticipant,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  // Which row, and which of its actions, is awaiting confirmation.
  const [armed, setArmed] = useState<Armed | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // How the pending confirm ended, read by the focus effect to decide where focus
  // belongs afterwards. A ref rather than state: it is never rendered, and it has to
  // be readable in the same commit that clears `armed`.
  const disarmedBy = useRef<'cancel' | 'confirm'>('cancel')
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
    setArmed(null)
  }

  // Call off a pending confirm without closing the panel. Every cancel path goes
  // through here — the Cancel button and the first Escape — so the focus effect can
  // tell a cancel from a confirm and restore the caret accordingly.
  function disarm() {
    disarmedBy.current = 'cancel'
    setArmed(null)
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
      if (armed !== null) {
        disarm()
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
    // `armed` is load-bearing here, not incidental: without it this handler
    // closes over a stale null and Escape closes the whole panel from confirm
    // state (measured). Re-subscribing on each confirm toggle is two
    // addEventListener calls — cheap next to getting the layering wrong.
  }, [isOpen, armed])

  // Focus follows the ACTION across a confirm swap, not the position.
  //
  // This effect is what the fixed Cancel-then-Confirm order costs, and it is not
  // optional. Because Confirm always occupies the second position, arming the *first*
  // position's action ("Make host") moves its Confirm to the other button — away from
  // the one the host just activated. Left alone, a keyboard user's second Enter would
  // land on Cancel and the handover could not be completed from the keyboard at all.
  //
  // Cancelling reverses it: focus returns to the slot that action lives in when idle.
  // Without that, Escape from an armed "Make host" would strand the caret on the
  // second position — which is "Remove from room", one Enter away from the destructive
  // action the host was not reaching for.
  //
  // Confirming is the third case and deliberately does NOT restore: the row is
  // usually about to vanish (a removal drops it; a handover unmounts this host-only
  // panel entirely), so focusing a doomed button would drop the caret to
  // document.body with no blur event to notice. Focus goes to the panel instead —
  // a node that outlives the row — and if the whole panel goes, RoomHeader's existing
  // activeElement === body guard catches it.
  const disarmed = useRef<Armed | null>(null)
  useEffect(() => {
    const previous = disarmed.current
    disarmed.current = armed
    // Opening and closing own their own focus (the panel, and the trigger); this
    // effect only moves focus while the panel stays put.
    if (!isOpen) return
    const panel = panelRef.current
    if (panel === null) return

    if (armed !== null) {
      panel.querySelector<HTMLButtonElement>('[data-row-confirm]')?.focus()
      return
    }
    if (previous === null) return // nothing was armed — e.g. the first render
    if (disarmedBy.current === 'confirm') {
      panel.focus()
      return
    }
    panel
      .querySelector<HTMLButtonElement>(
        `[data-participant-id="${previous.id}"] [data-slot="${ACTIONS[previous.action].home}"]`,
      )
      ?.focus()
  }, [armed, isOpen])

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

  function handleAction(id: string, action: RowAction) {
    // Arm on the first press of *this* action on *this* row. A press on the other
    // action, or on another row, re-arms rather than confirming — so the confirm can
    // never be inherited by a control the host did not press twice.
    if (armed?.id !== id || armed.action !== action) {
      setArmed({ id, action })
      return
    }
    // Confirmed. Clear immediately: the outcome arrives either as a snapshot (which
    // unmounts this whole panel, since it is host-only) or as the error banner Room
    // already renders. Leaving a row stuck mid-confirm behind a failure would be
    // worse than resetting it.
    disarmedBy.current = 'confirm'
    setArmed(null)
    if (action === 'transfer') onTransferHost(id)
    else onRemoveParticipant(id)
  }

  // Render one of a row's two button positions.
  //
  // A plain function that RETURNS an element, deliberately not a component: `slot()`
  // is inlined into the children array as a `<button>`, so React reconciles it
  // positionally by element type and reuses the DOM node across a relabel. A
  // component — especially one declared inside this render, which would be a fresh
  // type on every pass — would remount the node and lose focus mid-confirm.
  function slot(where: Slot, id: string, armedHere: RowAction | null) {
    // The confirm controls have FIXED positions: Cancel first, Confirm second, in
    // both actions' confirms. So which role this position plays depends only on
    // whether the row has something armed — not on which action it was.
    const role =
      armedHere === null ? 'action' : where === 'first' ? 'cancel' : 'confirm'
    // Idle, this position shows its own action; armed, the Confirm names the action
    // that is actually pending, which may be the other position's.
    const action = armedHere ?? IDLE_ACTION[where]
    const spec = ACTIONS[action]

    const label =
      role === 'cancel'
        ? 'Cancel'
        : role === 'confirm'
          ? spec.confirm
          : spec.idle
    const Glyph =
      role === 'cancel'
        ? CloseIcon
        : role === 'confirm'
          ? CheckMarkIcon
          : spec.Glyph
    return (
      <button
        type="button"
        data-row-action
        // Marks the pending Confirm so the focus effect can find it without a ref per
        // row. At most one exists in the panel, since only one row can be armed.
        data-row-confirm={role === 'confirm' ? '' : undefined}
        data-slot={where}
        className={
          `icon-btn participants-menu__row-action participants-menu__row-action--${where}` +
          // Cancel is secondary: borderless until hovered, so an armed row holds
          // exactly one emphasised control and the eye lands on the press that counts.
          (role === 'cancel' ? ' participants-menu__row-cancel' : '')
        }
        // Icon-only, so the accessible name comes from aria-label rather than text.
        // The element itself persists across every swap — only its label, glyph and
        // handler change — so nothing is ever detached from under the caret. title
        // mirrors it for a pointer tooltip, as the header's icon buttons do.
        aria-label={label}
        title={label}
        // Off-live only. There is deliberately no armed-sibling disable: while a
        // confirm is pending neither position is a dead action — one confirms and the
        // other cancels, and both must stay pressable.
        disabled={disabled}
        onClick={role === 'cancel' ? disarm : () => handleAction(id, action)}
      >
        <Glyph />
      </button>
    )
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
              const armedHere = armed?.id === p.id ? armed.action : null
              return (
                <li
                  key={p.id}
                  className="participants-menu__item"
                  // Addressable so the focus effect can find this row's slots after a
                  // cancel, without a ref per row.
                  data-participant-id={p.id}
                >
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
                    // Two fixed button slots, always both rendered, in this order:
                    // Make host, then Remove. Arming one turns it into Confirm and
                    // turns the OTHER into Cancel — so the row shows exactly one
                    // consequential control plus a way out, and the actions
                    // themselves are gone while a confirm is pending.
                    //
                    // "The armed slot keeps its own position; Cancel takes the
                    // vacated one" is the whole layout rule, and it is load-bearing
                    // rather than tidy. The group is two buttons wide in every state,
                    // so only the ORDER can change — and a Cancel pinned to one side
                    // would necessarily shift one of the two actions. Arming Make
                    // host would slide Confirm into Remove's old position and drop
                    // Cancel under the cursor, so a mouse user clicking twice in the
                    // same place would cancel while the keyboard path (Enter, Enter)
                    // confirmed: the two input modes would disagree. Letting Cancel
                    // fill the hole instead keeps every action's box fixed.
                    //
                    // The visible cost, accepted knowingly: Cancel sits on the right
                    // when Make host is armed and on the left when Remove is, so it
                    // does not keep one side. A fixed side is worth less than a
                    // Confirm that never moves under a cursor already resting on it —
                    // and the two are told apart by glyph (check vs cross) and by
                    // emphasis (bordered vs borderless), not by position.
                    //
                    // It also satisfies the V1 focus finding outright rather than
                    // narrowly. Both slots are `button` elements at fixed indices
                    // under the same parent in every state, so React reuses the DOM
                    // node and focus survives each relabel with no imperative
                    // .focus() call. A slot that unmounted while focused would drop
                    // focus to document.body with no blur event to notice it — a
                    // silent keyboard trap. Do not make either slot conditional, key
                    // them, or wrap them in an element that renders only while armed.
                    <>
                      {slot('first', p.id, armedHere)}
                      {slot('second', p.id, armedHere)}
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
