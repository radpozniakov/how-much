import { expect, test, type Page } from '@playwright/test'
import {
  card,
  createRoom,
  joinViaCode,
  resultEntry,
  rosterEntry,
  setHostVoting,
  voteCard,
} from './helpers'

// The heart of the app: private voting, then a host-triggered simultaneous
// reveal with stats. Covers FR-9, FR-10, FR-11, FR-12, FR-15, FR-16.
//
// The host opts out of voting in each scenario so the vote set is exactly the
// two participants — deterministic average/consensus assertions.

async function setupRoom(browser: Parameters<Parameters<typeof test>[2]>[0]['browser']) {
  const hostCtx = await browser.newContext()
  const host = await hostCtx.newPage()
  const code = await createRoom(host, 'Host')
  await setHostVoting(host, false) // facilitator only

  const aCtx = await browser.newContext()
  const a = await aCtx.newPage()
  await joinViaCode(a, code, 'Ann')

  const bCtx = await browser.newContext()
  const b = await bCtx.newPage()
  await joinViaCode(b, code, 'Ben')

  // Everyone sees all three before we start.
  await expect(card(host, /Participants \(3\)/)).toBeVisible()

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
    // pre-reveal: the Results card does not exist yet.
    await expect(rosterEntry(host, 'Ann')).toContainText('voted')
    await expect(rosterEntry(b, 'Ann')).toContainText('voted')
    await expect(card(host, 'Results')).toHaveCount(0)
    // Ben has not voted — no "voted" badge on his entry.
    await expect(rosterEntry(host, 'Ben')).not.toContainText('voted')

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
    await expect(rosterEntry(host, 'Ann')).toContainText('voted')
    await cleanup()
  })

  test('reveal shows every card to everyone with consensus (FR-12, FR-15, FR-16)', async ({
    browser,
  }) => {
    const { host, a, b, cleanup } = await setupRoom(browser)

    await voteCard(a, '5').click()
    await voteCard(b, '5').click()
    await card(host, 'Host controls').getByRole('button', { name: 'Reveal' }).click()

    // All three clients now see the Results card with both cards revealed.
    for (const p of [host, a, b] as Page[]) {
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
    await card(host, 'Host controls').getByRole('button', { name: 'Reveal' }).click()

    await expect(card(host, 'Results')).toBeVisible()
    await expect(resultEntry(host, 'Ann')).toContainText('3')
    await expect(resultEntry(host, 'Ben')).toContainText('8')
    // (3 + 8) / 2 = 5.5, and votes differ so no consensus badge.
    await expect(card(host, 'Results')).toContainText('5.5')
    await expect(card(host, 'Results').getByText('Consensus')).toHaveCount(0)

    await cleanup()
  })

  test('the deck offers exactly the Fibonacci cards (FR-9)', async ({
    browser,
  }) => {
    const { a, cleanup } = await setupRoom(browser)
    const deck = card(a, 'Your vote').getByRole('button')
    await expect(deck).toHaveText(['0', '1', '2', '3', '5', '8', '13', '21'])
    await cleanup()
  })
})
