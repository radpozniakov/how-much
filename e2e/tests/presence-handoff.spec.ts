import { expect, test } from '@playwright/test'
import {
  createRoom,
  hostVotingToggle,
  joinViaCode,
  participantCards,
  topicEditor,
} from './helpers'

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
    await expect(participantCards(host)).toHaveCount(2)

    // Guest drops (tab closes → socket closes → leave broadcast).
    await gCtx.close()
    await expect(participantCards(host)).toHaveCount(1)
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
    await expect(participantCards(guest)).toHaveCount(2)
    // Before handoff, the guest has no host affordances.
    await expect(topicEditor(guest)).toHaveCount(0)
    await expect(hostVotingToggle(guest)).toHaveCount(0)

    // Host disconnects — the role transfers to the remaining participant (D-13).
    await hostCtx.close()

    await expect(participantCards(guest)).toHaveCount(1)
    // The promoted participant now has the host affordances — the redesign shows
    // no host badge on cards, so the handoff is verified by controls appearing:
    // the stage title becomes editable and the voting toggle appears.
    await expect(topicEditor(guest)).toBeVisible()
    await expect(hostVotingToggle(guest)).toBeVisible()

    await gCtx.close()
  })
})
