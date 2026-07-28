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
const rowAction = (name: string) => screen.getByRole('button', { name })

const row = (name: string) => screen.getByText(name).closest('li')!

const firstSlot = (name: string) =>
  row(name).querySelector<HTMLButtonElement>(
    '.participants-menu__row-action--first',
  )!
const secondSlot = (name: string) =>
  row(name).querySelector<HTMLButtonElement>(
    '.participants-menu__row-action--second',
  )!
const cancelAction = (name: string) =>
  row(name).querySelector<HTMLButtonElement>('.participants-menu__row-cancel')

describe('ParticipantsMenu', () => {
  it('renders a collapsed trigger with no roster visible', () => {
    renderMenu()

    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
    expect(trigger()).not.toHaveAttribute('aria-controls')
  })

  it('describes the panel without promising menu semantics', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    expect(trigger()).not.toHaveAttribute('aria-haspopup')

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
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('tags only the viewer’s own row as "me"', async () => {
    const user = userEvent.setup()
    renderMenu('p2')

    await user.click(trigger())

    const badges = screen.getAllByText('me')
    expect(badges).toHaveLength(1)
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

    expect(screen.getByRole('group')).toHaveFocus()
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(trigger())
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
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()
    await user.tab()

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
    expect(onTransferHost).not.toHaveBeenCalled()
  })

  it('offers no action on the viewer’s own row, and both on every other', async () => {
    const user = userEvent.setup()
    renderMenu('p1')
    await user.click(trigger())

    expect(screen.getAllByRole('button', { name: 'Make host' })).toHaveLength(2)
    expect(
      screen.getAllByRole('button', { name: 'Remove from room' }),
    ).toHaveLength(2)
    const ownRow = screen.getByText('Alice').closest('li')
    expect(ownRow?.querySelector('button')).toBeNull()
  })

  it('arms a confirm on the first press, without acting', async () => {
    const user = userEvent.setup()
    const { onTransferHost } = renderMenu()
    await user.click(trigger())

    await user.click(firstSlot('Bob'))

    expect(onTransferHost).not.toHaveBeenCalled()
    expect(firstSlot('Bob')).toHaveAccessibleName('Cancel')
    expect(secondSlot('Bob')).toHaveAccessibleName('Confirm handover')
    expect(screen.getAllByRole('button', { name: 'Make host' })).toHaveLength(1)
  })

  it('moves focus onto the Confirm when arming the first position', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    await user.click(firstSlot('Bob'))

    expect(secondSlot('Bob')).toHaveFocus()
    expect(secondSlot('Bob')).toHaveAccessibleName('Confirm handover')
  })

  it('returns focus to the action it came from when a confirm is cancelled', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    await user.click(firstSlot('Bob'))
    await user.keyboard('{Escape}')

    expect(firstSlot('Bob')).toHaveFocus()
    expect(firstSlot('Bob')).toHaveAccessibleName('Make host')
  })

  it('parks focus on the panel after a confirm rather than a doomed row', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    await user.click(secondSlot('Bob'))
    await user.click(rowAction('Confirm removal'))

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

    const expected = [
      firstSlot('Bob'),
      secondSlot('Bob'),
      firstSlot('Carol'),
      secondSlot('Carol'),
    ]

    await user.keyboard('{ArrowDown}')
    for (const [i, button] of expected.entries()) {
      if (i > 0) await user.keyboard('{ArrowDown}')
      expect(button).toHaveFocus()
    }

    await user.keyboard('{ArrowDown}')
    expect(expected[0]).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(expected[3]).toHaveFocus()
  })

  it('the arrow ring keeps its shape while a confirm is armed, and reaches Cancel', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    await user.click(secondSlot('Bob'))

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
    renderMenu('p1', { hostId: 'p2' })
    await user.click(trigger())

    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Bob')
    expect(rows[1]).toHaveTextContent('Alice')
    expect(rows[2]).toHaveTextContent('Carol')
    expect(rows[0]).toHaveTextContent('host')
  })

  it('renders the list unchanged while nobody holds the role', async () => {
    const user = userEvent.setup()
    renderMenu('p1', { hostId: '' })
    await user.click(trigger())

    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Alice')
    expect(rows[1]).toHaveTextContent('Bob')
    expect(rows[2]).toHaveTextContent('Carol')
    expect(screen.queryByText('host')).toBeNull()
  })

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

    expect(before).toHaveAccessibleName('Confirm removal')
    expect(before).toBeInTheDocument()
  })

  it('keeps exactly two slots, in order, in every state', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    const buttons = () => Array.from(row('Bob').querySelectorAll('button'))
    const positions = () => buttons().map((b) => b.dataset.slot)
    const labels = () => buttons().map((b) => b.getAttribute('aria-label'))

    expect(positions()).toEqual(['first', 'second'])
    expect(labels()).toEqual(['Make host', 'Remove from room'])

    await user.click(secondSlot('Bob'))

    expect(positions()).toEqual(['first', 'second'])
    expect(labels()).toEqual(['Cancel', 'Confirm removal'])

    await user.click(rowAction('Cancel'))
    await user.click(firstSlot('Bob'))

    expect(positions()).toEqual(['first', 'second'])
    expect(labels()).toEqual(['Cancel', 'Confirm handover'])
  })

  it('hides both actions while a confirm is pending', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    await user.click(secondSlot('Bob'))

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

    expect(firstSlot('Bob')).toBeEnabled()
    expect(secondSlot('Bob')).toBeEnabled()
    expect(firstSlot('Bob')).toHaveClass('participants-menu__row-cancel')
    expect(secondSlot('Bob')).not.toHaveClass('participants-menu__row-cancel')

    await user.click(rowAction('Cancel'))
    await user.click(firstSlot('Bob'))

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
    await user.click(trigger())
    await user.click(trigger())

    expect(secondSlot('Bob')).toHaveAccessibleName('Remove from room')
    expect(cancelAction('Bob')).toBeNull()
    expect(onRemoveParticipant).not.toHaveBeenCalled()
  })

  it('confirms with the keyboard alone', async () => {
    const user = userEvent.setup()
    const { onRemoveParticipant } = renderMenu()
    await user.click(trigger())

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
    renderMenu('p2')
    await user.click(trigger())

    expect(screen.getByText('Alice').closest('li')).toHaveTextContent('host')
    expect(screen.getByText('Bob').closest('li')).toHaveTextContent('me')
  })

  it('marks only the host’s row as the separator row', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(trigger())

    const marked = () =>
      Array.from(document.querySelectorAll('.participants-menu__item--host'))

    expect(marked()).toHaveLength(1)
    expect(marked()[0]).toHaveTextContent('Alice')
  })

  it('marks no row during the transient unowned window', async () => {
    const user = userEvent.setup()
    renderMenu('p1', { hostId: '' })
    await user.click(trigger())

    expect(
      document.querySelectorAll('.participants-menu__item--host'),
    ).toHaveLength(0)
  })
})
