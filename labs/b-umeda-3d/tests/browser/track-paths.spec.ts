import { expect, test } from '@playwright/test'

test('T16: derived tracks are visible in the debug view and hidden in the ordinary model', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?lang=en&floor=2')
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-triangles', /^[1-9]\d*$/)
  expect(await canvas.getAttribute('data-track-paths')).toBeNull()
  await page.goto('/?lang=en&floor=2&debug=tracks')
  await expect(canvas).toHaveAttribute('data-track-paths', /track:sk:platform:hk-3:-1/)
  await expect(canvas).toHaveAttribute('data-track-entrances', '9')
  await page.getByRole('button', { name: 'B2F', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-track-paths', /track:sk:platform:hs-1-2:1/)
  await expect(canvas).toHaveAttribute('data-track-entrances', '0')
})
