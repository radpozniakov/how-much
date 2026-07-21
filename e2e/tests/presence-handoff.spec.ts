import { expect, test } from '@playwright/test'
import { card, createRoom, joinViaCode, rosterEntry } from './helpers'

// Real-time presence and host auto-transfer. Covers FR-7, FR-17.

test.describe('Presence & host handoff', () => {
  test('presence updates live when a participant leaves (FR-17)', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext()
    const host = await hostCtx.newPage()
    const code = await createRoom(host, 'Host')

    const gCtx = await browser.newContext()
    const guest = await gCtx.newPage()
    await joinViaCode(guest, code, 'Guest')
    await expect(card(host, /Participants \(2\)/)).toBeVisible()

    // Guest drops (tab closes → socket closes → leave broadcast).
    await gCtx.close()
    await expect(card(host, /Participants \(1\)/)).toBeVisible()
    await expect(host.getByText('Guest')).toHaveCount(0)

    await hostCtx.close()
  })

  test('host role auto-transfers when the host disconnects (FR-7)', async ({
    browser,
  }) => {
    const hostCtx = await browser.newContext()
    const host = await hostCtx.newPage()
    const code = await createRoom(host, 'Host')

    const gCtx = await browser.newContext()
    const guest = await gCtx.newPage()
    await joinViaCode(guest, code, 'Guest')
    await expect(card(guest, /Participants \(2\)/)).toBeVisible()
    // Before handoff, the guest has no host controls.
    await expect(card(guest, 'Host controls')).toHaveCount(0)

    // Host disconnects — the role transfers to the remaining participant (D-13).
    await hostCtx.close()

    await expect(card(guest, /Participants \(1\)/)).toBeVisible()
    await expect(rosterEntry(guest, 'Guest')).toContainText('host')
    // The promoted participant now has full host controls.
    await expect(card(guest, 'Host controls')).toBeVisible()

    await gCtx.close()
  })
})
