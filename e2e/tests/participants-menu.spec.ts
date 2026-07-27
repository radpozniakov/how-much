import { expect, test, type Page } from '@playwright/test'
import {
  card,
  createRoom,
  hostVotingToggle,
  joinViaCode,
  participantCards,
  revealButton,
  rosterEntry,
  roomCodeHeading,
  rosterMenuTrigger,
  setHostVoting,
  setTopic,
  showCards,
  showStats,
  voteCard,
  voteDeck,
} from './helpers'

// The host-only participants roster (S23), carrying both room-control actions: the
// host handover (FR-20/D-45) and removing a participant (FR-21/D-47). A users icon
// beside the host's name opens a panel listing everyone in the room, with the host's
// own row tagged "me" and every other row offering a two-step "Remove from room" and
// "Make host" confirm. The panel stays role="group" with real buttons rather than
// becoming a menu (D-46).

/** The roster trigger in the header — the shared helper; the local duplicate this
 * file used to define has been collapsed into it. */
const rosterTrigger = (page: Page) => rosterMenuTrigger(page)

const rosterRows = (page: Page) => page.locator('.participants-menu__item')

// A row holds two button POSITIONS whose roles change with state:
//
//   idle             first = Make host   second = Remove from room
//   handover armed   first = Cancel      second = Confirm handover
//   removal armed    first = Cancel      second = Confirm removal
//
// These locate a position, never a role — role is asserted by accessible name. The
// fixed order is the point: Cancel and Confirm never swap sides.

/** The first (leftmost) button position in a named participant's row. */
const firstSlot = (page: Page, name: string) =>
  rosterRows(page)
    .filter({ hasText: name })
    .locator('.participants-menu__row-action--first')

/** The second button position in a named participant's row. */
const secondSlot = (page: Page, name: string) =>
  rosterRows(page)
    .filter({ hasText: name })
    .locator('.participants-menu__row-action--second')

/** Whichever position in the row is currently acting as Cancel, if any. */
const cancelAction = (page: Page, name: string) =>
  rosterRows(page)
    .filter({ hasText: name })
    .locator('.participants-menu__row-cancel')

/** Arm and confirm the handover to `name`. Two presses on DIFFERENT buttons: Confirm
 * always occupies the second position, so arming the first position's action moves its
 * Confirm onto the other one. Tests that care about *which* button go direct. */
async function handOver(page: Page, name: string): Promise<void> {
  await firstSlot(page, name).click()
  await secondSlot(page, name).click()
}

/** Arm and confirm the removal of `name`. Both presses land on the second position,
 * which holds Remove and then Confirm removal — so this one IS a double-press in place. */
async function removeFrom(page: Page, name: string): Promise<void> {
  await secondSlot(page, name).click()
  await secondSlot(page, name).click()
}

test.describe('Participants roster', () => {
  test('the host sees every participant, with themselves tagged "me"', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext()
    const host = await hostCtx.newPage()
    const code = await createRoom(host, 'Alice')

    const guestCtx = await browser.newContext()
    const guest = await guestCtx.newPage()
    await joinViaCode(guest, code, 'Bob')

    // Collapsed until asked for: no roster content in the header up front.
    await expect(rosterTrigger(host)).toHaveAttribute('aria-expanded', 'false')
    await expect(rosterRows(host)).toHaveCount(0)

    await rosterTrigger(host).click()
    await expect(rosterTrigger(host)).toHaveAttribute('aria-expanded', 'true')

    // Everyone in the room, host first, and only the host's row is tagged.
    await expect(rosterRows(host)).toHaveCount(2)
    await expect(rosterRows(host).nth(0)).toContainText('Alice')
    await expect(rosterRows(host).nth(0)).toContainText('me')
    await expect(rosterRows(host).nth(1)).toContainText('Bob')
    await expect(
      rosterRows(host).nth(1).locator('.participants-menu__badge'),
    ).toHaveCount(0)

    await hostCtx.close()
    await guestCtx.close()
  })

  test('an open roster picks up a join over the socket', async ({ browser }) => {
    const hostCtx = await browser.newContext()
    const host = await hostCtx.newPage()
    const code = await createRoom(host, 'Alice')

    await rosterTrigger(host).click()
    await expect(rosterRows(host)).toHaveCount(1)

    // The panel renders the live snapshot (D-36), so a join while it is open
    // must appear without reopening it.
    const guestCtx = await browser.newContext()
    const guest = await guestCtx.newPage()
    await joinViaCode(guest, code, 'Bob')

    await expect(rosterRows(host)).toHaveCount(2)
    await expect(rosterRows(host).nth(1)).toContainText('Bob')

    await hostCtx.close()
    await guestCtx.close()
  })

  test('a non-host gets no roster control', async ({ browser }) => {
    const hostCtx = await browser.newContext()
    const host = await hostCtx.newPage()
    const code = await createRoom(host, 'Alice')

    const guestCtx = await browser.newContext()
    const guest = await guestCtx.newPage()
    await joinViaCode(guest, code, 'Bob')

    await expect(rosterTrigger(host)).toBeVisible()
    await expect(rosterTrigger(guest)).toHaveCount(0)

    await hostCtx.close()
    await guestCtx.close()
  })

  test('Escape closes the roster and returns focus to the trigger', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext()
    const host = await hostCtx.newPage()
    await createRoom(host, 'Alice')

    await rosterTrigger(host).click()
    await expect(rosterRows(host)).toHaveCount(1)

    await host.keyboard.press('Escape')

    await expect(rosterRows(host)).toHaveCount(0)
    await expect(rosterTrigger(host)).toBeFocused()

    await hostCtx.close()
  })
})

test.describe('Host handover (FR-20)', () => {
  test('the host hands the role to another participant', async ({ browser }) => {
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    const code = await createRoom(alice, 'Alice')

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await joinViaCode(bob, code, 'Bob')

    // Before: Alice holds the role, Bob has no host affordances at all.
    await expect(hostVotingToggle(alice)).toBeVisible()
    await expect(hostVotingToggle(bob)).toHaveCount(0)

    await rosterTrigger(alice).click()
    await firstSlot(alice, 'Bob').click() // arms the confirm
    // Cancel is always the first position and Confirm always the second, so the
    // handover's Confirm is NOT the button just pressed.
    await expect(firstSlot(alice, 'Bob')).toHaveAttribute('aria-label', 'Cancel')
    await expect(secondSlot(alice, 'Bob')).toHaveAttribute(
      'aria-label',
      'Confirm handover',
    )
    await secondSlot(alice, 'Bob').click() // commits

    // Asserting on BOTH clients is what proves this is a move, not a grant.
    // hostVotingToggle is the most reliable host/non-host signal on the page.
    await expect(hostVotingToggle(bob)).toBeVisible()
    await expect(hostVotingToggle(alice)).toHaveCount(0)
    await expect(rosterTrigger(bob)).toBeVisible()
    await expect(rosterTrigger(alice)).toHaveCount(0)

    await aliceCtx.close()
    await bobCtx.close()
  })

  test('one press only arms the confirm; cancel calls it off', async ({
    browser,
  }) => {
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    const code = await createRoom(alice, 'Alice')

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await joinViaCode(bob, code, 'Bob')

    await rosterTrigger(alice).click()
    await firstSlot(alice, 'Bob').click()

    // Armed, but nothing has happened yet — handover is irreversible from the
    // outgoing host's side, so a single misclick must not perform it.
    await expect(secondSlot(alice, 'Bob')).toHaveAttribute(
      'aria-label',
      'Confirm handover',
    )
    await expect(hostVotingToggle(alice)).toBeVisible()
    await expect(hostVotingToggle(bob)).toHaveCount(0)
    // Both actions are gone while the confirm is pending, so it cannot be sidestepped
    // by pressing the other one.
    await expect(
      alice.getByRole('button', { name: 'Make host' }),
    ).toHaveCount(0)
    await expect(
      alice.getByRole('button', { name: 'Remove from room' }),
    ).toHaveCount(0)

    await cancelAction(alice, 'Bob').click()

    await expect(firstSlot(alice, 'Bob')).toHaveAttribute(
      'aria-label',
      'Make host',
    )
    await expect(secondSlot(alice, 'Bob')).toHaveAttribute(
      'aria-label',
      'Remove from room',
    )
    await expect(hostVotingToggle(alice)).toBeVisible()

    await aliceCtx.close()
    await bobCtx.close()
  })

  test('the new host rises to the top of the roster after a handover', async ({
    browser,
  }) => {
    // The snapshot arrives in join order, so before the handover Alice (creator) is
    // first by coincidence. The point is that the host is first *because* they hold
    // the role: Carol joins last and must jump to the top once she has it.
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    const code = await createRoom(alice, 'Alice')

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await joinViaCode(bob, code, 'Bob')

    const carolCtx = await browser.newContext()
    const carol = await carolCtx.newPage()
    await joinViaCode(carol, code, 'Carol')

    await rosterTrigger(alice).click()
    await expect(rosterRows(alice).nth(0)).toContainText('Alice')
    await expect(rosterRows(alice).nth(2)).toContainText('Carol')

    await handOver(alice, 'Carol')
    await expect(hostVotingToggle(carol)).toBeVisible()

    // Carol now holds the role, so her row leads on her own roster…
    await rosterTrigger(carol).click()
    await expect(rosterRows(carol).nth(0)).toContainText('Carol')
    await expect(rosterRows(carol).nth(0)).toContainText('host')
    await expect(rosterRows(carol).nth(0)).toContainText('me')
    // …and the others keep join order behind her.
    await expect(rosterRows(carol).nth(1)).toContainText('Alice')
    await expect(rosterRows(carol).nth(2)).toContainText('Bob')

    await aliceCtx.close()
    await bobCtx.close()
    await carolCtx.close()
  })

  test('the row buttons hold fixed geometry across every confirm state', async ({
    browser,
  }) => {
    // The V1 constraint, restated for the fixed confirm order. What is still
    // guaranteed: neither button ever MOVES — the row is two buttons wide in every
    // state, so geometry is identical idle, handover-armed, and removal-armed.
    //
    // What is deliberately NOT guaranteed any more: that clicking twice in one place
    // confirms. Cancel is pinned to the first position and Confirm to the second, so
    // arming the FIRST position's action moves its Confirm off the pressed button —
    // asserted as such in the sibling test below. jsdom has no layout, so only a real
    // browser can assert geometry.
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    const code = await createRoom(alice, 'Alice')

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await joinViaCode(bob, code, 'Bob')

    await rosterTrigger(alice).click()
    const boxes = async () => [
      (await firstSlot(alice, 'Bob').boundingBox())!,
      (await secondSlot(alice, 'Bob').boundingBox())!,
    ]
    const [firstIdle, secondIdle] = await boxes()

    // Make host first, Remove second.
    expect(firstIdle.x).toBeLessThan(secondIdle.x)

    for (const arm of [
      () => firstSlot(alice, 'Bob').click(), // handover
      () => secondSlot(alice, 'Bob').click(), // removal
    ]) {
      await arm()
      const [firstArmed, secondArmed] = await boxes()
      expect(firstArmed.x).toBeCloseTo(firstIdle.x, 0)
      expect(firstArmed.y).toBeCloseTo(firstIdle.y, 0)
      expect(secondArmed.x).toBeCloseTo(secondIdle.x, 0)
      expect(secondArmed.y).toBeCloseTo(secondIdle.y, 0)

      // …and the roles sit in the same places for both actions, which is the point.
      await expect(firstSlot(alice, 'Bob')).toHaveAttribute(
        'aria-label',
        'Cancel',
      )
      await expect(secondSlot(alice, 'Bob')).toHaveAttribute(
        'aria-label',
        /^Confirm /,
      )
      await cancelAction(alice, 'Bob').click()
    }

    await expect(hostVotingToggle(alice)).toBeVisible() // nothing was committed

    await aliceCtx.close()
    await bobCtx.close()
  })

  test('the outgoing host rejoins the voter pool and can vote', async ({
    browser,
  }) => {
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    const code = await createRoom(alice, 'Alice')

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await joinViaCode(bob, code, 'Bob')

    // Alice opts out while host, so she has no deck. The opt-out is a privilege of
    // the ROLE, not of the person — it must not follow her out of it.
    await setHostVoting(alice, false)
    await setTopic(alice, 'Login page')
    await expect(voteCard(alice, '5')).toHaveCount(0)

    await rosterTrigger(alice).click()
    await handOver(alice, 'Bob')

    // She is an ordinary participant now: deck back, and she can actually cast.
    await expect(voteCard(alice, '5')).toBeVisible()
    await voteCard(alice, '5').click()
    await expect(rosterEntry(alice, 'Alice')).toHaveAttribute(
      'data-state',
      'voted',
    )
    // And Bob did not inherit an opt-out he never chose.
    await expect(hostVotingToggle(bob)).toBeChecked()

    await aliceCtx.close()
    await bobCtx.close()
  })

  test('the role can be handed on again, and the first host stays a plain voter', async ({
    browser,
  }) => {
    // The "indefinitely, no residue" test — the claim unit tests cover worst.
    const aCtx = await browser.newContext()
    const a = await aCtx.newPage()
    const code = await createRoom(a, 'Alice')

    const bCtx = await browser.newContext()
    const b = await bCtx.newPage()
    await joinViaCode(b, code, 'Bob')

    const cCtx = await browser.newContext()
    const c = await cCtx.newPage()
    await joinViaCode(c, code, 'Carol')

    const pages = [a, b, c]
    /** Exactly one host across every client — the single-host invariant. */
    const expectSoleHost = async (holder: Page) => {
      for (const p of pages) {
        await expect(hostVotingToggle(p)).toHaveCount(p === holder ? 1 : 0)
      }
    }

    await expectSoleHost(a)

    // A -> B
    await rosterTrigger(a).click()
    await handOver(a, 'Bob')
    await expectSoleHost(b)

    // B -> C
    await rosterTrigger(b).click()
    await handOver(b, 'Carol')
    await expectSoleHost(c)

    // Alice is still an ordinary voting participant two hops later — residue from
    // the first handover would surface here rather than immediately after it.
    await setTopic(c, 'Signup flow')
    await expect(voteCard(a, '8')).toBeVisible()
    await voteCard(a, '8').click()
    await expect(rosterEntry(a, 'Alice')).toHaveAttribute('data-state', 'voted')

    await aCtx.close()
    await bCtx.close()
    await cCtx.close()
  })

  test('a handover after reveal keeps the results and shows the ex-host as unvoted', async ({
    browser,
  }) => {
    // §A in the real stack: a handover touches no input to results().
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    const code = await createRoom(alice, 'Alice')

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await joinViaCode(bob, code, 'Bob')

    await setHostVoting(alice, false) // Alice facilitates; only Bob votes
    await setTopic(alice, 'Login page')
    await voteCard(bob, '5').click()
    await revealButton(alice).click()

    await showStats(alice)
    // Re-rooted from `alice.locator('section.card')` when the stats view gained
    // the Graph card above Results (V8/D-56): one card became two and the bare
    // locator went strict-mode ambiguous. Every assertion here is positive and
    // was always about the Results card specifically, so narrowing loses nothing.
    const results = card(alice, 'Results')
    await expect(results).toContainText('Average: 5.0')
    await expect(results).toContainText(/consensus/i)

    await rosterTrigger(alice).click()
    await handOver(alice, 'Bob')
    await expect(hostVotingToggle(bob)).toBeVisible()

    // The revealed round's stats are untouched by the handover — that is exactly
    // what §A claims, and no more. Deliberately NOT asserting the whole card is
    // textually identical: the "host" badge legitimately moves from Alice's row to
    // Bob's, which is the handover working rather than a regression. Votes,
    // average, and consensus are the invariants.
    await expect(results).toContainText('Average: 5.0')
    await expect(results).toContainText(/consensus/i)
    await expect(results).toContainText('5')

    // And the ex-host now appears in the revealed grid without a vote — rendered
    // as the not-voted glyph, which ParticipantCard already anticipates. Asserted
    // via data-state because the redesign shows state by glyph, not text.
    // Back to the cards view first: only one of the two is mounted at a time (S18).
    await showCards(alice)
    await expect(participantCards(alice)).toHaveCount(2)
    await expect(rosterEntry(alice, 'Alice')).toHaveAttribute(
      'data-state',
      'not-voted',
    )

    await aliceCtx.close()
    await bobCtx.close()
  })

  test('keyboard: the roster is operable and Escape is layered', async ({
    browser,
  }) => {
    // The one test that exercises the keyboard model in a real browser rather
    // than jsdom, where focus emulation is only partial.
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    const code = await createRoom(alice, 'Alice')

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await joinViaCode(bob, code, 'Bob')

    await rosterTrigger(alice).click()

    // Arrow keys move into the rows (richer than role="group" requires, D-46). The
    // walk is over every slot, so the first stop is Bob's Make host — which is also a
    // live assertion of the within-row order.
    await alice.keyboard.press('ArrowDown')
    await expect(firstSlot(alice, 'Bob')).toBeFocused()

    await alice.keyboard.press('Enter')
    await expect(secondSlot(alice, 'Bob')).toHaveAttribute(
      'aria-label',
      'Confirm handover',
    )
    // Confirm is always the SECOND position, so arming the first one moves focus onto
    // it. Without that, this Enter-Enter path could never complete the handover — a
    // keyboard user's second Enter would land on Cancel. The assertion that fails if
    // the focus effect is removed.
    await expect(secondSlot(alice, 'Bob')).toBeFocused()

    // Layered dismissal: first Escape cancels the confirm, panel stays open — and
    // focus returns to "Make host" rather than being stranded on the second position,
    // which is "Remove from room" and one Enter from a removal.
    await alice.keyboard.press('Escape')
    await expect(firstSlot(alice, 'Bob')).toHaveAttribute(
      'aria-label',
      'Make host',
    )
    await expect(firstSlot(alice, 'Bob')).toBeFocused()
    await expect(rosterRows(alice)).toHaveCount(2)

    // Second Escape closes the panel and restores focus to the trigger.
    await alice.keyboard.press('Escape')
    await expect(rosterRows(alice)).toHaveCount(0)
    await expect(rosterTrigger(alice)).toBeFocused()

    await aliceCtx.close()
    await bobCtx.close()
  })

})

test.describe('Participant removal (FR-21)', () => {
  test('the host removes a participant, who is told why and drops out of the room', async ({
    browser,
  }) => {
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    const code = await createRoom(alice, 'Alice')

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await joinViaCode(bob, code, 'Bob')

    const carolCtx = await browser.newContext()
    const carol = await carolCtx.newPage()
    await joinViaCode(carol, code, 'Carol')

    await setTopic(alice, 'Login page')
    await expect(participantCards(carol)).toHaveCount(3)

    await rosterTrigger(alice).click()
    await removeFrom(alice, 'Bob')

    // Bob gets his own terminal screen, not the rejoin prompt a stale identity
    // produces — and critically NOT after a detour through "reconnecting", which is
    // what an implementation that leans on the phase rule would give him.
    await expect(bob.getByText(/removed you/i)).toBeVisible()
    await expect(
      bob.getByRole('button', { name: 'Back to start' }),
    ).toBeVisible()
    await expect(bob.getByLabel('Your name')).toHaveCount(0)

    // Everyone else sees the smaller room, live (FR-17).
    await expect(participantCards(carol)).toHaveCount(2)
    await expect(rosterEntry(carol, 'Bob')).toHaveCount(0)
    await expect(rosterRows(alice)).toHaveCount(2)

    await aliceCtx.close()
    await bobCtx.close()
    await carolCtx.close()
  })

  test('the removed participant never sees a room they are not in', async ({
    browser,
  }) => {
    // The ordering guarantee `apply_and_evict` exists for: their socket leaves the
    // fan-out BEFORE the broadcast, so the notice is the next frame they get rather
    // than a snapshot missing their own card. Only a real browser can show that the
    // header/deck never render in that half-state, since jsdom has no paint.
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    const code = await createRoom(alice, 'Alice')

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await joinViaCode(bob, code, 'Bob')

    await setTopic(alice, 'Login page')
    await expect(voteCard(bob, '5')).toBeVisible()

    await rosterTrigger(alice).click()
    await removeFrom(alice, 'Bob')

    await expect(bob.getByText(/removed you/i)).toBeVisible()
    // The room UI is gone wholesale, not merely emptied: no deck to press, no code
    // heading, no reconnect indicator promising a return.
    await expect(voteDeck(bob)).toHaveCount(0)
    await expect(roomCodeHeading(bob, code)).toHaveCount(0)
    await expect(bob.getByText('reconnecting')).toHaveCount(0)

    await aliceCtx.close()
    await bobCtx.close()
  })

  test('a removed participant can rejoin as a fresh participant', async ({
    browser,
  }) => {
    // Removal is not a ban (D-15): the code still works. Pinned as decided v0.1
    // behavior so nobody later files it as a bug — and so the terminal notice is not
    // mistaken for a lockout.
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    const code = await createRoom(alice, 'Alice')

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await joinViaCode(bob, code, 'Bob')

    await rosterTrigger(alice).click()
    await removeFrom(alice, 'Bob')
    await expect(bob.getByText(/removed you/i)).toBeVisible()

    // Same tab, same browser context: the session was cleared, so this is a genuine
    // fresh join rather than a reattach with a dead id.
    await joinViaCode(bob, code, 'Bob')
    await expect(participantCards(alice)).toHaveCount(2)
    await expect(rosterEntry(alice, 'Bob')).toBeVisible()

    await aliceCtx.close()
    await bobCtx.close()
  })

  test('one press only arms the removal; cancel calls it off', async ({
    browser,
  }) => {
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    const code = await createRoom(alice, 'Alice')

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await joinViaCode(bob, code, 'Bob')

    await rosterTrigger(alice).click()
    await secondSlot(alice, 'Bob').click()

    await expect(secondSlot(alice, 'Bob')).toHaveAttribute(
      'aria-label',
      'Confirm removal',
    )
    // Armed, but Bob is untouched — a removal is irreversible from his side.
    await expect(roomCodeHeading(bob, code)).toBeVisible()
    // …and the row's other action is gone, replaced by Cancel in its own slot — so the
    // armed row offers exactly one consequential press plus a way out.
    await expect(firstSlot(alice, 'Bob')).toHaveAttribute('aria-label', 'Cancel')

    await cancelAction(alice, 'Bob').click()

    await expect(secondSlot(alice, 'Bob')).toHaveAttribute(
      'aria-label',
      'Remove from room',
    )
    await expect(firstSlot(alice, 'Bob')).toHaveAttribute(
      'aria-label',
      'Make host',
    )
    await expect(roomCodeHeading(bob, code)).toBeVisible()

    await aliceCtx.close()
    await bobCtx.close()
  })

  test('a second click in place confirms a removal but cancels a handover', async ({
    browser,
  }) => {
    // The consequence of pinning Cancel first and Confirm second, asserted rather than
    // left to be discovered. Confirm shares the second position with Remove, so a
    // removal IS a double-press in place; Make host owns the first position, so its
    // Confirm moves away and a second press there lands on Cancel.
    //
    // Both halves matter. The removal half is the one that could complete an
    // irreversible action on a stray double-click, so it is pinned deliberately rather
    // than by accident. The handover half fails safe — nothing happens — which is why
    // it is acceptable at all.
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    const code = await createRoom(alice, 'Alice')

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await joinViaCode(bob, code, 'Bob')

    const carolCtx = await browser.newContext()
    const carol = await carolCtx.newPage()
    await joinViaCode(carol, code, 'Carol')

    await rosterTrigger(alice).click()

    // --- handover: two presses in one place arm, then CANCEL.
    const hostBox = (await firstSlot(alice, 'Bob').boundingBox())!
    const clickHost = () =>
      alice.mouse.click(
        hostBox.x + hostBox.width / 2,
        hostBox.y + hostBox.height / 2,
      )
    await clickHost()
    await expect(firstSlot(alice, 'Bob')).toHaveAttribute('aria-label', 'Cancel')
    await clickHost()

    await expect(firstSlot(alice, 'Bob')).toHaveAttribute(
      'aria-label',
      'Make host',
    )
    await expect(hostVotingToggle(alice)).toBeVisible() // Alice is still host
    await expect(hostVotingToggle(bob)).toHaveCount(0)

    // --- removal: two presses in one place arm, then CONFIRM.
    const removeBox = (await secondSlot(alice, 'Carol').boundingBox())!
    const clickRemove = () =>
      alice.mouse.click(
        removeBox.x + removeBox.width / 2,
        removeBox.y + removeBox.height / 2,
      )
    await clickRemove()
    await expect(secondSlot(alice, 'Carol')).toHaveAttribute(
      'aria-label',
      'Confirm removal',
    )
    await clickRemove()

    await expect(carol.getByText(/removed you/i)).toBeVisible()

    await aliceCtx.close()
    await bobCtx.close()
    await carolCtx.close()
  })

  test('the host cannot remove themselves', async ({ browser }) => {
    // Constraint 3: a host who wants out hands over first, then leaves. The absence
    // of the control is the affordance; the domain refuses it either way.
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    const code = await createRoom(alice, 'Alice')

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await joinViaCode(bob, code, 'Bob')

    await rosterTrigger(alice).click()
    await expect(rosterRows(alice).nth(0)).toContainText('Alice')
    await expect(secondSlot(alice, 'Alice')).toHaveCount(0)
    await expect(firstSlot(alice, 'Alice')).toHaveCount(0)
    // Every other row has both.
    await expect(secondSlot(alice, 'Bob')).toBeVisible()
    await expect(firstSlot(alice, 'Bob')).toBeVisible()

    await aliceCtx.close()
    await bobCtx.close()
  })

  test('removing a voter after reveal recomputes the results', async ({
    browser,
  }) => {
    // The inverse of the handover's byte-identical guarantee, deliberately (D-47): a
    // removal drops the target's vote, so a revealed round genuinely changes. This is
    // the leave path's documented behavior reached by a host action.
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    const code = await createRoom(alice, 'Alice')

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await joinViaCode(bob, code, 'Bob')

    const carolCtx = await browser.newContext()
    const carol = await carolCtx.newPage()
    await joinViaCode(carol, code, 'Carol')

    await setHostVoting(alice, false) // Alice facilitates; Bob and Carol vote
    await setTopic(alice, 'Login page')
    await voteCard(bob, '5').click()
    await voteCard(carol, '13').click()
    await revealButton(alice).click()

    await showStats(alice)
    // Two locators where there used to be one. `alice.locator('section.card')`
    // matched the single card the room rendered, so it stood in for both "the
    // Results card says X" and "the view says nothing about consensus". The
    // Graph card (V8/D-56) split those meanings apart:
    //
    //   positives -> Results, which is what they always meant;
    //   the negative -> the whole room, because it is a whole-view claim. This
    //   test's name is its contract: before the removal the round is NOT a
    //   consensus, and no widget anywhere may say otherwise. Narrowing it to
    //   Results would move the entire Graph card out of the pin's reach and let
    //   a "consensus" printed there pass a test named for its absence.
    const results = card(alice, 'Results')
    const room = alice.locator('.room')
    await expect(results).toContainText('Average: 9.0')
    // `toBeVisible` first because a negative over a locator that matches nothing
    // is satisfied by the nothing. This one line is what makes the next assertion
    // mean "the room says no such word" rather than "there is no room".
    await expect(room).toBeVisible()
    await expect(room).not.toContainText(/consensus/i)

    await rosterTrigger(alice).click()
    await removeFrom(alice, 'Carol')
    await expect(carol.getByText(/removed you/i)).toBeVisible()

    // Removing the dissenter flips the round to consensus, live and post-reveal.
    // Asserted rather than tolerated: it is the point of not locking this action.
    await expect(results).toContainText('Average: 5.0')
    await expect(results).toContainText(/consensus/i)

    await aliceCtx.close()
    await bobCtx.close()
    await carolCtx.close()
  })

  test('a removal frees the seat it took', async ({ browser }) => {
    // "Remove someone to make room" has to actually work, end to end.
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    const code = await createRoom(alice, 'Alice')

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await joinViaCode(bob, code, 'Bob')

    await rosterTrigger(alice).click()
    await removeFrom(alice, 'Bob')
    await expect(rosterRows(alice)).toHaveCount(1)

    const daveCtx = await browser.newContext()
    const dave = await daveCtx.newPage()
    await joinViaCode(dave, code, 'Dave')

    await expect(participantCards(alice)).toHaveCount(2)
    await expect(rosterEntry(alice, 'Dave')).toBeVisible()

    await aliceCtx.close()
    await bobCtx.close()
    await daveCtx.close()
  })

  test('the new host can remove, and the old one no longer can', async ({
    browser,
  }) => {
    // The two room-control actions compose: authority is whoever holds the role right
    // now, so a handover moves the ability to remove along with everything else.
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    const code = await createRoom(alice, 'Alice')

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await joinViaCode(bob, code, 'Bob')

    const carolCtx = await browser.newContext()
    const carol = await carolCtx.newPage()
    await joinViaCode(carol, code, 'Carol')

    await rosterTrigger(alice).click()
    await handOver(alice, 'Bob')

    // The roster control is host-only, so it leaves Alice entirely with the role.
    await expect(rosterTrigger(alice)).toHaveCount(0)

    await rosterTrigger(bob).click()
    await removeFrom(bob, 'Carol')

    await expect(carol.getByText(/removed you/i)).toBeVisible()
    await expect(participantCards(alice)).toHaveCount(2)
    // And Bob can now remove the participant who used to be his host.
    await expect(secondSlot(bob, 'Alice')).toBeVisible()

    await aliceCtx.close()
    await bobCtx.close()
    await carolCtx.close()
  })

  test('keyboard: a removal is confirmable without a pointer', async ({
    browser,
  }) => {
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    const code = await createRoom(alice, 'Alice')

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await joinViaCode(bob, code, 'Bob')

    await rosterTrigger(alice).click()

    await alice.keyboard.press('ArrowDown') // into Bob's Make host
    await alice.keyboard.press('ArrowDown') // → Bob's Remove
    await expect(secondSlot(alice, 'Bob')).toBeFocused()

    await alice.keyboard.press('Enter') // arms
    await expect(secondSlot(alice, 'Bob')).toHaveAttribute(
      'aria-label',
      'Confirm removal',
    )
    // Focus survives the relabel because the same DOM node is reused — which is what
    // makes Enter-Enter work at all, and what adding a second button could have broken.
    await expect(secondSlot(alice, 'Bob')).toBeFocused()

    // Escape is layered here too: the confirm goes, the panel stays.
    await alice.keyboard.press('Escape')
    await expect(secondSlot(alice, 'Bob')).toHaveAttribute(
      'aria-label',
      'Remove from room',
    )
    await expect(rosterRows(alice)).toHaveCount(2)
    await expect(roomCodeHeading(bob, code)).toBeVisible()

    // Then arm and confirm for real.
    await alice.keyboard.press('Enter')
    await alice.keyboard.press('Enter')
    await expect(bob.getByText(/removed you/i)).toBeVisible()

    await aliceCtx.close()
    await bobCtx.close()
  })
})
