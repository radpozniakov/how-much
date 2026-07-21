import { expect, test } from '@playwright/test'
import { card, createRoom, joinViaCode, waitForLive } from './helpers'

// Error and reconnection paths. Covers FR-18 and robustness of the join flow.

test.describe('Edge cases', () => {
  test('deep-linking a non-existent room shows a clear error (robustness)', async ({
    page,
  }) => {
    // A code that does not correspond to any live room.
    await page.goto('/room/ZZZZZZ')
    await expect(
      page.getByRole('heading', { name: 'Join room ZZZZZZ' }),
    ).toBeVisible()

    await page.getByLabel('Your name').fill('Nobody')
    await page.getByRole('button', { name: 'Join' }).click()

    // The join fails with a human-readable message, not a crash.
    await expect(page.getByRole('alert')).toContainText(/No room with that code/i)
  })

  test('reloading a tab recovers into the room (FR-18 / D-39)', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext()
    const host = await hostCtx.newPage()
    const code = await createRoom(host, 'Host')

    const gCtx = await browser.newContext()
    const guest = await gCtx.newPage()
    await joinViaCode(guest, code, 'Guest')
    await expect(card(host, /Participants \(2\)/)).toBeVisible()

    // Reload the guest tab. The reload drops the old socket, which removes the
    // participant, so the reconnect attaches with an identity no longer in the
    // room → the app re-prompts for a name (FR-18: reconnection = a fresh join,
    // in-round vote lost). The room itself must survive intact.
    await guest.reload()

    // Wait for the re-prompt (FR-18), then re-join with the same name.
    await expect(
      guest.getByRole('heading', { name: `Join room ${code}` }),
    ).toBeVisible()
    await guest.getByLabel('Your name').fill('Guest')
    await guest.getByRole('button', { name: 'Join' }).click()

    await waitForLive(guest)
    await expect(guest.getByRole('heading', { name: `Room ${code}` })).toBeVisible()
    // The room is intact and the guest is present again (as a fresh participant).
    await expect(card(host, /Participants \(2\)/)).toBeVisible()

    await hostCtx.close()
    await gCtx.close()
  })
})
