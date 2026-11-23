import { expect, test } from '@playwright/test'

test('AT-NAV-05 and AT-NAV-06: the full 3D drawing follows the same link order as the itinerary', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?lang=en&sf=1')
  const canvas = page.locator('canvas')
  const ids = await page.locator('[data-step-link]').evaluateAll((steps) =>
    steps.map((step) => step.getAttribute('data-step-link')),
  )
  expect(ids).toHaveLength(8)
  await expect(canvas).toHaveAttribute('data-route-links', JSON.stringify(ids))
  await expect(page.locator('[data-key^="route-floor:"]:visible').first()).toBeVisible()
  await page.locator('[data-step-link="sk:elevator:city-six"] button').click()
  await expect(canvas).toHaveAttribute('data-route-links', JSON.stringify(ids))
  await expect(canvas).toHaveAttribute('data-route-active', 'sk:elevator:city-six')
  await expect(canvas).toHaveAttribute('data-route-dimmed', /^[1-9]\d*$/)
  await page.getByRole('button', { name: 'Clear route' }).click()
  await expect(canvas).toHaveAttribute('data-route-links', '[]')
})

test('AT-NAV-08: a floor change shows static text with reduced motion and clears on the next step', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?lang=en&sf=1&step=3')
  const band = page.getByTestId('floor-change-banner')
  await expect(band).toHaveText('▼ B1F')
  await expect(band).toHaveCSS('animation-name', 'none')
  await page.getByRole('button', { name: 'Advance walkthrough' }).click()
  await expect(band).toHaveCount(0)
})

test('AT-NAV-08: a floor change announcement dismisses after its timed display', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/?lang=en&sf=1')
  await page.locator('[data-step-link="sk:elevator:city-six"] button').click()
  const band = page.getByTestId('floor-change-banner')
  await expect(band).toBeVisible()
  await expect(band).toHaveCount(0, { timeout: 8000 })
})
