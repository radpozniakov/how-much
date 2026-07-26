import { expect, test, type Page } from '@playwright/test'
import {
  card,
  createRoom,
  joinViaCode,
  participantCards,
  resultEntry,
  revealButton,
  rosterEntry,
  setHostVoting,
  setTopic,
  showStats,
  voteCard,
  voteDeck,
} from './helpers'

// The heart of the app: private voting, then a host-triggered simultaneous
// reveal with stats. Covers FR-9, FR-10, FR-11, FR-12, FR-15, FR-16.
//
// The host opts out of voting in each scenario so the vote set is exactly the
// two participants — deterministic average/consensus assertions.

async function setupRoom(
  browser: Parameters<Parameters<typeof test>[2]>[0]['browser'],
  cards?: string,
) {
  const hostCtx = await browser.newContext()
  const host = await hostCtx.newPage()
  const code = await createRoom(host, 'Host', cards)
  await setHostVoting(host, false) // facilitator only
  // Voting and revealing are both gated on an estimation subject existing, so
  // every scenario here needs a topic before anyone can cast a card.
  await setTopic(host, 'Estimate the login page')

  const aCtx = await browser.newContext()
  const a = await aCtx.newPage()
  await joinViaCode(a, code, 'Ann')

  const bCtx = await browser.newContext()
  const b = await bCtx.newPage()
  await joinViaCode(b, code, 'Ben')

  // Both voters have a card before we start. The opted-out host is a facilitator
  // and is excluded from the grid (FR-17), so this is 2, not 3 — the host is
  // still in the room and still appears in the header roster (S23).
  await expect(participantCards(host)).toHaveCount(2)

  const cleanup = async () => {
    await aCtx.close()
    await bCtx.close()
    await hostCtx.close()
  }
  return { host, a, b, cleanup }
}

test.describe('Voting & reveal', () => {
  test('votes stay private until reveal — others see "voted", not the value (FR-10)', async ({
    browser,
  }) => {
    const { host, a, b, cleanup } = await setupRoom(browser)

    await voteCard(a, '5').click()

    // The host (and Ben) see that Ann has voted, but no value is shown anywhere
    // pre-reveal: her card is in the voted state, not revealed, and the Results
    // card does not exist yet.
    await expect(rosterEntry(host, 'Ann')).toHaveAttribute('data-state', 'voted')
    await expect(rosterEntry(b, 'Ann')).toHaveAttribute('data-state', 'voted')
    await expect(card(host, 'Results')).toHaveCount(0)
    // Ben has not voted — his card stays in the not-voted state.
    await expect(rosterEntry(host, 'Ben')).toHaveAttribute(
      'data-state',
      'not-voted',
    )

    await cleanup()
  })

  test('a voter can change their card before reveal (FR-11)', async ({
    browser,
  }) => {
    const { host, a, cleanup } = await setupRoom(browser)

    await voteCard(a, '3').click()
    await expect(voteCard(a, '3')).toHaveAttribute('aria-pressed', 'true')

    await voteCard(a, '8').click()
    await expect(voteCard(a, '8')).toHaveAttribute('aria-pressed', 'true')
    await expect(voteCard(a, '3')).toHaveAttribute('aria-pressed', 'false')

    // Still just "voted" to the host — the change never leaks a value (FR-10).
    await expect(rosterEntry(host, 'Ann')).toHaveAttribute('data-state', 'voted')
    await cleanup()
  })

  test('reveal shows every card to everyone with consensus (FR-12, FR-15, FR-16)', async ({
    browser,
  }) => {
    const { host, a, b, cleanup } = await setupRoom(browser)

    await voteCard(a, '5').click()
    await voteCard(b, '5').click()
    await revealButton(host).click()

    // All three clients now see the Results card with both cards revealed —
    // the dashboard lives in the stats view (S18), so switch there first.
    for (const p of [host, a, b] as Page[]) {
      await showStats(p)
      await expect(card(p, 'Results')).toBeVisible()
      await expect(resultEntry(p, 'Ann')).toContainText('5')
      await expect(resultEntry(p, 'Ben')).toContainText('5')
      await expect(card(p, 'Results')).toContainText('Average:')
      await expect(card(p, 'Results')).toContainText('5.0')
      await expect(card(p, 'Results').getByText('Consensus')).toBeVisible()
    }
    await cleanup()
  })

  test('reveal with differing votes shows the average and no consensus (FR-16)', async ({
    browser,
  }) => {
    const { host, a, b, cleanup } = await setupRoom(browser)

    await voteCard(a, '3').click()
    await voteCard(b, '8').click()
    await revealButton(host).click()

    await showStats(host)
    await expect(card(host, 'Results')).toBeVisible()
    await expect(resultEntry(host, 'Ann')).toContainText('3')
    await expect(resultEntry(host, 'Ben')).toContainText('8')
    // (3 + 8) / 2 = 5.5, and votes differ so no consensus badge.
    await expect(card(host, 'Results')).toContainText('5.5')
    await expect(card(host, 'Results').getByText('Consensus')).toHaveCount(0)

    await cleanup()
  })

  test('a room created with no card values offers the Fibonacci deck (FR-9)', async ({
    browser,
  }) => {
    // Fibonacci is the default rather than the constraint since V4 (D-48), and
    // this is what "left the field blank" gets you.
    const { a, cleanup } = await setupRoom(browser)
    const deck = voteDeck(a).getByRole('button')
    await expect(deck).toHaveText(['0', '1', '2', '3', '5', '8', '13', '21'])
    await cleanup()
  })

  test('a host-chosen deck reaches every client, votes, and reveals (FR-22)', async ({
    browser,
  }) => {
    // The whole slice end to end: the host names the cards at creation, they ride
    // the snapshot to participants who never saw the create form, and a round runs
    // on values the Fibonacci deck does not contain.
    const { host, a, b, cleanup } = await setupRoom(browser, '1, 2, 4, 8, 12, 16')

    // The host opted out of voting in setupRoom, so they have no deck to inspect;
    // the two participants are the ones who received it over the socket.
    for (const p of [a, b] as Page[]) {
      await expect(voteDeck(p).getByRole('button')).toHaveText([
        '1',
        '2',
        '4',
        '8',
        '12',
        '16',
      ])
      // 13 is a Fibonacci card this room does not hold.
      await expect(voteDeck(p).getByRole('button', { name: '13' })).toHaveCount(0)
    }

    await voteCard(a, '12').click()
    await voteCard(b, '4').click()
    await revealButton(host).click()

    await showStats(host)
    await expect(resultEntry(host, 'Ann')).toContainText('12')
    await expect(resultEntry(host, 'Ben')).toContainText('4')
    // (12 + 4) / 2 = 8, formatted to one decimal place.
    await expect(card(host, 'Results')).toContainText('8.0')

    await cleanup()
  })

  test('a deck with decimal cards reveals and averages (FR-22)', async ({
    browser,
  }) => {
    // The V4 landmine through the real stack: `results()` parsed cards with
    // `int()`, so a room holding `0.5` looked fine until the first reveal, then
    // 500'd. Only an actual reveal over the socket proves the fix.
    const { host, a, b, cleanup } = await setupRoom(browser, '0, 0.5, 1, 2')

    await voteCard(a, '0.5').click()
    await voteCard(b, '1').click()
    await revealButton(host).click()

    await showStats(host)
    await expect(resultEntry(host, 'Ann')).toContainText('0.5')
    await expect(resultEntry(host, 'Ben')).toContainText('1')
    // (0.5 + 1) / 2 = 0.75, which Results formats to one decimal place.
    await expect(card(host, 'Results')).toContainText('0.8')

    await cleanup()
  })

  test('a rejected deck keeps the host on the landing page with the reason', async ({
    browser,
  }) => {
    // The one V4 failure an ordinary host can reach: a duplicate no input
    // attribute can prevent, so the 422 has to land as a readable sentence.
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto('/')
    const create = card(page, 'Create a room')
    await create.getByLabel('Your name').fill('Host')
    await create.getByLabel('Card values').fill('1, 1, 2')
    await create.getByRole('button', { name: 'Create', exact: true }).click()

    await expect(create.getByRole('alert')).toContainText(
      'card values must not repeat',
    )
    await expect(page).toHaveURL(/\/$/)
    await ctx.close()
  })
})
