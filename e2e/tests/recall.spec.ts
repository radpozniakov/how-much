import { expect, test } from '@playwright/test'
import {
  card,
  createRoom,
  hostVotingToggle,
  joinViaCode,
  participantCards,
  waitForLive,
} from './helpers'

const DEFAULT_DECK = '1, 2, 3, 5, 8, 13, 21'

test.describe('Recalled inputs', () => {
  test('a fresh device recalls nothing and shows the deck placeholder', async ({
    page,
  }) => {
    await page.goto('/')
    const create = card(page, 'Create a room')
    await expect(create.getByLabel('Your name')).toHaveValue('')

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

    const join = card(page, 'Join a room')
    await expect(join.getByLabel('Your name')).toHaveValue('Alice')
    await expect(join.getByLabel('Room code')).toHaveValue('')

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
    const hostCtx = await browser.newContext()
    const code = await createRoom(await hostCtx.newPage(), 'Alice')

    await createRoom(page, 'Bob', '1, 2, 4, 8')
    await joinViaCode(page, code, 'Bobby')

    await page.goto('/')
    const create = card(page, 'Create a room')
    await expect(create.getByLabel('Your name')).toHaveValue('Bobby')
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
    const ctx = await browser.newContext()
    const first = await ctx.newPage()
    const code = await createRoom(first, 'Alice')

    const second = await ctx.newPage()
    await second.goto(`/room/${code}`)
    await expect(
      second.getByRole('heading', { name: `Join room ${code}` }),
    ).toBeVisible()
    await expect(second.getByLabel('Your name')).toHaveValue('Alice')

    await second.getByRole('button', { name: 'Join' }).click()
    await waitForLive(second)
    await expect(participantCards(first)).toHaveCount(2)
    await expect(participantCards(second)).toHaveCount(2)

    await expect(hostVotingToggle(first)).toBeVisible()
    await expect(hostVotingToggle(second)).toHaveCount(0)

    await ctx.close()
  })
})
