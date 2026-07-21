import { expect, test } from '@playwright/test'
import { card, createRoom, joinViaCode, joinViaLink, rosterEntry } from './helpers'

// Room creation, identity, and the two join paths (code + shareable link).
// Covers FR-1, FR-2a, FR-3, FR-4, FR-17.

test.describe('Create & join', () => {
  test('creator becomes host and gets a shareable link (FR-1, FR-2a)', async ({
    page,
  }) => {
    const code = await createRoom(page, 'Alice')

    // The room header carries the code, and the creator is flagged host + you.
    await expect(page.getByRole('heading', { name: `Room ${code}` })).toBeVisible()
    const alice = rosterEntry(page, 'Alice')
    await expect(alice).toContainText('host')
    await expect(alice).toContainText('you')

    // Host-only controls are present for the creator (FR-12/FR-13).
    await expect(card(page, 'Host controls')).toBeVisible()

    // The share link is the canonical deep link for this room (FR-2a). It's a
    // read-only textbox (the Topic input is the only other one, and it's not
    // read-only), so target it by that.
    const link = page.locator('input[readonly]')
    await expect(link).toHaveValue(`http://localhost:5173/room/${code}`)
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

    // Presence fans out to everyone (FR-17): both rosters show two people.
    for (const p of [host, guest]) {
      await expect(card(p, /Participants \(2\)/)).toBeVisible()
      await expect(rosterEntry(p, 'Alice')).toContainText('host')
      await expect(rosterEntry(p, 'Bob')).toBeVisible()
    }
    // Bob is not the host and gets no host controls.
    await expect(card(guest, 'Host controls')).toHaveCount(0)

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
    await expect(card(guest, /Participants \(2\)/)).toBeVisible()

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

    // Two people named "Sam" coexist — the roster lists two entries.
    await expect(card(host, /Participants \(2\)/)).toBeVisible()
    await expect(card(host, /Participants/).locator('li')).toHaveCount(2)

    await hostCtx.close()
    await guestCtx.close()
  })
})
