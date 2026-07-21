import { expect, test } from '@playwright/test'
import {
  card,
  createRoom,
  joinViaCode,
  rosterEntry,
  setHostVoting,
  voteCard,
} from './helpers'

// Host-only round controls: topic, host-voting toggle, and reset.
// Covers FR-8, FR-13, FR-14.

test.describe('Host controls', () => {
  test('host sets a topic and everyone sees it (FR-8)', async ({ browser }) => {
    const hostCtx = await browser.newContext()
    const host = await hostCtx.newPage()
    const code = await createRoom(host, 'Host')

    const gCtx = await browser.newContext()
    const guest = await gCtx.newPage()
    await joinViaCode(guest, code, 'Guest')

    const topic = card(host, 'Topic').getByLabel('Topic')
    await topic.fill('Estimate the login page')
    await card(host, 'Topic').getByRole('button', { name: 'Set topic' }).click()

    // The non-host sees the topic text (read-only for them).
    await expect(card(guest, 'Topic')).toContainText('Estimate the login page')

    await hostCtx.close()
    await gCtx.close()
  })

  test('host voting toggle shows/hides the host deck (FR-14)', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext()
    const host = await hostCtx.newPage()
    await createRoom(host, 'Host')

    // Host votes by default → deck visible.
    await expect(card(host, 'Your vote')).toBeVisible()

    // Opt out → the host becomes a facilitator with no deck.
    await setHostVoting(host, false)
    await expect(card(host, 'Your vote')).toHaveCount(0)

    // Opt back in → deck returns.
    await setHostVoting(host, true)
    await expect(card(host, 'Your vote')).toBeVisible()

    await hostCtx.close()
  })

  test('host reset clears votes, topic, and results for a fresh round (FR-13)', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext()
    const host = await hostCtx.newPage()
    const code = await createRoom(host, 'Host')
    await setHostVoting(host, false)

    const gCtx = await browser.newContext()
    const guest = await gCtx.newPage()
    await joinViaCode(guest, code, 'Guest')

    // Set a topic, vote, reveal.
    await card(host, 'Topic').getByLabel('Topic').fill('Round one')
    await card(host, 'Topic').getByRole('button', { name: 'Set topic' }).click()
    await voteCard(guest, '8').click()
    await card(host, 'Host controls').getByRole('button', { name: 'Reveal' }).click()
    await expect(card(host, 'Results')).toBeVisible()

    // Reset → results gone, topic cleared, deck back, no lingering "voted" badge.
    await card(host, 'Host controls').getByRole('button', { name: 'Reset' }).click()
    await expect(card(host, 'Results')).toHaveCount(0)
    await expect(card(guest, 'Results')).toHaveCount(0)
    await expect(card(guest, 'Topic')).toContainText(/Waiting for the host/i)
    await expect(card(guest, 'Your vote')).toBeVisible()
    await expect(rosterEntry(host, 'Guest')).not.toContainText('voted')

    await hostCtx.close()
    await gCtx.close()
  })

  test('a non-host participant has no host controls (FR-12/FR-13)', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext()
    const host = await hostCtx.newPage()
    const code = await createRoom(host, 'Host')

    const gCtx = await browser.newContext()
    const guest = await gCtx.newPage()
    await joinViaCode(guest, code, 'Guest')

    await expect(card(guest, 'Host controls')).toHaveCount(0)
    // The topic is read-only for the non-host (no editor input).
    await expect(card(guest, 'Topic').getByLabel('Topic')).toHaveCount(0)

    await hostCtx.close()
    await gCtx.close()
  })
})
