import { expect, test } from '@playwright/test'
import {
  card,
  createRoom,
  hostVotingToggle,
  joinViaCode,
  resetButton,
  revealButton,
  rosterEntry,
  setHostVoting,
  setTopic,
  showCards,
  showStats,
  stage,
  topicEditor,
  voteCard,
  voteDeck,
} from './helpers'

// Host-only round controls: topic, host-voting toggle, and reset.
// Covers FR-8, FR-13, FR-14.
//
// The redesign dissolved the "Host controls" card: the topic editor IS the stage
// title for the host, the "I'm voting" toggle sits under the stage status line,
// and reveal/reset is one button below the grid that swaps its label.

test.describe('Host controls', () => {
  test('host sets a topic and everyone sees it (FR-8)', async ({ browser }) => {
    const hostCtx = await browser.newContext()
    const host = await hostCtx.newPage()
    const code = await createRoom(host, 'Host')

    const gCtx = await browser.newContext()
    const guest = await gCtx.newPage()
    await joinViaCode(guest, code, 'Guest')

    await setTopic(host, 'Estimate the login page')

    // The non-host sees the topic title on the stage (read-only for them).
    await expect(stage(guest)).toContainText('Estimate the login page')

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
    await expect(voteDeck(host)).toBeVisible()

    // Opt out → the host becomes a facilitator with no deck.
    await setHostVoting(host, false)
    await expect(voteDeck(host)).toHaveCount(0)

    // Opt back in → deck returns.
    await setHostVoting(host, true)
    await expect(voteDeck(host)).toBeVisible()

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
    await setTopic(host, 'Round one')
    await voteCard(guest, '8').click()
    await revealButton(host).click()

    // Results now live in the stats view (S18) — switch there to assert them,
    // then back to the cards view so the grid assertions below have a grid.
    await showStats(host)
    await expect(card(host, 'Results')).toBeVisible()
    await showCards(host)

    // Reset — the single host button has flipped to "New voting" once revealed.
    await resetButton(host).click()

    // Topic cleared, deck back for the guest, no lingering "voted" state.
    await expect(topicEditor(host)).toHaveValue('')
    await expect(stage(guest)).toContainText(/Waiting for the host/i)
    await expect(voteDeck(guest)).toBeVisible()
    await expect(rosterEntry(host, 'Guest')).toHaveAttribute(
      'data-state',
      'not-voted',
    )
    // And the stats view has nothing to show again (pre-reveal, FR-10).
    await showStats(host)
    await expect(card(host, 'Results')).toHaveCount(0)
    await expect(
      host.getByText(/Vote values appear here once the host reveals/i),
    ).toBeVisible()

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

    // No reveal/reset, no voting toggle, and the topic is read-only (the stage
    // title is a heading or empty-state paragraph, never an editable textbox).
    await expect(revealButton(guest)).toHaveCount(0)
    await expect(resetButton(guest)).toHaveCount(0)
    await expect(hostVotingToggle(guest)).toHaveCount(0)
    await expect(topicEditor(guest)).toHaveCount(0)

    await hostCtx.close()
    await gCtx.close()
  })
})
