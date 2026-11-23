import { expect, test, type Page } from '@playwright/test'

const errors = new WeakMap<Page, string[]>()
const sheet = (page: Page) => page.getByTestId('detail-sheet')
const canvas = (page: Page) => page.locator('canvas[data-triangles]')

function href(target: string) {
  return '/?lang=en&sel=' + encodeURIComponent(target)
}

test.beforeEach(async ({ page }) => {
  const messages: string[] = []
  errors.set(page, messages)
  page.on('pageerror', (error) => messages.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text())
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
})
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]))

test('AT-DET-04: a gate lists both sides, supported platforms and the crossing route', async ({ page }) => {
  await page.goto(href('gate:sk:gate:jr-midosuji'))
  const panel = sheet(page)
  await expect(panel).toHaveAttribute('data-target', 'gate:sk:gate:jr-midosuji')
  for (const text of ['Inside gates', 'Outside gates', 'JR West', 'Served platforms', 'Step-free', 'Nearby facilities']) {
    await expect(panel).toContainText(text)
  }
  await panel.getByRole('button', { name: 'Route through this gate' }).click()
  await expect(canvas(page)).toHaveAttribute('data-focus', 'sk:gate:jr-midosuji')
})

test('AT-DET-05: a passage reports connected areas and leaves length and time unmeasured', async ({ page }) => {
  const link = 'sk:passage:hankyu-crossing-via-jr-midosuji-out'
  await page.goto(href('passage:' + link))
  const panel = sheet(page)
  await expect(panel).toHaveAttribute('data-target', 'passage:' + link)
  for (const text of ['Midosuji concourse', 'Crosswalk toward Hankyu', '1F', 'Outside gates', 'Lines']) {
    await expect(panel).toContainText(text)
  }
  await expect(panel.locator('[data-field="distance"]')).toHaveText(/Unmeasured/)
  await expect(panel.locator('[data-field="time"]')).toHaveText(/Unmeasured/)
  await panel.getByRole('button', { name: 'Route through this passage' }).click()
  await expect(canvas(page)).toHaveAttribute('data-focus', link)
})

test('AT-DET-06: an entrance offers a reachable line and retains unknown official exit fields', async ({ page }) => {
  await page.goto(href('entrance:sk:entrance:midosuji-south'))
  const panel = sheet(page)
  await expect(panel).toContainText('Midosuji concourse')
  await expect(panel).toContainText('Reachable lines')
  await expect(panel.locator('[data-field="exit-label"]')).toContainText('Midosuji South Exit')
  await expect(panel.locator('[data-field="surface"]')).toHaveText(/Unverified/)
  await expect(panel.getByRole('button', { name: 'Route here', exact: true })).toBeVisible()
  const line = panel.locator('button[data-target^="line:"]').first()
  const target = (await line.getAttribute('data-target'))!
  await line.click()
  await expect(panel).toHaveAttribute('data-target', target)
  await expect(canvas(page)).toHaveAttribute('data-selected', target)
  await expect(panel).toContainText('Platforms on this line')
})

test('AT-DET-07: lift and escalator pages show floors and verified direction limits', async ({ page }) => {
  await page.goto(href('vertical:sk:elevator:metro-platform'))
  await expect(sheet(page)).toContainText('B1F → B2F')
  await expect(sheet(page).locator('[data-field="step-free"]')).toContainText('Verified')
  await page.goto(href('vertical:sk:escalator:jr-84'))
  await expect(sheet(page)).toContainText('Direction unverified · excluded from routes')
  await expect(sheet(page).locator('[data-field="operation"]')).toContainText('Unverified')
})

const samples = [
  'platform:sk:platform:jr-3-4', 'platform:sk:platform:jr-5-6', 'platform:sk:platform:hk-3',
  'platform:sk:platform:metro-1', 'gate:sk:gate:jr-midosuji', 'gate:sk:gate:jr-west',
  'gate:sk:gate:hk-3f', 'entrance:sk:entrance:midosuji-south', 'entrance:sk:entrance:jr-central-south',
  'entrance:sk:entrance:surface-crossing', 'passage:sk:passage:central-south',
  'passage:sk:passage:city-crossing', 'vertical:sk:elevator:metro-platform',
  'vertical:sk:escalator:jr-84', 'concourse:sk:concourse:jr-midosuji-in',
  'concourse:sk:concourse:metro-gate-in', 'station:sk:context:hankyu',
  'station:sk:station:jr-osaka', 'line:sk:line:kobe', 'line:sk:line:midosuji',
]

test('AT-SEL-04: 20 seeded object selections keep sheet, scene, label and URL aligned', async ({ page }) => {
  test.setTimeout(150_000)
  let seed = 24
  const targets = [...samples]
  for (let index = targets.length - 1; index > 0; index--) {
    seed = (seed * 16807) % 2147483647
    const other = seed % (index + 1)
    ;[targets[index], targets[other]] = [targets[other], targets[index]]
  }
  for (const target of targets) {
    await page.goto(href(target))
    await expect(sheet(page)).toHaveAttribute('data-target', target)
    await expect(canvas(page)).toHaveAttribute('data-selected', target)
    await expect(canvas(page)).toHaveAttribute('data-highlighted', /^[1-9]\d*$/)
    const owner = target.slice(target.indexOf(':') + 1)
    const pin = page.locator(`.pin.selected[data-owner="${owner}"]:visible`).first()
    await expect(pin).toBeVisible()
    const rect = (await pin.boundingBox())!
    await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2)
    await expect(sheet(page)).toHaveAttribute('data-target', target)
    await expect(canvas(page)).toHaveAttribute('data-selected', target)
    expect(new URL(page.url()).searchParams.get('sel')).toBe(target)
  }
})
