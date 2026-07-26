import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ParticipantsMenu } from './ParticipantsMenu'
import type { Participant } from '../../types'

const PARTICIPANTS: Participant[] = [
  { id: 'p1', name: 'Alice', has_voted: true },
  { id: 'p2', name: 'Bob', has_voted: false },
  { id: 'p3', name: 'Carol', has_voted: false },
]

function renderMenu(currentParticipantId = 'p1', overrides = {}) {
  const onTransferHost = vi.fn()
  const onRemoveParticipant = vi.fn()
  const view = render(
    <ParticipantsMenu
      participants={PARTICIPANTS}
      currentParticipantId={currentParticipantId}
      hostId="p1"
      onTransferHost={onTransferHost}
      onRemoveParticipant={onRemoveParticipant}
      {...overrides}
    />,
  )
  return { ...view, onTransferHost, onRemoveParticipant }
}

const trigger = () => screen.getByRole('button', { name: 'Room participants' })
const rowAction = (name: string) =>
  screen.getByRole('button', { name }) as HTMLButtonElement

const row = (name: string) => screen.getByText(name).closest('li')!

// A row holds two button POSITIONS whose roles change with state:
//
//   idle             first = Make host        second = Remove from room
//   handover armed   first = Cancel           second = Confirm handover
//   removal armed    first = Cancel           second = Confirm removal
//
// So these locate a position, never a role — role is asserted by accessible name.
// The point of the fixed order is that Cancel and Confirm never swap sides, which is
// exactly what the label assertions below pin.
const firstSlot = (name: string) =>
  row(name).querySelector<HTMLButtonElement>(
    '.participants-menu__row-action--first',
  )!
const secondSlot = (name: string) =>
  row(name).querySelector<HTMLButtonElement>(
    '.participants-menu__row-action--second',
  )!
/** Whichever position is currently acting as Cancel, if any. */
const cancelAction = (name: string) =>
  row(name).querySelector<HTMLButtonElement>('.participants-menu__row-cancel')

describe('ParticipantsMenu', () => {
  it('renders a collapsed trigger with no roster visible', () => {
    renderMenu()

    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
    // No dangling aria-controls while there is no panel to point at.
    expect(trigger()).not.toHaveAttribute('aria-controls')
  })

  it('describes the panel without promising menu semantics', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    // No popup attribute is truthful here (D-46). "true" is synonymous with
    // "menu", and the rows are buttons in a list rather than menuitems — a
    // menuitem cannot hold the confirm's two controls, and the menu pattern
    // requires activation to close the menu. "dialog" would promise a dialog the
    // panel equally is not. This is settled, not pending: both assertions below
    // predate the row actions and still hold, which is what made role="group"
    // the continuous choice.
    expect(trigger()).not.toHaveAttribute('aria-haspopup')

    // aria-controls resolves to the panel, which is named by its visible title
    // rather than a second "Participants" label (ParticipantGrid owns that name).
    const panel = screen.getByRole('group')
    expect(trigger()).toHaveAttribute('aria-controls', panel.id)
    expect(panel).toHaveAccessibleName(/Participants/)
  })

  it('lists every participant on click', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(trigger())

    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('Carol')).toBeInTheDocument()
    // One row per participant, and the count reflects the same total.
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('tags only the viewer’s own row as "me"', async () => {
    const user = userEvent.setup()
    renderMenu('p2') // the viewer is Bob

    await user.click(trigger())

    const badges = screen.getAllByText('me')
    expect(badges).toHaveLength(1)
    // The badge sits in Bob's row, not Alice's or Carol's.
    expect(badges[0].closest('li')).toHaveTextContent('Bob')
  })

  it('closes on a second trigger click', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(trigger())
    await user.click(trigger())

    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
  })

  it('moves focus into the panel on open', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(trigger())

    // Without this the panel holds nothing focusable: Tab would skip it and a
    // screen reader would announce "expanded" over silence.
    expect(screen.getByRole('group')).toHaveFocus()
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(trigger())
    // Focus is on the panel here, NOT the trigger — that is what makes the
    // restore below observable. Asserting straight after a click would pass
    // even against an implementation that never restores focus at all.
    expect(trigger()).not.toHaveFocus()

    await user.keyboard('{Escape}')

    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(trigger()).toHaveFocus()
  })

  it('closes when focus tabs out of the control', async () => {
    const user = userEvent.setup()
    render(
      <>
        <ParticipantsMenu
          participants={PARTICIPANTS}
          currentParticipantId="p1"
          hostId="p1"
          onTransferHost={vi.fn()}
          onRemoveParticipant={vi.fn()}
        />
        <button type="button">Elsewhere</button>
      </>,
    )

    await user.click(trigger())
    // The row actions are normally tabbable (no roving tabindex), so Tab now walks
    // through them before leaving the control — two presses per targetable row since
    // V2 added the second action, then one more to step outside. That is the point:
    // Tab traversal stays native and the arrow keys are an addition, not a
    // replacement. The count is asserted by the final focus check, not assumed: a
    // miscount lands on a row action and the "Elsewhere" expectation fails.
    await user.tab() // panel → Bob's Make host
    await user.tab() // → Bob's Remove
    await user.tab() // → Carol's Make host
    await user.tab() // → Carol's Remove
    await user.tab() // → outside the control

    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
  })

  it('closes on a press outside the menu', async () => {
    const user = userEvent.setup()
    render(
      <>
        <ParticipantsMenu
          participants={PARTICIPANTS}
          currentParticipantId="p1"
          hostId="p1"
          onTransferHost={vi.fn()}
          onRemoveParticipant={vi.fn()}
        />
        <button type="button">Elsewhere</button>
      </>,
    )

    await user.click(trigger())
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }))

    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
  })

  it('keeps the panel open when pressing inside it', async () => {
    const user = userEvent.setup()
    const { onTransferHost } = renderMenu()

    await user.click(trigger())
    await user.click(screen.getByText('Bob'))

    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Bob')).toBeInTheDocument()
    // The name is deliberately a plain <span>, not part of the row's button, so
    // pressing it is inert. Asserting that keeps this test honest: if someone
    // makes the row itself a button, getByText('Bob') would resolve inside it and
    // this click would arm the confirm — the panel would still be open, so the
    // assertions above would still pass while this test silently stopped proving
    // "a press inside does not dismiss".
    expect(onTransferHost).not.toHaveBeenCalled()
  })

  it('offers no action on the viewer’s own row, and both on every other', async () => {
    const user = userEvent.setup()
    renderMenu('p1') // the viewer is Alice, who is also the host
    await user.click(trigger())

    // Three participants, two of them targetable, two actions each.
    expect(screen.getAllByRole('button', { name: 'Make host' })).toHaveLength(2)
    expect(
      screen.getAllByRole('button', { name: 'Remove from room' }),
    ).toHaveLength(2)
    // Neither action appears on the host's own row: the domain rejects a self-target
    // for both (cannot_target_self), so offering either would be a control that
    // cannot succeed.
    const ownRow = screen.getByText('Alice').closest('li')
    expect(ownRow?.querySelector('button')).toBeNull()
  })

  it('arms a confirm on the first press, without acting', async () => {
    const user = userEvent.setup()
    const { onTransferHost } = renderMenu()
    await user.click(trigger())

    await user.click(firstSlot('Bob'))

    // Handing over is irreversible from the outgoing host's side, so one press
    // must not do it.
    expect(onTransferHost).not.toHaveBeenCalled()
    // The controls are icon-only, so assert on accessible names rather than text.
    // Cancel takes the FIRST position and Confirm the second, whichever action is
    // armed — so arming the first position's action moves its Confirm to the other
    // button. "Confirm handover", not a bare "Confirm": with two actions on the row,
    // the label has to say which of two irreversible things is about to happen.
    expect(firstSlot('Bob')).toHaveAccessibleName('Cancel')
    expect(secondSlot('Bob')).toHaveAccessibleName('Confirm handover')
    // Only the armed row changes; the others still offer the initial label.
    expect(screen.getAllByRole('button', { name: 'Make host' })).toHaveLength(1)
  })

  it('moves focus onto the Confirm when arming the first position', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    await user.click(firstSlot('Bob'))

    // The cost of a fixed Cancel-then-Confirm order, and why the focus effect is not
    // optional: the handover's Confirm is not the button that was just pressed. Left
    // alone, a keyboard user's second Enter would land on Cancel and the handover
    // could never be completed from the keyboard.
    expect(secondSlot('Bob')).toHaveFocus()
    expect(secondSlot('Bob')).toHaveAccessibleName('Confirm handover')
  })

  it('returns focus to the action it came from when a confirm is cancelled', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    await user.click(firstSlot('Bob')) // arms the handover; focus is on Confirm
    await user.keyboard('{Escape}')

    // Back to "Make host", not left on the second position — which is now "Remove
    // from room", one Enter away from the destructive action the host was not
    // reaching for. That trap is the whole reason this restore exists.
    expect(firstSlot('Bob')).toHaveFocus()
    expect(firstSlot('Bob')).toHaveAccessibleName('Make host')
  })

  it('parks focus on the panel after a confirm rather than a doomed row', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    await user.click(secondSlot('Bob'))
    await user.click(rowAction('Confirm removal'))

    // Confirming deliberately does not restore to the row: it is usually about to
    // vanish (a removal drops it, a handover unmounts this host-only panel), so
    // focusing a doomed button would drop the caret to document.body with no blur
    // event to notice. The panel outlives the row.
    expect(screen.getByRole('group')).toHaveFocus()
  })

  it('hands over on the second press, once, with the target id', async () => {
    const user = userEvent.setup()
    const { onTransferHost } = renderMenu()
    await user.click(trigger())

    await user.click(firstSlot('Bob'))
    await user.click(rowAction('Confirm handover'))

    expect(onTransferHost).toHaveBeenCalledExactlyOnceWith('p2')
  })

  it('cancel restores the row and acts on nobody', async () => {
    const user = userEvent.setup()
    const { onTransferHost } = renderMenu()
    await user.click(trigger())

    await user.click(firstSlot('Bob'))
    await user.click(rowAction('Cancel'))

    expect(onTransferHost).not.toHaveBeenCalled()
    expect(firstSlot('Bob')).toHaveAccessibleName('Make host')
    expect(secondSlot('Bob')).toHaveAccessibleName('Remove from room')
    expect(cancelAction('Bob')).toBeNull()
  })

  it('reuses the same button element across the confirm swap', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    const first = firstSlot('Bob')
    const second = secondSlot('Bob')

    await user.click(first)

    // Element IDENTITY, not "something is focused". Relabelling in place keeps the
    // node the user activated, so focus survives with no imperative .focus() call.
    // Note this cannot distinguish relabel-in-place from an unkeyed unmount/remount
    // swap — React reuses the node in both, so they are behaviourally identical and
    // differ only in robustness. It DOES fail if a future refactor adds a key or
    // wraps the confirm controls in an element that renders only while confirming:
    // either detaches this node and drops focus to document.body with no blur event
    // to notice. That is why the constraint also lives as a comment in the source.
    // Both nodes persist; only their roles change. `first` becomes Cancel and `second`
    // becomes the Confirm — asserted on the ORIGINAL references, so a remount of either
    // (an added key, a wrapper that renders only while armed) fails here.
    expect(first).toBeInTheDocument()
    expect(second).toBeInTheDocument()
    expect(first).toHaveAccessibleName('Cancel')
    expect(second).toHaveAccessibleName('Confirm handover')
  })

  it('Escape cancels the confirm first, then closes the panel', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    await user.click(firstSlot('Bob'))
    expect(secondSlot('Bob')).toHaveAccessibleName('Confirm handover')

    // Layered dismissal: the confirm is the innermost layer. This fails against an
    // [isOpen]-only effect dep array, where the handler closes over a stale
    // `armed` and closes the whole panel on the first press.
    await user.keyboard('{Escape}')
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Confirm handover' }),
    ).toBeNull()

    await user.keyboard('{Escape}')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(trigger()).toHaveFocus()
  })

  it('arrow keys move across every row action in DOM order, and wrap', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    // Deliberately richer than role="group" requires: ARIA forbids claiming a role
    // you don't implement, not adding affordances beyond one (D-46).
    //
    // The walk covers all four slots — both rows, both slots each — because the ring
    // is built from every enabled [data-row-action] rather than a per-row pick. The
    // expected sequence also pins the within-row ORDER: Make host precedes Remove.
    const expected = [
      firstSlot('Bob'),
      secondSlot('Bob'),
      firstSlot('Carol'),
      secondSlot('Carol'),
    ]

    await user.keyboard('{ArrowDown}') // from the panel, enter at the first action
    for (const [i, button] of expected.entries()) {
      if (i > 0) await user.keyboard('{ArrowDown}')
      expect(button).toHaveFocus()
    }

    await user.keyboard('{ArrowDown}') // wraps to the top
    expect(expected[0]).toHaveFocus()
    await user.keyboard('{ArrowUp}') // wraps back to the bottom
    expect(expected[3]).toHaveFocus()
  })

  it('the arrow ring keeps its shape while a confirm is armed, and reaches Cancel', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    await user.click(secondSlot('Bob')) // arms it; focus lands on it

    // Both slots stay enabled — the unarmed one is Cancel now, not a dead action — so
    // the ring is still four long and unchanged in order. ArrowUp from the armed
    // Confirm therefore reaches its own row's Cancel, which is the useful direction:
    // a keyboard user can back out without leaving the row.
    await user.keyboard('{ArrowUp}')
    expect(firstSlot('Bob')).toHaveFocus()
    expect(firstSlot('Bob')).toHaveAccessibleName('Cancel')

    await user.keyboard('{ArrowDown}')
    expect(secondSlot('Bob')).toHaveFocus()
    expect(secondSlot('Bob')).toHaveAccessibleName('Confirm removal')
  })

  it('disables every row action off-live', async () => {
    const user = userEvent.setup()
    renderMenu('p1', { disabled: true })
    await user.click(trigger())

    for (const b of [
      ...screen.getAllByRole('button', { name: 'Make host' }),
      ...screen.getAllByRole('button', { name: 'Remove from room' }),
    ]) {
      expect(b).toBeDisabled()
    }
  })

  it('puts the host first, whoever they are, and keeps everyone else in order', async () => {
    const user = userEvent.setup()
    // Bob is host but arrives second in the snapshot (join order), so this fails
    // against a component that renders `participants` as given. Every other test
    // here has the host already first, so none of them would catch a regression.
    renderMenu('p1', { hostId: 'p2' })
    await user.click(trigger())

    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Bob')
    // The remainder keep snapshot order — rows move only when the role moves.
    expect(rows[1]).toHaveTextContent('Alice')
    expect(rows[2]).toHaveTextContent('Carol')
    // And the promotion follows the role, not the name: Bob's row is the tagged one.
    expect(rows[0]).toHaveTextContent('host')
  })

  it('renders the list unchanged while nobody holds the role', async () => {
    const user = userEvent.setup()
    // hostId is '' during the transient unowned window (Room passes host_id ?? '').
    renderMenu('p1', { hostId: '' })
    await user.click(trigger())

    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Alice')
    expect(rows[1]).toHaveTextContent('Bob')
    expect(rows[2]).toHaveTextContent('Carol')
    expect(screen.queryByText('host')).toBeNull()
  })

  // --- Removal (FR-21/D-47): the second row action, and the interaction between
  // --- two confirms sharing one row.

  it('arms a removal confirm on the first press, without acting', async () => {
    const user = userEvent.setup()
    const { onRemoveParticipant } = renderMenu()
    await user.click(trigger())

    await user.click(secondSlot('Bob'))

    expect(onRemoveParticipant).not.toHaveBeenCalled()
    expect(secondSlot('Bob')).toHaveAccessibleName('Confirm removal')
    expect(cancelAction('Bob')).toHaveAccessibleName('Cancel')
  })

  it('removes on the second press, once, with the target id', async () => {
    const user = userEvent.setup()
    const { onRemoveParticipant, onTransferHost } = renderMenu()
    await user.click(trigger())

    await user.click(secondSlot('Bob'))
    await user.click(rowAction('Confirm removal'))

    expect(onRemoveParticipant).toHaveBeenCalledExactlyOnceWith('p2')
    // And emphatically not the other action: the two confirms share a row and a
    // component, so "fired the wrong one" is the failure this slice could introduce.
    expect(onTransferHost).not.toHaveBeenCalled()
  })

  it('cancel restores the row and removes nobody', async () => {
    const user = userEvent.setup()
    const { onRemoveParticipant } = renderMenu()
    await user.click(trigger())

    await user.click(secondSlot('Bob'))
    await user.click(rowAction('Cancel'))

    expect(onRemoveParticipant).not.toHaveBeenCalled()
    expect(secondSlot('Bob')).toHaveAccessibleName('Remove from room')
    expect(cancelAction('Bob')).toBeNull()
    expect(firstSlot('Bob')).toBeEnabled()
  })

  it('reuses the same button element across the removal confirm swap', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    const before = secondSlot('Bob')
    await user.click(before)

    // Element identity, as for the handover: both buttons render in every state, so
    // arming one cannot displace the other and neither can lose focus silently.
    expect(before).toHaveAccessibleName('Confirm removal')
    expect(before).toBeInTheDocument()
  })

  it('keeps exactly two slots, in order, in every state', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    const buttons = () => Array.from(row('Bob').querySelectorAll('button'))
    /** The position each button occupies, in DOM order. */
    const positions = () => buttons().map((b) => b.dataset.slot)
    /** What each of those buttons currently says. */
    const labels = () => buttons().map((b) => b.getAttribute('aria-label'))

    expect(positions()).toEqual(['first', 'second'])
    expect(labels()).toEqual(['Make host', 'Remove from room'])

    await user.click(secondSlot('Bob'))

    // Same two buttons in the same two positions — only the roles change. Nothing is
    // inserted or removed, so no focused node is ever detached.
    expect(positions()).toEqual(['first', 'second'])
    expect(labels()).toEqual(['Cancel', 'Confirm removal'])

    await user.click(rowAction('Cancel'))
    await user.click(firstSlot('Bob'))

    // The load-bearing assertion of this whole refinement: the confirm controls sit in
    // the SAME places for the other action too. Cancel first, Confirm second, always —
    // only the Confirm's wording says which action is pending.
    expect(positions()).toEqual(['first', 'second'])
    expect(labels()).toEqual(['Cancel', 'Confirm handover'])
  })

  it('hides both actions while a confirm is pending', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    await user.click(secondSlot('Bob'))

    // The armed row offers Confirm and Cancel and nothing else, so a pending confirm
    // cannot be sidestepped by pressing the other action.
    const bobRow = within(row('Bob'))
    expect(bobRow.queryByRole('button', { name: 'Make host' })).toBeNull()
    expect(
      bobRow.queryByRole('button', { name: 'Remove from room' }),
    ).toBeNull()
    expect(
      bobRow.getByRole('button', { name: 'Confirm removal' }),
    ).toBeInTheDocument()
    expect(bobRow.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('leaves both slots pressable while armed — one confirms, one cancels', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    await user.click(secondSlot('Bob'))

    // Neither position is disabled: an armed row has no dead control, because the one
    // that is not confirming is the way out. (Off-live is the only disable a row action
    // has.) The Cancel takes the secondary look, so emphasis lands on the press that
    // counts — and since Cancel is always first, that treatment stays on one side.
    expect(firstSlot('Bob')).toBeEnabled()
    expect(secondSlot('Bob')).toBeEnabled()
    expect(firstSlot('Bob')).toHaveClass('participants-menu__row-cancel')
    expect(secondSlot('Bob')).not.toHaveClass('participants-menu__row-cancel')

    await user.click(rowAction('Cancel'))
    await user.click(firstSlot('Bob'))

    // Unchanged for the other action: the secondary treatment does not move either.
    expect(firstSlot('Bob')).toHaveClass('participants-menu__row-cancel')
    expect(secondSlot('Bob')).not.toHaveClass('participants-menu__row-cancel')
  })

  it('arming a row does not disturb any other row', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    await user.click(secondSlot('Bob'))

    expect(secondSlot('Carol')).toHaveAccessibleName('Remove from room')
    expect(firstSlot('Carol')).toHaveAccessibleName('Make host')
    expect(firstSlot('Carol')).toBeEnabled()
    expect(cancelAction('Carol')).toBeNull()
  })

  it('arming another row’s action disarms the first, acting on neither', async () => {
    const user = userEvent.setup()
    const { onRemoveParticipant, onTransferHost } = renderMenu()
    await user.click(trigger())

    await user.click(secondSlot('Bob'))
    await user.click(secondSlot('Carol'))

    // One confirm at a time across the whole panel, so two rows can never both look
    // armed and a stray second click cannot confirm something set up long ago.
    expect(secondSlot('Bob')).toHaveAccessibleName('Remove from room')
    expect(secondSlot('Carol')).toHaveAccessibleName('Confirm removal')
    expect(onRemoveParticipant).not.toHaveBeenCalled()
    expect(onTransferHost).not.toHaveBeenCalled()
  })

  it('Escape cancels a removal confirm before closing the panel', async () => {
    const user = userEvent.setup()
    const { onRemoveParticipant } = renderMenu()
    await user.click(trigger())

    await user.click(secondSlot('Bob'))
    await user.keyboard('{Escape}')

    // The same layering the handover gets — the confirm is the innermost layer, so a
    // panic press cancels the removal rather than dismissing the panel around it.
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(secondSlot('Bob')).toHaveAccessibleName('Remove from room')
    expect(onRemoveParticipant).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })

  it('closing the panel drops a pending removal confirm', async () => {
    const user = userEvent.setup()
    const { onRemoveParticipant } = renderMenu()
    await user.click(trigger())

    await user.click(secondSlot('Bob'))
    await user.click(trigger()) // close
    await user.click(trigger()) // reopen

    // Reopening must never show a row still armed from last time: the second press
    // would then be a confirm the host never set up.
    expect(secondSlot('Bob')).toHaveAccessibleName('Remove from room')
    expect(cancelAction('Bob')).toBeNull()
    expect(onRemoveParticipant).not.toHaveBeenCalled()
  })

  it('confirms with the keyboard alone', async () => {
    const user = userEvent.setup()
    const { onRemoveParticipant } = renderMenu()
    await user.click(trigger())

    // Arrow in, then Enter twice on the same control. Relabel-in-place is what makes
    // this work without a single .focus() call: the button the first Enter armed is
    // still the focused node for the second.
    // Two ArrowDowns, because Make host is the first slot in the row.
    await user.keyboard('{ArrowDown}')
    expect(firstSlot('Bob')).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(secondSlot('Bob')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(secondSlot('Bob')).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(onRemoveParticipant).toHaveBeenCalledExactlyOnceWith('p2')
  })

  it('tags the host’s row', async () => {
    const user = userEvent.setup()
    renderMenu('p2') // viewer is Bob; Alice (p1) is host
    await user.click(trigger())

    expect(screen.getByText('Alice').closest('li')).toHaveTextContent('host')
    expect(screen.getByText('Bob').closest('li')).toHaveTextContent('me')
  })
})
