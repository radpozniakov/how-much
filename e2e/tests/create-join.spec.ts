import { expect, test } from '@playwright/test'
import {
  createRoom,
  hostVotingToggle,
  joinViaCode,
  joinViaLink,
  participantCards,
  revealButton,
  roomCodeHeading,
  rosterEntry,
  topicEditor,
} from './helpers'

// Room creation, identity, and the two join paths (code + shareable link).
// Covers FR-1, FR-2a, FR-3, FR-4, FR-17.

test.describe('Create & join', () => {
  test('creator becomes host and gets a shareable link (FR-1, FR-2a)', async ({
    page,
  }) => {
    const code = await createRoom(page, 'Alice')

    // The header carries the bare code (DN-D) and identifies the participant.
    await expect(roomCodeHeading(page, code)).toBeVisible()
    await expect(page.locator('.room-header__name')).toHaveText('Alice')
    // The creator's own participant card is present.
    await expect(rosterEntry(page, 'Alice')).toBeVisible()

    // Host affordances are present for the creator (FR-12/FR-13). There is no
    // "Host controls" card any more — they are the stage topic editor, the
    // "I'm voting" toggle, and the reveal button below the grid.
    await expect(topicEditor(page)).toBeVisible()
    await expect(hostVotingToggle(page)).toBeVisible()
    await expect(revealButton(page)).toBeVisible()

    // The header copy button copies the canonical deep link for this room
    // (FR-2a). Read it back from the clipboard to confirm the value.
    await page
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.getByRole('button', { name: 'Copy room link' }).click()
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toBe(`http://localhost:5173/room/${code}`)
  })

  test('a second participant joins by code and both see each other (FR-3, FR-17)', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext()
    const host = await hostCtx.newPage()
    const code = await createRoom(host, 'Alice')

    const guestCtx = await browser.newContext()
    const guest = await guestCtx.newPage()
    await joinViaCode(guest, code, 'Bob')

    // Presence fans out to everyone (FR-17): both grids show two people.
    for (const p of [host, guest]) {
      await expect(participantCards(p)).toHaveCount(2)
      await expect(rosterEntry(p, 'Alice')).toBeVisible()
      await expect(rosterEntry(p, 'Bob')).toBeVisible()
    }
    // Bob is not the host: no topic editor, no voting toggle, no reveal button.
    await expect(topicEditor(guest)).toHaveCount(0)
    await expect(hostVotingToggle(guest)).toHaveCount(0)
    await expect(revealButton(guest)).toHaveCount(0)

    await hostCtx.close()
    await guestCtx.close()
  })

  test('a participant joins via the shareable deep link (FR-2a, FR-3)', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext()
    const host = await hostCtx.newPage()
    const code = await createRoom(host, 'Alice')

    const guestCtx = await browser.newContext()
    const guest = await guestCtx.newPage()
    await joinViaLink(guest, code, 'Bob')

    await expect(host.getByText('Bob')).toBeVisible()
    await expect(participantCards(guest)).toHaveCount(2)

    await hostCtx.close()
    await guestCtx.close()
  })

  test('non-unique display names are allowed and disambiguated (FR-4)', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext()
    const host = await hostCtx.newPage()
    const code = await createRoom(host, 'Sam')

    const guestCtx = await browser.newContext()
    const guest = await guestCtx.newPage()
    await joinViaCode(guest, code, 'Sam')

    // Two people named "Sam" coexist — the grid shows two cards, both named Sam.
    await expect(participantCards(host)).toHaveCount(2)
    await expect(
      participantCards(host).filter({ hasText: 'Sam' }),
    ).toHaveCount(2)

    await hostCtx.close()
    await guestCtx.close()
  })
})
