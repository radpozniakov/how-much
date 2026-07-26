import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ParticipantsMenu } from './ParticipantsMenu'
import type { Participant } from '../../types'

const PARTICIPANTS: Participant[] = [
  { id: 'p1', name: 'Alice', has_voted: true },
  { id: 'p2', name: 'Bob', has_voted: false },
  { id: 'p3', name: 'Carol', has_voted: false },
]

function renderMenu(currentParticipantId = 'p1') {
  return render(
    <ParticipantsMenu
      participants={PARTICIPANTS}
      currentParticipantId={currentParticipantId}
    />,
  )
}

const trigger = () => screen.getByRole('button', { name: 'Room participants' })

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

    // aria-haspopup="true" is synonymous with "menu"; the rows are inert text
    // this iteration, so the trigger must not claim a menu.
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
        />
        <button type="button">Elsewhere</button>
      </>,
    )

    await user.click(trigger())
    await user.tab() // panel → the next focusable thing outside the control

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
    renderMenu()

    await user.click(trigger())
    await user.click(screen.getByText('Bob'))

    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })
})
