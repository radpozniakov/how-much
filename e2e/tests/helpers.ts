import { expect, type Locator, type Page } from '@playwright/test'

// Shared flow + selector helpers for the how-much E2E suite.
//
// Identity is per browser CONTEXT (sessionStorage `howmuch:session`), so every
// distinct participant in a test must be a distinct context/page. These helpers
// take whichever page they act on, so a single test can drive the host and
// several participants side by side.

/** The card section is titled by an <h2>; scope to it so "Your name" / "1" etc.
 * resolve unambiguously across the several cards on a page. */
export function card(page: Page, heading: string | RegExp): Locator {
  return page
    .locator('section.card')
    .filter({ has: page.getByRole('heading', { name: heading }) })
}

/** Create a room from the landing page and return its 6-char code. The creator
 * becomes the host (FR-1). */
export async function createRoom(page: Page, name: string): Promise<string> {
  await page.goto('/')
  const create = card(page, 'Create a room')
  await create.getByLabel('Your name').fill(name)
  await create.getByRole('button', { name: 'Create', exact: true }).click()
  await page.waitForURL(/\/room\/[A-Z0-9]{6}$/)
  await waitForLive(page)
  const match = /\/room\/([A-Z0-9]{6})$/.exec(page.url())
  if (!match) throw new Error(`unexpected room URL: ${page.url()}`)
  return match[1]
}

/** Join an existing room from the landing page via the code form (FR-3). */
export async function joinViaCode(
  page: Page,
  code: string,
  name: string,
): Promise<void> {
  await page.goto('/')
  const join = card(page, 'Join a room')
  await join.getByLabel('Your name').fill(name)
  await join.getByLabel('Room code').fill(code)
  await join.getByRole('button', { name: 'Join' }).click()
  await page.waitForURL(new RegExp(`/room/${code}$`))
  await waitForLive(page)
}

/** Join by opening the shareable deep link, which shows the name prompt (FR-3,
 * FR-2a). */
export async function joinViaLink(
  page: Page,
  code: string,
  name: string,
): Promise<void> {
  await page.goto(`/room/${code}`)
  // Deep-link entry with no session renders the JoinPrompt.
  await expect(
    page.getByRole('heading', { name: `Join room ${code}` }),
  ).toBeVisible()
  await page.getByLabel('Your name').fill(name)
  await page.getByRole('button', { name: 'Join' }).click()
  await waitForLive(page)
}

/** Wait until this client's socket is connected (StatusIndicator → "live"). */
export async function waitForLive(page: Page): Promise<void> {
  await expect(page.getByText('live', { exact: true })).toBeVisible()
}

/** The vote deck button for a given card, scoped to the deck so "1" doesn't
 * also match "13"/"21". */
export function voteCard(page: Page, value: string): Locator {
  return card(page, 'Your vote').getByRole('button', {
    name: value,
    exact: true,
  })
}

/** The task stage section (redesign §Stage) — shows the topic title, status,
 * and vote-progress counter. */
export function stage(page: Page): Locator {
  return page.locator('section.stage')
}

/** All participant cards in the responsive grid (redesign §Participant cards
 * grid). One card per participant; used for presence counts. */
export function participantCards(page: Page): Locator {
  return page.locator('.participant-card')
}

/** A participant card identified by the participant's display name. Replaces the
 * old roster <li>. Voted state is read via the card's `data-state` attribute
 * ('not-voted' | 'voted' | 'revealed') — the redesign shows state by glyph, not
 * text, so `toContainText('voted')` no longer applies. */
export function rosterEntry(page: Page, name: string): Locator {
  return participantCards(page).filter({ hasText: name })
}

/** Switch to the stats view via the header segment control (redesign §Segment
 * control). The redesign moves the results dashboard out of the cards view and
 * into "View 2 (stats)", so tests must toggle here before asserting on Results
 * (S18). */
export async function showStats(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'View 2 (stats)' }).click()
}

/** Switch back to the cards view (the participant grid) via the segment control.
 * The inverse of showStats — needed when a test asserts on Results and then on
 * the grid (only one is mounted at a time, S18). */
export async function showCards(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'View 1 (cards)' }).click()
}

/** A results <li> identified by the participant's display name. Only present
 * once the stats view is active on a revealed round (see showStats). */
export function resultEntry(page: Page, name: string): Locator {
  return card(page, 'Results').locator('li').filter({ hasText: name })
}

/** Set the host's "I'm voting" toggle (host page only). Host votes by default
 * (host_voting=True), so opting out turns the host into a pure facilitator and
 * makes the participant vote set deterministic.
 *
 * The checkbox is React-controlled by state that only flips once the server
 * echoes the new snapshot over the socket, so `setChecked`'s synchronous
 * assertion sees it "revert". Instead: click once, then wait for the echo to
 * settle the checkbox into the desired state. */
export async function setHostVoting(page: Page, voting: boolean): Promise<void> {
  const box = card(page, 'Host controls').getByRole('checkbox')
  if ((await box.isChecked()) !== voting) {
    await box.click()
    await expect(box).toBeChecked({ checked: voting })
  }
}
