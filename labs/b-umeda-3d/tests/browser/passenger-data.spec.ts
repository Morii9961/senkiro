import { expect, test } from '@playwright/test'

test('AT-DET-08 and AT-HON-02: sourced platforms and exits retain clear unknown fields', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const panel = page.getByTestId('detail-sheet')
  await page.goto('/?sel=platform:sk:platform:metro-1')
  await expect(panel.locator('[data-field="direction"]')).toContainText('なかもず')
  await expect(panel.locator('[data-field="neighbors"]')).toContainText('淀屋橋')
  await expect(panel.locator('[data-field="terminus"]')).toContainText('未確認')
  await panel.getByText('資料・精度', { exact: true }).click()
  await expect(panel.locator('a[href*="M16_"]')).toBeVisible()
  await page.goto('/?sel=entrance:sk:entrance:midosuji-south')
  await expect(panel.locator('[data-field="exit-label"]')).toContainText('御堂筋南口')
  await page.goto('/?sel=entrance:sk:entrance:surface-crossing')
  await expect(panel.locator('[data-field="exit-label"]')).toContainText('未確認')
  await expect(panel.locator('[data-field="surface"]')).toContainText('バスターミナル')
})
