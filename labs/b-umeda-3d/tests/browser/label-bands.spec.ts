import { expect, test, type Page } from '@playwright/test'

const errors = new WeakMap<Page, string[]>()
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

test('AT-LBL-01: zoom bands and depth cap the visible label tiers', async ({ page }) => {
  await page.goto('/?lang=en&detail=facility')
  const canvas = page.locator('canvas[data-triangles]')
  await expect(canvas).toHaveAttribute('data-band', 'far')
  await expect(page.locator('.pin.lines-pin:visible').first()).toBeVisible()
  await expect(page.locator('.pin.platform-pin:visible')).toHaveCount(0)
  await canvas.focus()
  for (let i = 0; i < 12 && await canvas.getAttribute('data-band') === 'far'; i++) {
    await page.keyboard.press('+')
  }
  await expect(canvas).toHaveAttribute('data-band', 'mid')
  await expect(page.locator('.pin.platform-pin:visible').first()).toBeVisible()
  await expect(page.locator('.pin[data-label-level="3"]:visible')).toHaveCount(0)
  for (let i = 0; i < 12 && await canvas.getAttribute('data-band') === 'mid'; i++) {
    await page.keyboard.press('+')
  }
  await expect(canvas).toHaveAttribute('data-band', 'near')
  await expect(page.locator('.pin[data-label-level="3"]:visible').first()).toBeVisible()
  await page.getByRole('button', { name: 'Structure', exact: true }).click()
  await expect(page.locator('.pin[data-label-level="4"]:visible').first()).toBeVisible()
  await page.getByRole('button', { name: 'Guide', exact: true }).click()
  await expect(page.locator('.pin[data-label-level="3"]:visible, .pin[data-label-level="4"]:visible')).toHaveCount(0)
})

test('AT-LBL-07: the Hankyu platform cluster expands when selected', async ({ page }) => {
  await page.goto('/')
  const cluster = page.locator('.cluster-pin:visible').filter({ hasText: '1–9' })
  await expect(cluster).toHaveCount(1)
  const center = (await cluster.boundingBox())!
  await page.mouse.click(center.x + center.width / 2, center.y + center.height / 2)
  await expect(page.locator('canvas')).toHaveAttribute('data-band', 'near')
  await expect(cluster).toHaveCount(0)
  await expect.poll(() => page.locator('.platform-pin[data-owner^="sk:platform:hk-"]:visible').count())
    .toBeGreaterThan(1)
})

test('AT-UI-02: changing depth keeps selection and survives refresh', async ({ page }) => {
  await page.goto('/?sel=platform:sk:platform:jr-3-4&lang=en')
  const canvas = page.locator('canvas')
  await page.getByRole('button', { name: 'Structure', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-selected', 'platform:sk:platform:jr-3-4')
  await expect.poll(() => new URL(page.url()).searchParams.get('detail')).toBe('structure')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Structure', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(canvas).toHaveAttribute('data-selected', 'platform:sk:platform:jr-3-4')
})
