import { expect, test } from '@playwright/test'

test.use({ reducedMotion: 'reduce' })

test('AT-UI-01 and AT-SEL-07: floor controls show selections and route levels and can return to the object', async ({ page }) => {
  const gate = 'gate:sk:gate:metro-northeast'
  await page.goto('/?lang=en&floor=-1&from=sk:concourse:jr-west-inside&sel=' + gate)
  const control = page.getByRole('group', { name: 'Floor', exact: true })
  const b1 = control.getByRole('button', { name: 'B1F', exact: true })
  await expect(b1.locator('[data-floor-marker="selection"]')).toBeVisible()
  await expect(b1.locator('[data-floor-marker="route"]')).toBeVisible()
  await control.getByRole('button', { name: '2F', exact: true }).click()
  await expect(page.getByTestId('detail-sheet')).toHaveAttribute('data-target', gate)
  await expect(page.locator('.eye-hint')).toContainText('This feature is on another floor.')
  await page.getByRole('button', { name: 'Go to floor', exact: true }).click()
  await expect(b1).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('detail-sheet')).toHaveAttribute('data-target', gate)

  await page.getByRole('button', { name: '2D', exact: true }).click()
  await expect(b1.locator('[data-floor-marker="selection"]')).toBeVisible()
  await expect(b1.locator('[data-floor-marker="route"]')).toBeVisible()
  await expect(control.getByRole('button', { name: 'All', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await b1.click()
  await expect(control.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('detail-sheet')).toHaveAttribute('data-target', gate)
})

test('AT-UI-03: both themes use a flat stage and readable controls and labels', async ({ page }) => {
  await page.goto('/?lang=en')
  const stage = page.locator('.stage')
  const canvas = stage.locator('canvas[data-rebuilds]')
  await expect(canvas).toBeVisible()
  const rebuilds = await canvas.getAttribute('data-rebuilds')
  await expect(stage).toHaveCSS('background-image', 'none')
  const colors: string[] = []
  for (const dark of [false, true]) {
    if (dark) await page.getByRole('button', { name: 'Toggle theme' }).click()
    const stageColor = await stage.evaluate((element) => getComputedStyle(element).backgroundColor)
    colors.push(stageColor)
    for (const surface of [page.locator('header'), page.locator('.workspace > .viewer'), page.locator('.pin.station-pin:visible').first()]) {
      await expect(surface).toBeVisible()
      const ratio = await surface.evaluate((element) => {
        const rgb = (s: string) => (s.match(/\d+/g) ?? []).slice(0, 3).map(Number)
        const luminance = (s: string) => {
          const [r, g, b] = rgb(s).map((n) => {
            const c = n / 255
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
          })
          return 0.2126 * r + 0.7152 * g + 0.0722 * b
        }
        const css = getComputedStyle(element)
        const ink = luminance(css.color)
        const paper = luminance(css.backgroundColor)
        return (Math.max(ink, paper) + 0.05) / (Math.min(ink, paper) + 0.05)
      })
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    }
  }
  expect(new Set(colors).size).toBe(2)
  await expect(canvas).toHaveAttribute('data-rebuilds', rebuilds!)
})

test('AT-UI-04 and AT-URL-03: keyboard selection is announced and the mezzanine survives reload', async ({ page }) => {
  await page.goto('/?lang=en&floor=0.5')
  const mezzanine = page.getByRole('group', { name: 'Floor', exact: true }).getByRole('button', { name: '中2F', exact: true })
  await expect(mezzanine).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(mezzanine).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '3D', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '2D', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Routes & places' })).toBeFocused()
  await page.keyboard.press('/')
  const query = page.getByRole('combobox', { name: 'Find a place' })
  await expect(query).toBeFocused()
  await page.keyboard.type('Hankyu 3')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  const announcement = page.locator('[aria-live="polite"][data-selection-announcement]')
  await expect(announcement).toHaveText('Selected Hankyu track 3')
  await page.keyboard.press('Escape')
  await expect(query).toHaveValue('')
  await page.keyboard.press('Escape')
  await expect(announcement).toBeEmpty()
  await expect(page.getByTestId('detail-sheet')).toHaveCount(0)
})
