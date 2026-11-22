import { expect, test } from '@playwright/test'

test('AT-LBL-04: after the camera settles, deck proxies suppress obstructed labels', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?debug=labels&detail=structure')
  const canvas = page.locator('canvas[data-triangles]')
  await expect(canvas).toHaveAttribute('data-occluders', /^[1-9]\d*$/)
  await canvas.focus()
  await page.keyboard.press('+')
  await page.keyboard.press('+')
  await expect(canvas).toHaveAttribute('data-band', 'mid')
  const gate = 'gate:sk:gate:jr-midosuji'
  await expect(canvas).toHaveAttribute('data-occluded', /"gate:sk:gate:jr-midosuji"/)
  await expect(page.locator(`.pin[data-key="${gate}"]`)).toBeHidden()

  await page.goto('/?detail=structure&sel=' + encodeURIComponent(gate))
  const selected = page.locator(`.pin.selected[data-key="${gate}"]`)
  await expect(selected).toBeVisible()
  await expect(selected).toHaveClass(/occluded-pin/)
  await expect(selected).toHaveAttribute('data-occlusion', '遮蔽')
  expect(errors).toEqual([])
})
