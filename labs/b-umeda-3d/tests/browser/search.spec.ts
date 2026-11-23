import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('AT-SRCH-02: the slash shortcut and Enter select and focus the Midosuji result', async ({ page }) => {
  await page.goto('/')
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-camera', /./)
  await page.keyboard.press('Slash')
  const query = page.getByRole('combobox', { name: '地点を探す' })
  await expect(query).toBeFocused()
  await query.fill('御堂筋')
  await expect(query).toHaveAttribute('aria-expanded', 'true')
  const resultId = (await query.getAttribute('aria-activedescendant'))!
  await query.press('ArrowDown')
  await expect(query).not.toHaveAttribute('aria-activedescendant', resultId)
  await query.press('ArrowUp')
  await expect(query).toHaveAttribute('aria-activedescendant', resultId)
  const target = (await page.locator('#' + resultId).getAttribute('data-target'))!
  const before = (await canvas.getAttribute('data-camera'))!
  await query.press('Enter')
  await expect(page.getByTestId('detail-sheet')).toHaveAttribute('data-target', target)
  await expect(canvas).toHaveAttribute('data-selected', target)
  await expect(canvas).toHaveAttribute('data-highlighted', /^[1-9]\d*$/)
  await expect(canvas).not.toHaveAttribute('data-camera', before)
  expect(new URL(page.url()).searchParams.get('sel')).toBe(target)
})

test('AT-SRCH-03: a destination result plans a route from the assigned origin', async ({ page }) => {
  await page.goto('/?lang=en&from=sk:concourse:jr-bridge')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('combobox', { name: 'Find a place' }).fill('Hankyu 3')
  const row = page.locator('[data-search-row="sk:platform:hk-3"]')
  await row.getByRole('button', { name: /Set destination/ }).click()
  await expect(page.getByRole('combobox', { name: 'To', exact: true })).toHaveValue('sk:platform:hk-3')
  await expect(page.getByRole('combobox', { name: 'From', exact: true })).toHaveValue('sk:concourse:jr-bridge')
  await expect(page.getByRole('button', { name: /Start walkthrough/ })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('to')).toBe('sk:platform:hk-3')
})

test('AT-SRCH-04: an unrecorded station displays the empty result without substitution', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '経路・施設' }).click()
  await page.getByRole('button', { name: '探す', exact: true }).click()
  const query = page.getByRole('combobox', { name: '地点を探す' })
  await query.fill('不存在的站')
  await expect(page.getByTestId('search-empty')).toContainText('未収録')
  await expect(page.getByRole('option')).toHaveCount(0)
  await query.press('Escape')
  await expect(query).toHaveValue('')
  await expect(page.getByTestId('search-presets').getByRole('button')).toHaveCount(6)
})
