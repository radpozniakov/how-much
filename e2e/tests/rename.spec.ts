import { expect, test } from '@playwright/test'
import { createRoom, joinViaCode, rosterEntry } from './helpers'

// Self-service rename: a participant edits their own name from the room header,
// and the change propagates to every client's header + participant board.

test.describe('Rename', () => {
  test('a participant renames itself and it propagates to everyone', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext()
    const host = await hostCtx.newPage()
    const code = await createRoom(host, 'Alice')

    const guestCtx = await browser.newContext()
    const guest = await guestCtx.newPage()
    await joinViaCode(guest, code, 'Bob')

    // Clicking the header name turns it into an inline input.
    await host.locator('.room-header__name').click()
    const input = host.getByLabel('Your display name')
    await input.fill('Alicia')
    await input.press('Enter')

    // The host's own header reflects the new name (from the server echo).
    await expect(host.locator('.room-header__name')).toHaveText('Alicia')

    // Presence fans out (FR-17): the guest's participant board shows the new
    // name and no longer shows the old one; the guest's own name is untouched.
    await expect(rosterEntry(guest, 'Alicia')).toBeVisible()
    await expect(rosterEntry(guest, 'Alice')).toHaveCount(0)
    await expect(guest.locator('.room-header__name')).toHaveText('Bob')

    await hostCtx.close()
    await guestCtx.close()
  })
})
