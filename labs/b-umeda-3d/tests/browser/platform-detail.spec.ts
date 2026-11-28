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

test('AT-DET-01: the platform page exposes the essential facts and provenance', async ({ page }) => {
  await page.goto('/?sel=platform:sk:platform:hk-3&floor=2')
  const panel = page.getByTestId('detail-sheet')
  await expect(panel).toBeVisible()
  await expect(panel.getByTestId('detail-title')).toHaveText('阪急 3号線')
  await expect(panel.locator('.line-badge')).toContainText('京都線')
  for (const text of ['阪急電鉄', '3F', '改札内', 'のりば', '方面', '未確認', 'リアルタイム配信なし', '乗換', '資料・精度']) {
    await expect(panel).toContainText(text)
  }
  await expect(panel.getByRole('button', { name: 'ここから', exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'ここへ', exact: true })).toBeVisible()
  await panel.getByText('資料・精度', { exact: true }).click()
  await expect(panel.getByRole('link').first()).toBeVisible()
  const canvas = (await page.locator('canvas').boundingBox())!
  const detail = (await panel.boundingBox())!
  expect(detail.x).toBeGreaterThanOrEqual(canvas.x + canvas.width)
})

test('AT-DET-03: a marked derived transfer selects the related platform', async ({ page }) => {
  await page.goto('/?sel=platform:sk:platform:jr-3-4&lang=en')
  const sheet = page.getByTestId('detail-sheet')
  const transfers = sheet.getByTestId('transfers')
  await expect(transfers).toContainText('Derived · schematic')
  const action = transfers.locator('button[data-target]').first()
  const next = (await action.getAttribute('data-target'))!
  await action.click()
  await expect(sheet).toHaveAttribute('data-target', next)
  await expect(page.locator('canvas')).toHaveAttribute('data-selected', next)
  await expect.poll(() => new URL(page.url()).searchParams.get('sel')).toBe(next)
})

test('AT-DET-10: selecting a platform opens a half-height mobile sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?lang=en&floor=1')
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  const pin = page.locator('.platform-pin[data-owner="sk:platform:jr-3-4"]:visible')
  await expect(pin).toBeVisible()
  const label = (await pin.boundingBox())!
  await page.mouse.click(label.x + label.width / 2, label.y + label.height / 2)
  const sheet = page.getByTestId('detail-sheet')
  await expect(sheet).toBeVisible()
  const aside = (await page.locator('aside').boundingBox())!
  const canvas = page.locator('canvas')
  const view = (await canvas.boundingBox())!
  expect(aside.height).toBeGreaterThan(844 * 0.4)
  expect(aside.height).toBeLessThan(844 * 0.6)
  expect(view.y + view.height).toBeLessThanOrEqual(aside.y)
  await expect(canvas).toHaveAttribute('data-highlighted', /^[1-9]\d*$/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await sheet.getByRole('button', { name: 'Expand details' }).click()
  expect((await page.locator('aside').boundingBox())!.height).toBeGreaterThan(aside.height)
  await sheet.getByRole('button', { name: 'Collapse details' }).click()
  await sheet.getByRole('button', { name: 'Collapse details' }).click()
  expect((await page.locator('aside').boundingBox())!.height).toBe(72)
})
