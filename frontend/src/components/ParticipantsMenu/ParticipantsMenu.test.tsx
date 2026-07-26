import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  const view = render(
    <ParticipantsMenu
      participants={PARTICIPANTS}
      currentParticipantId={currentParticipantId}
      hostId="p1"
      onTransferHost={onTransferHost}
      {...overrides}
    />,
  )
  return { ...view, onTransferHost }
}

const trigger = () => screen.getByRole('button', { name: 'Room participants' })
const rowAction = (name: string) =>
  screen.getByRole('button', { name }) as HTMLButtonElement

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
        />
        <button type="button">Elsewhere</button>
      </>,
    )

    await user.click(trigger())
    // The row actions are normally tabbable (no roving tabindex), so Tab now walks
    // through them before leaving the control — one press per targetable row, then
    // one more to step outside. That is the point: Tab traversal stays native and
    // the arrow keys are an addition, not a replacement.
    await user.tab() // panel → Bob's action
    await user.tab() // → Carol's action
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

  it('offers no action on the viewer’s own row, and one on every other', async () => {
    const user = userEvent.setup()
    renderMenu('p1') // the viewer is Alice, who is also the host
    await user.click(trigger())

    // Three participants, two of them targetable.
    expect(screen.getAllByRole('button', { name: 'Make host' })).toHaveLength(2)
    const ownRow = screen.getByText('Alice').closest('li')
    expect(ownRow?.querySelector('button')).toBeNull()
  })

  it('arms a confirm on the first press, without acting', async () => {
    const user = userEvent.setup()
    const { onTransferHost } = renderMenu()
    await user.click(trigger())

    const bobRow = screen.getByText('Bob').closest('li')!
    await user.click(
      bobRow.querySelector<HTMLButtonElement>('[data-row-action]')!,
    )

    // Handing over is irreversible from the outgoing host's side, so one press
    // must not do it.
    expect(onTransferHost).not.toHaveBeenCalled()
    // The controls are icon-only, so assert on accessible names rather than text.
    expect(bobRow.querySelector('[data-row-action]')).toHaveAccessibleName(
      'Confirm',
    )
    expect(
      bobRow.querySelector('.participants-menu__row-cancel'),
    ).toHaveAccessibleName('Cancel')
    // Only the armed row changes; the others still offer the initial label.
    expect(screen.getAllByRole('button', { name: 'Make host' })).toHaveLength(1)
  })

  it('hands over on the second press, once, with the target id', async () => {
    const user = userEvent.setup()
    const { onTransferHost } = renderMenu()
    await user.click(trigger())

    const bobRow = screen.getByText('Bob').closest('li')!
    const action = bobRow.querySelector<HTMLButtonElement>('[data-row-action]')!
    await user.click(action)
    await user.click(rowAction('Confirm'))

    expect(onTransferHost).toHaveBeenCalledExactlyOnceWith('p2')
  })

  it('cancel restores the row and acts on nobody', async () => {
    const user = userEvent.setup()
    const { onTransferHost } = renderMenu()
    await user.click(trigger())

    const bobRow = screen.getByText('Bob').closest('li')!
    await user.click(
      bobRow.querySelector<HTMLButtonElement>('[data-row-action]')!,
    )
    await user.click(rowAction('Cancel'))

    expect(onTransferHost).not.toHaveBeenCalled()
    expect(bobRow.querySelector('[data-row-action]')).toHaveAccessibleName(
      'Make host',
    )
    expect(bobRow.querySelector('.participants-menu__row-cancel')).toBeNull()
  })

  it('reuses the same button element across the confirm swap', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    const bobRow = screen.getByText('Bob').closest('li')!
    const before = bobRow.querySelector<HTMLButtonElement>('[data-row-action]')!

    await user.click(before)

    // Element IDENTITY, not "something is focused". Relabelling in place keeps the
    // node the user activated, so focus survives with no imperative .focus() call.
    // Note this cannot distinguish relabel-in-place from an unkeyed unmount/remount
    // swap — React reuses the node in both, so they are behaviourally identical and
    // differ only in robustness. It DOES fail if a future refactor adds a key or
    // wraps the confirm controls in an element that renders only while confirming:
    // either detaches this node and drops focus to document.body with no blur event
    // to notice. That is why the constraint also lives as a comment in the source.
    expect(before).toHaveAccessibleName('Confirm')
    expect(before).toBeInTheDocument()
  })

  it('Escape cancels the confirm first, then closes the panel', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    const bobRow = screen.getByText('Bob').closest('li')!
    await user.click(
      bobRow.querySelector<HTMLButtonElement>('[data-row-action]')!,
    )
    expect(bobRow.querySelector('[data-row-action]')).toHaveAccessibleName(
      'Confirm',
    )

    // Layered dismissal: the confirm is the innermost layer. This fails against an
    // [isOpen]-only effect dep array, where the handler closes over a stale
    // confirmingId and closes the whole panel on the first press.
    await user.keyboard('{Escape}')
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()

    await user.keyboard('{Escape}')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(trigger()).toHaveFocus()
  })

  it('arrow keys move across row actions and wrap', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    // Deliberately richer than role="group" requires: ARIA forbids claiming a role
    // you don't implement, not adding affordances beyond one (D-46).
    const actions = screen.getAllByRole('button', { name: 'Make host' })

    await user.keyboard('{ArrowDown}') // from the panel, enter at the first row
    expect(actions[0]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(actions[1]).toHaveFocus()
    await user.keyboard('{ArrowDown}') // wraps
    expect(actions[0]).toHaveFocus()
    await user.keyboard('{ArrowUp}') // wraps back
    expect(actions[1]).toHaveFocus()
  })

  it('disables every row action off-live', async () => {
    const user = userEvent.setup()
    renderMenu('p1', { disabled: true })
    await user.click(trigger())

    for (const b of screen.getAllByRole('button', { name: 'Make host' })) {
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

  it('tags the host’s row', async () => {
    const user = userEvent.setup()
    renderMenu('p2') // viewer is Bob; Alice (p1) is host
    await user.click(trigger())

    expect(screen.getByText('Alice').closest('li')).toHaveTextContent('host')
    expect(screen.getByText('Bob').closest('li')).toHaveTextContent('me')
  })
})
