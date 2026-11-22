import { expect, test } from '@playwright/test'

test('AT-LBL-08: selected exits and route endpoints have mandatory labels', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?sel=entrance:sk:entrance:midosuji-south&lang=en')
  await expect(page.locator('.pin.selected[data-owner="sk:entrance:midosuji-south"]')).toBeVisible()
  await page.getByRole('button', { name: 'Routes & places' }).click()
  await page.getByRole('button', { name: 'Start walkthrough' }).click()
  await expect(page.locator('.pin[data-key="route-start"]:visible')).toBeVisible()
  await expect(page.locator('.pin[data-key="route-end"]:visible')).toBeVisible()
  expect(errors).toEqual([])
})
