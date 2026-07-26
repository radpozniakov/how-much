import { expect, test, type Page } from '@playwright/test'
import {
  createRoom,
  hostVotingToggle,
  joinViaCode,
  participantCards,
  revealButton,
  rosterEntry,
  rosterMenuTrigger,
  setHostVoting,
  setTopic,
  showCards,
  showStats,
  voteCard,
} from './helpers'

// The host-only participants roster (S23), now carrying the host-handover action
// (FR-20/D-45): a users icon beside the host's name opens a panel listing everyone
// in the room, with the host's own row tagged "me" and every other row offering a
// two-step "Make host" confirm. The panel stays role="group" with real buttons
// rather than becoming a menu (D-46).

/** The roster trigger in the header — the shared helper; the local duplicate this
 * file used to define has been collapsed into it. */
const rosterTrigger = (page: Page) => rosterMenuTrigger(page)

const rosterRows = (page: Page) => page.locator('.participants-menu__item')

/** The "Make host" / "Confirm" action button inside a named participant's row. */
const rowAction = (page: Page, name: string) =>
  rosterRows(page)
    .filter({ hasText: name })
    .locator('.participants-menu__row-action')

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
    await rowAction(alice, 'Bob').click() // arms the confirm
    await expect(rowAction(alice, 'Bob')).toHaveAttribute('aria-label', 'Confirm')
    await rowAction(alice, 'Bob').click() // commits

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
    await rowAction(alice, 'Bob').click()

    // Armed, but nothing has happened yet — handover is irreversible from the
    // outgoing host's side, so a single misclick must not perform it.
    await expect(rowAction(alice, 'Bob')).toHaveAttribute('aria-label', 'Confirm')
    await expect(hostVotingToggle(alice)).toBeVisible()
    await expect(hostVotingToggle(bob)).toHaveCount(0)

    await rosterRows(alice)
      .filter({ hasText: 'Bob' })
      .locator('.participants-menu__row-cancel')
      .click()

    await expect(rowAction(alice, 'Bob')).toHaveAttribute('aria-label', 'Make host')
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

    await rowAction(alice, 'Carol').click()
    await rowAction(alice, 'Carol').click()
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

  test('the action button does not move when the confirm arms', async ({
    browser,
  }) => {
    // Clicking twice in the SAME place must confirm, matching the keyboard path
    // (Enter arms, Enter confirms). Cancel therefore renders to the left of the
    // action rather than appearing under the cursor — otherwise a mouse user's
    // second click lands on Cancel while a keyboard user's second Enter confirms,
    // and the two input modes disagree. jsdom has no layout, so only a real
    // browser can assert this.
    const aliceCtx = await browser.newContext()
    const alice = await aliceCtx.newPage()
    const code = await createRoom(alice, 'Alice')

    const bobCtx = await browser.newContext()
    const bob = await bobCtx.newPage()
    await joinViaCode(bob, code, 'Bob')

    await rosterTrigger(alice).click()
    const before = await rowAction(alice, 'Bob').boundingBox()

    await rowAction(alice, 'Bob').click() // arms
    await expect(rowAction(alice, 'Bob')).toHaveAttribute(
      'aria-label',
      'Confirm',
    )
    const after = await rowAction(alice, 'Bob').boundingBox()

    expect(after!.x).toBeCloseTo(before!.x, 0)
    expect(after!.y).toBeCloseTo(before!.y, 0)

    // And a second click at that same point commits, rather than cancelling.
    await alice.mouse.click(
      before!.x + before!.width / 2,
      before!.y + before!.height / 2,
    )
    await expect(hostVotingToggle(bob)).toBeVisible()

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
    await rowAction(alice, 'Bob').click()
    await rowAction(alice, 'Bob').click()

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
    await rowAction(a, 'Bob').click()
    await rowAction(a, 'Bob').click()
    await expectSoleHost(b)

    // B -> C
    await rosterTrigger(b).click()
    await rowAction(b, 'Carol').click()
    await rowAction(b, 'Carol').click()
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
    const results = alice.locator('section.card')
    await expect(results).toContainText('Average: 5.0')
    await expect(results).toContainText(/consensus/i)

    await rosterTrigger(alice).click()
    await rowAction(alice, 'Bob').click()
    await rowAction(alice, 'Bob').click()
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

    // Arrow keys move into the rows (richer than role="group" requires, D-46).
    await alice.keyboard.press('ArrowDown')
    await expect(rowAction(alice, 'Bob')).toBeFocused()

    await alice.keyboard.press('Enter')
    await expect(rowAction(alice, 'Bob')).toHaveAttribute('aria-label', 'Confirm')
    // Focus survives the relabel because the same DOM node is reused.
    await expect(rowAction(alice, 'Bob')).toBeFocused()

    // Layered dismissal: first Escape cancels the confirm, panel stays open.
    await alice.keyboard.press('Escape')
    await expect(rowAction(alice, 'Bob')).toHaveAttribute('aria-label', 'Make host')
    await expect(rosterRows(alice)).toHaveCount(2)

    // Second Escape closes the panel and restores focus to the trigger.
    await alice.keyboard.press('Escape')
    await expect(rosterRows(alice)).toHaveCount(0)
    await expect(rosterTrigger(alice)).toBeFocused()

    await aliceCtx.close()
    await bobCtx.close()
  })
})
