import { expect, test, type Page } from '@playwright/test'
import { createRoom, joinViaCode } from './helpers'

// The host-only participants roster (S23): a users icon beside the host's name
// opens a panel listing everyone in the room, with the host's own row tagged
// "me". UI only in this iteration — the rows carry no actions yet (DN-E).

/** The roster trigger in the header. Named "Room participants" so it does not
 * collide with the participant grid, which is itself labelled "Participants". */
const rosterTrigger = (page: Page) =>
  page.getByRole('button', { name: 'Room participants' })

const rosterRows = (page: Page) => page.locator('.participants-menu__item')

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
