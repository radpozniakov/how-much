import { expect, test } from '@playwright/test'
import {
  card,
  createRoom,
  hostVotingToggle,
  joinViaCode,
  participantCards,
  waitForLive,
} from './helpers'

// Recalled inputs (FR-23/D-52): the browser offers back the display name and the
// card values this device last submitted.
//
// Recall is per DEVICE, not per tab — `localStorage`, deliberately separate from
// the per-tab `sessionStorage` identity (D-39). So unlike every other spec here, a
// scenario is a single context revisited, and the thing under test is what survives
// leaving the room. A fresh context is a fresh device and must recall nothing.

const DEFAULT_DECK = '1, 2, 3, 5, 8, 13, 21'

test.describe('Recalled inputs', () => {
  test('a fresh device recalls nothing and shows the deck placeholder', async ({
    page,
  }) => {
    await page.goto('/')
    const create = card(page, 'Create a room')
    await expect(create.getByLabel('Your name')).toHaveValue('')

    // Blank, with the default deck stated as the placeholder rather than as a
    // value — which is exactly the state a recalled deck replaces.
    const cards = create.getByLabel('Card values')
    await expect(cards).toHaveValue('')
    await expect(cards).toHaveAttribute('placeholder', DEFAULT_DECK)

    await expect(card(page, 'Join a room').getByLabel('Your name')).toHaveValue(
      '',
    )
  })

  test('creating a room recalls the name and the deck onto the create form', async ({
    page,
  }) => {
    await createRoom(page, 'Alice', '1, 2, 4, 8')

    // Back to the landing page on the same device: both fields come back filled,
    // and the recalled deck is a real value, so the placeholder no longer shows.
    await page.goto('/')
    const create = card(page, 'Create a room')
    await expect(create.getByLabel('Your name')).toHaveValue('Alice')
    await expect(create.getByLabel('Card values')).toHaveValue('1, 2, 4, 8')
  })

  test('the recalled name reaches every field that asks for one', async ({
    page,
  }) => {
    await createRoom(page, 'Alice', '1, 2, 4, 8')
    await page.goto('/')

    // The join form takes the same name — but not the deck, which has no field
    // here, and not a room code, which belongs to a room rather than a person.
    const join = card(page, 'Join a room')
    await expect(join.getByLabel('Your name')).toHaveValue('Alice')
    await expect(join.getByLabel('Room code')).toHaveValue('')

    // And the deep-link prompt. This device has no identity for ZZZZZZ, so the
    // room falls through to the name prompt — the rejoin surface recall helps most.
    await page.goto('/room/ZZZZZZ')
    await expect(
      page.getByRole('heading', { name: 'Join room ZZZZZZ' }),
    ).toBeVisible()
    await expect(page.getByLabel('Your name')).toHaveValue('Alice')
  })

  test('joining replaces the recalled name and leaves the deck alone', async ({
    browser,
    page,
  }) => {
    // A room to join, created on a different device so this device's own recall
    // is untouched by it.
    const hostCtx = await browser.newContext()
    const code = await createRoom(await hostCtx.newPage(), 'Alice')

    await createRoom(page, 'Bob', '1, 2, 4, 8')
    await joinViaCode(page, code, 'Bobby')

    await page.goto('/')
    const create = card(page, 'Create a room')
    await expect(create.getByLabel('Your name')).toHaveValue('Bobby')
    // The deck is a separate field with a separate lifetime: joining names a
    // person, it does not un-choose the deck this host last created a room with.
    await expect(create.getByLabel('Card values')).toHaveValue('1, 2, 4, 8')

    await hostCtx.close()
  })

  test('a rename is what comes back, not the name first submitted', async ({
    page,
  }) => {
    await createRoom(page, 'Alice')

    await page.locator('.room-header__name').click()
    const input = page.getByLabel('Your display name')
    await input.fill('Alicia')
    await input.press('Enter')
    await expect(page.locator('.room-header__name')).toHaveText('Alicia')

    await page.goto('/')
    await expect(
      card(page, 'Create a room').getByLabel('Your name'),
    ).toHaveValue('Alicia')
  })

  test('submitting a blank deck brings the placeholder back', async ({
    page,
  }) => {
    await createRoom(page, 'Alice', '1, 2, 4, 8')
    await page.goto('/')

    // Clear the recalled deck and create again: the deck must be un-choosable, or
    // the first custom deck a host picks is the only one they can ever have back.
    const create = card(page, 'Create a room')
    await create.getByLabel('Card values').fill('')
    await create.getByRole('button', { name: 'Create', exact: true }).click()
    await page.waitForURL(/\/room\/[A-Z0-9]{6}$/)

    await page.goto('/')
    const cards = card(page, 'Create a room').getByLabel('Card values')
    await expect(cards).toHaveValue('')
    await expect(cards).toHaveAttribute('placeholder', DEFAULT_DECK)
  })

  test('a second device recalls nothing from the first', async ({
    browser,
    page,
  }) => {
    // The separation D-52 turns on: recall is per device, so it must not travel,
    // and identity must stay per tab. Widening one to reach the other would make
    // a new context re-attach as the same participant.
    await createRoom(page, 'Alice', '1, 2, 4, 8')

    const otherCtx = await browser.newContext()
    const other = await otherCtx.newPage()
    await other.goto('/')
    const create = card(other, 'Create a room')
    await expect(create.getByLabel('Your name')).toHaveValue('')
    await expect(create.getByLabel('Card values')).toHaveValue('')

    await otherCtx.close()
  })

  test('a second tab on the same device shares recall but not identity', async ({
    browser,
  }) => {
    // The property D-52 is built to protect, and the one this slice could have
    // broken: recall is shared across a device's tabs, identity is not. Putting
    // both in one store would make this second tab re-attach as the first
    // participant instead of joining as a new one.
    //
    // Every other spec here is one context per participant, so nothing else
    // exercises two tabs of the SAME context — which is exactly where a shared
    // localStorage record could leak into the per-tab session.
    const ctx = await browser.newContext()
    const first = await ctx.newPage()
    const code = await createRoom(first, 'Alice')

    // A new tab in the same context: localStorage (recall) is shared, so the name
    // comes back — but sessionStorage (identity) is per tab, so there is no
    // session for this room and the prompt appears rather than a live room.
    const second = await ctx.newPage()
    await second.goto(`/room/${code}`)
    await expect(
      second.getByRole('heading', { name: `Join room ${code}` }),
    ).toBeVisible()
    await expect(second.getByLabel('Your name')).toHaveValue('Alice')

    // Joining on the recalled name makes a genuinely separate participant —
    // duplicate names are allowed (FR-4), so two cards named Alice is the room
    // correctly holding two people, not one person rendered twice.
    await second.getByRole('button', { name: 'Join' }).click()
    await waitForLive(second)
    await expect(participantCards(first)).toHaveCount(2)
    await expect(participantCards(second)).toHaveCount(2)

    // And the two tabs really are different participants: only the first is host.
    await expect(hostVotingToggle(first)).toBeVisible()
    await expect(hostVotingToggle(second)).toHaveCount(0)

    await ctx.close()
  })
})
