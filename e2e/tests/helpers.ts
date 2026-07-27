import { expect, type Locator, type Page } from '@playwright/test'

// Shared flow + selector helpers for the how-much E2E suite.
//
// Identity is per browser CONTEXT (sessionStorage `howmuch:session`), so every
// distinct participant in a test must be a distinct context/page. These helpers
// take whichever page they act on, so a single test can drive the host and
// several participants side by side.
//
// Selector note (S13–S19 redesign): there is no longer a "Host controls" card.
// The host's affordances are distributed — the topic editor and the "I'm voting"
// toggle live inside the stage, and reveal/reset is a single button below the
// participant grid. Prefer the role-based helpers below over locating a card.

/** The card section is titled by an <h2>; scope to it so "Your name" / "1" etc.
 * resolve unambiguously across the several cards on a page. */
export function card(page: Page, heading: string | RegExp): Locator {
  return page
    .locator('section.card')
    .filter({ has: page.getByRole('heading', { name: heading }) })
}

/** Create a room from the landing page and return its 6-char code. The creator
 * becomes the host (FR-1).
 *
 * `cards` is the host's optional comma-separated card values (FR-22/D-48). Left
 * out, the field stays blank and the room gets the Fibonacci default — which is
 * what every scenario predating V4 does, unchanged. */
export async function createRoom(
  page: Page,
  name: string,
  cards?: string,
): Promise<string> {
  await page.goto('/')
  const create = card(page, 'Create a room')
  await create.getByLabel('Your name').fill(name)
  if (cards !== undefined) await create.getByLabel('Card values').fill(cards)
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

/** The room code heading in the header. The redesign shows the bare code (DN-D),
 * not "Room <code>". */
export function roomCodeHeading(page: Page, code: string): Locator {
  return page.getByRole('heading', { name: code, exact: true })
}

/** The vote deck strip. A landmark region (aria-label), not a titled card, so it
 * is not reachable via `card()`. */
export function voteDeck(page: Page): Locator {
  return page.getByRole('region', { name: 'Your vote' })
}

/** The vote deck button for a given card, scoped to the deck so "1" doesn't
 * also match "13"/"21". */
export function voteCard(page: Page, value: string): Locator {
  return voteDeck(page).getByRole('button', { name: value, exact: true })
}

/** The task stage section (redesign §Stage) — shows the topic title, status,
 * and vote-progress counter. */
export function stage(page: Page): Locator {
  return page.locator('section.stage')
}

/** The host's inline topic editor: the stage title itself is a borderless
 * textarea for the host (absent for non-hosts, who get a read-only title). */
export function topicEditor(page: Page): Locator {
  return page.getByRole('textbox', { name: 'Topic' })
}

/** The single host reveal/reset button below the participant grid. It reveals
 * the round, then flips label to "New voting" to reset it. */
export function revealButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Reveal cards' })
}

export function resetButton(page: Page): Locator {
  return page.getByRole('button', { name: 'New voting' })
}

/** The host's "I'm voting" checkbox, rendered under the stage status line. Its
 * presence is also the most reliable host/non-host signal on the page. */
export function hostVotingToggle(page: Page): Locator {
  return page.getByRole('checkbox', { name: "I'm voting" })
}

/** Set the round topic as the host. The editor commits on Enter (or blur, or a
 * 500ms autosave); Enter is the deterministic path for a test. */
export async function setTopic(page: Page, topic: string): Promise<void> {
  const editor = topicEditor(page)
  await editor.fill(topic)
  await editor.press('Enter')
  // The value is echoed back by the server snapshot; waiting on it here means
  // callers can assert on other clients without racing the broadcast.
  await expect(editor).toHaveValue(topic)
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

/** Switch to the stats view via the segment control above the stage. The
 * redesign moves the results dashboard out of the cards view, so tests must
 * toggle here before asserting on Results (S18). */
export async function showStats(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Graph view' }).click()
}

/** Switch back to the cards view (the participant grid) via the segment control.
 * The inverse of showStats — needed when a test asserts on Results and then on
 * the grid (only one is mounted at a time, S18). */
export async function showCards(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Cards view' }).click()
}

/** A results <li> identified by the participant's display name. Only present
 * once the stats view is active on a revealed round (see showStats). */
export function resultEntry(page: Page, name: string): Locator {
  return card(page, 'Results').locator('li').filter({ hasText: name })
}

/** The Graph card (V8/D-56), the upper of the two cards the stats view renders.
 * `card()` matches a heading by substring, and neither "Graph" nor "Results" is
 * a substring of the other, so the pair stays unambiguous in both directions —
 * which is what keeps every pre-existing `card(page,'Results')` locator honest
 * now that the view holds two `section.card` elements. */
export function graphCard(page: Page): Locator {
  return card(page, 'Graph')
}

/** A histogram column identified by its axis label. Exact text, so "1" does not
 * also match "13"/"21" — the same trap voteCard() avoids in the deck. Columns
 * exist for every deck value, including the ones nobody voted for, so an empty
 * column is `graphUnits(...)` with count 0, never a missing element. */
export function graphColumn(page: Page, value: string): Locator {
  return graphCard(page)
    .locator('.graph__column')
    .filter({ has: page.getByText(value, { exact: true }) })
}

/** Every vote unit stacked in one column — one per vote cast on that card. */
export function graphUnits(page: Page, value: string): Locator {
  return graphColumn(page, value).locator('.graph__unit')
}

/** The unit in a column that names a given voter. Units carry the name in a
 * `title`, so asserting through it is independent of the order the server
 * happens to list participants in. */
export function graphVote(page: Page, value: string, name: string): Locator {
  return graphColumn(page, value).locator(`.graph__unit[title="${name}"]`)
}

/** Columns carrying the min/max highlight. Suppressed entirely on a consensus
 * round, so this is a count assertion in both directions. */
export function graphExtremeColumns(page: Page): Locator {
  return graphCard(page).locator('.graph__column--extreme')
}

/** The extremes line — "Lowest 3 — Ann, Ben · Highest 21 — Cam". Not rendered at
 * all when the round reached consensus, so absence is `toHaveCount(0)` rather
 * than an empty-text check. */
export function graphExtremes(page: Page): Locator {
  return graphCard(page).locator('.graph__extremes')
}

/** The average caption under the rail — "Average 6.3 — between 5 and 8", or
 * "Average 5.0 — on 5" when the mean lands on a deck tick exactly. */
export function graphCaption(page: Page): Locator {
  return graphCard(page).locator('.graph__caption')
}

/** The host-only participants roster panel, opened from the header icon (S23). */
export function rosterMenuTrigger(page: Page): Locator {
  return page.getByRole('button', { name: 'Room participants' })
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
  const box = hostVotingToggle(page)
  if ((await box.isChecked()) !== voting) {
    await box.click()
    await expect(box).toBeChecked({ checked: voting })
  }
}
