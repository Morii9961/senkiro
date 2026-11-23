import { expect, test } from '@playwright/test'

test.use({ reducedMotion: 'reduce' })

test('AT-2D-01: a platform hit in the drawing becomes the same selection in 3D', async ({ page }) => {
  const id = 'sk:platform:hk-3'
  await page.goto('/?lang=en&mode=2d&floor=2&site=sk:context:hankyu')
  const marker = page.locator('[data-plan-marker="' + id + '"]')
  await expect(marker).toBeAttached()
  await marker.click()
  await expect(page.getByTestId('detail-sheet')).toHaveAttribute('data-target', 'platform:' + id)
  await expect(page.locator('[data-plan-owner="' + id + '"]')).toHaveAttribute('data-plan-selected', 'true')
  await expect.poll(() => new URL(page.url()).searchParams.get('sel')).toBe('platform:' + id)
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await expect(page.locator('canvas')).toHaveAttribute('data-selected', 'platform:' + id)
  await expect(page.locator('canvas')).toHaveAttribute('data-highlighted', /^[1-9]\d*$/)
  await expect(page.getByTestId('detail-sheet')).toHaveAttribute('data-target', 'platform:' + id)
  await expect(page.locator('.floors').getByRole('button', { name: '3F', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('AT-2D-03: returning from a floor plan preserves the explicit floor, selected station object and route', async ({ page }) => {
  const id = 'platform:sk:platform:jr-3-4'
  await page.goto('/?lang=en&floor=1&from=sk:platform:jr-3-4&sel=' + id)
  const canvas = page.locator('canvas[data-rebuilds]')
  await expect(canvas).toHaveAttribute('data-selected', id)
  await expect(canvas).toHaveAttribute('data-route-links', /sk:/)
  const route = await canvas.getAttribute('data-route-links')
  const floor = await page.locator('.floors button[aria-pressed="true"]').first().textContent()
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await expect(page.getByTestId('detail-sheet')).toHaveAttribute('data-target', id)
  await expect(page.locator('[data-plan-owner="sk:platform:jr-3-4"]')).toHaveAttribute('data-plan-selected', 'true')
  await expect(page.locator('.sheets [data-plan-route]').first()).toBeAttached()
  await expect(page.getByLabel('From', { exact: true })).toHaveValue('sk:platform:jr-3-4')
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-selected', id)
  await expect(canvas).toHaveAttribute('data-route-links', route!)
  await expect(page.locator('.floors').getByRole('button', { name: floor!, exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('AT-2D-03: an implicit 2D floor does not turn the 3D overview into an isolated floor', async ({ page }) => {
  await page.goto('/?lang=en&sel=platform:sk:platform:hk-3')
  await expect(page.locator('.floors').getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await expect(page.locator('[data-plan-owner="sk:platform:hk-3"]')).toHaveAttribute('data-plan-selected', 'true')
  await expect(page.locator('.floors').getByRole('button', { name: '3F', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.view-tag')).toContainText('3F')
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await expect(page.locator('canvas')).toHaveAttribute('data-selected', 'platform:sk:platform:hk-3')
  await expect(page.locator('.floors').getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('AT-2D-02: labelled layers preserve route ink, and label boxes on a sheet do not overlap', async ({ page }) => {
  await page.goto('/?lang=en&mode=2d')
  await page.getByRole('button', { name: 'Routes & places' }).click()
  let links = 0
  for (const floor of ['3F', '2F', '中2F', '1F', 'B1F', 'B2F']) {
    await page.locator('.floors').getByRole('button', { name: floor, exact: true }).click()
    await expect(page.locator('.sheets [data-plan-label]').first(), floor).toBeAttached()
    const conflicts = await page.locator('.sheet svg').evaluateAll((sheets) => sheets.flatMap((sheet) => {
      const labels = [...sheet.querySelectorAll('[data-plan-label]')].map((el) => el.getBoundingClientRect())
      return labels.flatMap((a, i) => labels.slice(i + 1).filter((b) =>
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.25 &&
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.25))
    }))
    expect(conflicts, floor).toHaveLength(0)
    expect(await page.locator('.sheets [data-line-color="known"]').count(), floor).toBe(0)
    if (floor === 'B2F') {
      await expect(page.locator('[data-plan-owner="sk:platform:metro-1"][data-plan-route-place="true"] > rect')).toHaveCSS(
        'stroke-width', '0.24px',
      )
    }
    links += await page.locator('.sheets [data-plan-route]').count()
  }
  expect(links).toBeGreaterThan(0)
})

test('AT-2D-02: B2F blocks keep nearby and connected places together at one base scale', async ({ page }) => {
  await page.goto('/?lang=en&mode=2d&floor=-2')
  const underground = page.locator('.sheet').filter({ has: page.locator('[data-plan-owner="sk:platform:jr-21-22"]') })
  await expect(underground.locator('[data-plan-owner="sk:platform:jr-23-24"]')).toBeAttached()
  await expect(underground.locator('[data-plan-owner="sk:concourse:ac-b2"]')).toBeAttached()
  await expect(underground.locator('[data-plan-owner="sk:platform:metro-1"]')).toHaveCount(0)
  const scales = await page.locator('svg[data-plan-scale]').evaluateAll((maps) => maps.map((svg) => svg.getAttribute('data-plan-scale')))
  expect(scales.length).toBeGreaterThan(1)
  expect(new Set(scales).size).toBe(1)
  await expect(page.locator('.plan-compass')).toBeVisible()
  await expect(page.locator('.plan-block-note')).toContainText('not to scale')

  const metro = page.locator('.sheet').filter({ has: page.locator('[data-plan-owner="sk:platform:metro-1"]') })
  const metroDrawing = metro.locator('[data-plan-transform]')
  const adjacentDrawing = underground.locator('[data-plan-transform]')
  const before = await metroDrawing.getAttribute('transform')
  const adjacent = await adjacentDrawing.getAttribute('transform')
  const view = metro.locator('svg')
  // The corner is background. Double-clicking a platform also opens its inspector,
  // which legitimately fits the whole floor into a narrower stage.
  const blank = { x: 8, y: 8 }
  await view.hover({ position: blank })
  await page.mouse.wheel(0, -300)
  await expect(metroDrawing).not.toHaveAttribute('transform', before!)
  await expect(adjacentDrawing).toHaveAttribute('transform', adjacent!)
  await view.dblclick({ position: blank })
  await expect(metroDrawing).toHaveAttribute('transform', before!)
  await expect(page.getByTestId('detail-sheet')).toHaveCount(0)
})
