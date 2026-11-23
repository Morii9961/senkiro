import { expect, test } from '@playwright/test'

test('AT-HON-03: production ignores the development vehicle preview and uses no operator images', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?lang=en&preview=vehicles&sel=platform:sk:platform:hk-3')
  await expect(page.locator('canvas')).toHaveAttribute('data-triangles', /^[1-9]\d*$/)
  await expect(page.getByTestId('detail-sheet')).toContainText('Hankyu track 3')
  await expect(page.getByTestId('vehicle-preview')).toHaveCount(0)
  await expect(page.locator('img, image, object, embed, iframe')).toHaveCount(0)
})
