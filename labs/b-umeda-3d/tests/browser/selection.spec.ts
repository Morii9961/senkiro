import { expect, test, type Page } from '@playwright/test'

const platform = 'sk:platform:jr-3-4'
const nextPlatform = 'sk:platform:jr-5-6'
const station = 'sk:station:jr-osaka'
const canvas = (page: Page) => page.locator('canvas[data-rebuilds]')
const button = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true })

async function clickPin(page: Page, id: string) {
  const pin = page.locator(`.pin[data-owner="${id}"]:visible`).first()
  await expect(pin).toBeVisible()
  const rect = (await pin.boundingBox())!
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2)
}

async function openEnglish(page: Page) {
  await page.goto('/')
  await page.locator('header select').selectOption('en')
  await expect(canvas(page)).toHaveAttribute('data-triangles', /^[1-9]\d*$/)
}

async function showPlatformLabels(page: Page) {
  const view = canvas(page)
  await view.focus()
  for (let i = 0; i < 6 && await view.getAttribute('data-band') !== 'near'; i++) {
    await page.keyboard.press('+')
  }
  await expect(view).toHaveAttribute('data-band', 'near')
}

function pose(value: string | null) {
  const coordinates = value?.split(',').map(Number) ?? []
  expect(coordinates).toHaveLength(4)
  return coordinates
}

const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  const messages: string[] = []
  errors.set(page, messages)
  page.on('pageerror', (error) => messages.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text())
  })
})
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]))

test('AT-PERF-01: help, theme and drawer leave the geometry in place', async ({ page }) => {
  await openEnglish(page)
  const view = canvas(page)
  await expect(view).toHaveAttribute('aria-label', 'Interactive station model')
  const before = (await view.getAttribute('data-rebuilds'))!
  await button(page, 'Controls').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(view).toHaveAttribute('data-rebuilds', before)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(view).toHaveAttribute('data-rebuilds', before)
  await button(page, 'Toggle theme').click()
  await expect(page.locator('main')).toHaveClass('app dark')
  await expect(view).toHaveAttribute('data-rebuilds', before)
  const drawer = button(page, 'Routes & places')
  for (const expanded of ['true', 'false']) {
    await drawer.click()
    await expect(drawer).toHaveAttribute('aria-expanded', expanded)
    await expect(view).toHaveAttribute('data-rebuilds', before)
  }
})

test('AT-PERF-02: five kinds of selection leave the geometry in place', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openEnglish(page)
  const view = canvas(page)

  async function stableClick(expected: string, action: () => Promise<void>) {
    const before = (await view.getAttribute('data-rebuilds'))!
    await action()
    await expect(view).toHaveAttribute('data-rebuilds', before)
    await expect(view).toHaveAttribute('data-selected', expected)
  }

  await showPlatformLabels(page)
  await stableClick('platform:' + platform, () => clickPin(page, platform))
  await button(page, 'Reset view').click()
  await stableClick('station:' + station, () => clickPin(page, station))
  await button(page, 'Reset view').click()
  await button(page, '1F').click()
  await button(page, 'Routes & places').click()
  await button(page, 'Model guide').click()
  const exit = 'sk:entrance:midosuji-south'
  await stableClick('entrance:' + exit, async () => {
    await page.getByLabel('Facility', { exact: true }).selectOption(exit)
  })
  await button(page, 'Itinerary').click()
  await page.getByRole('button', { name: 'Start walkthrough' }).click()
  const gate = 'sk:gate:jr-midosuji'
  await stableClick('gate:' + gate, () => clickPin(page, gate))
  for (let index = 1; index < 8; index += 1) {
    await button(page, 'Advance walkthrough').click()
  }
  const lift = 'sk:elevator:metro-platform'
  await stableClick('vertical:' + lift, () => clickPin(page, lift))
})

test('AT-SEL-01 and AT-SEL-03: platform selection and switching stay in sync', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openEnglish(page)
  const view = canvas(page)
  await showPlatformLabels(page)
  await clickPin(page, platform)
  await expect(view).toHaveAttribute('data-selected', 'platform:' + platform)
  await expect(view).toHaveAttribute('data-highlighted', /^[1-9]\d*$/)
  await expect(view).toHaveAttribute('data-dimmed', /^[1-9]\d*$/)
  await expect(page.getByTestId('detail-title')).toHaveText('Osaka platforms 3 / 4')
  await clickPin(page, nextPlatform)
  await expect(view).toHaveAttribute('data-selected', 'platform:' + nextPlatform)
  await expect(page.getByTestId('detail-title')).toHaveText('Osaka platforms 5 / 6')
  await expect(page.locator(`.pin[data-owner="${platform}"].selected`)).toHaveCount(0)
  await expect(page.locator(`.pin[data-owner="${nextPlatform}"].selected`).first()).toBeVisible()
})

test('AT-SEL-02: camera focuses with and without reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openEnglish(page)
  const view = canvas(page)
  await showPlatformLabels(page)
  const start = pose(await view.getAttribute('data-camera'))
  await clickPin(page, platform)
  const finish = (await view.getAttribute('data-camera'))!
  expect(pose(finish)[3]).toBeGreaterThan(start[3])
  expect(pose(finish).slice(0, 3)).not.toEqual(start.slice(0, 3))

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await button(page, 'Reset view').click()
  await showPlatformLabels(page)
  await clickPin(page, platform)
  await page.waitForTimeout(800)
  await expect.poll(async () => pose(await view.getAttribute('data-camera'))[3])
    .toBeGreaterThan(start[3])
  await expect(view).toHaveAttribute('data-camera', finish)
})

test('AT-SEL-05: Escape, blank canvas and closing clear color without resetting the camera', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openEnglish(page)
  const view = canvas(page)
  async function clickBlank() {
    await expect(view).toHaveAttribute('width', '1080')
    await expect(view).toHaveAttribute('data-occluded', /"gate:/)
    const bounds = (await view.boundingBox())!
    for (const [x, y] of [[0.96, 0.16], [0.97, 0.4], [0.04, 0.85], [0.65, 0.97]]) {
      const at = { x: bounds.x + bounds.width * x, y: bounds.y + bounds.height * y }
      await page.mouse.move(at.x, at.y)
      const blank = await view.evaluate(async (element, at) => {
        await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))
        const overPin = Array.from(element.parentElement!.querySelectorAll('.pin')).some((pin) => {
          if (getComputedStyle(pin).visibility !== 'visible') return false
          const rect = pin.getBoundingClientRect()
          return at.x >= rect.left && at.x <= rect.right && at.y >= rect.top && at.y <= rect.bottom
        })
        return document.elementFromPoint(at.x, at.y) === element &&
          !overPin && getComputedStyle(element.parentElement!).cursor !== 'pointer'
      }, at)
      if (blank) {
        await page.mouse.click(at.x, at.y)
        return
      }
    }
    throw new Error('No unoccluded blank point at the focused camera')
  }
  for (const clear of [
    () => page.keyboard.press('Escape'),
    clickBlank,
    () => page.getByTestId('detail-sheet').getByRole('button', { name: 'Close' }).click(),
  ]) {
    await button(page, 'Reset view').click()
    await showPlatformLabels(page)
    await clickPin(page, platform)
    await expect(view).toHaveAttribute('data-selected', 'platform:' + platform)
    const focused = (await view.getAttribute('data-camera'))!
    await clear()
    await expect(view).toHaveAttribute('data-selected', '')
    await expect(view).toHaveAttribute('data-dimmed', '0')
    await expect(view).toHaveAttribute('data-camera', focused)
    await expect(page.getByTestId('detail-sheet')).toHaveCount(0)
  }
  await button(page, 'Reset view').click()
  await expect(view).toHaveAttribute('data-zoom', '1')
})
