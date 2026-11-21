import { test, expect } from '@playwright/test'
test('opens the WebGL model, walks a segment and switches floors without console errors', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto('/')
  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible()
  await expect(canvas).toHaveAttribute('data-triangles', /^[1-9]\d+$/)
  console.log(
    'WebGL',
    await canvas.getAttribute('data-calls'),
    'calls,',
    await canvas.getAttribute('data-triangles'),
    'triangles',
  )
  await page.screenshot({ path: info.outputPath('overview.png') })
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await page.getByRole('button', { name: 'Start walkthrough' }).click()
  await expect(page.locator('[aria-current="step"]')).toHaveCount(1)
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await expect(
    page.getByRole('img', { name: /Schematic floor plan/ }).first(),
  ).toBeVisible()
  await page.getByRole('button', { name: '2F', exact: true }).click()
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await expect(canvas).toBeVisible()
  await page.getByRole('button', { name: 'Reset view' }).click()
  expect(errors).toEqual([])
})

test('lets a mobile visitor inspect fare zones, sources and the synthetic overlay', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await page.getByRole('button', { name: 'Model guide' }).click()
  await expect(page.getByText('Live feed unavailable')).toBeVisible()
  await page.getByLabel('Show example overlay').check()
  await expect(page.locator('.fixture')).toContainText(
    '2000-01-01T09:00:00+09:00',
  )
  await expect(page.locator('.sample-tag')).toContainText('EXAMPLE MODE')
  await page
    .getByLabel('Facility', { exact: true })
    .selectOption('sk:concourse:metro-gate-out')
  await expect(
    page.getByText('B1F · Outside gates · manager unknown'),
  ).toBeVisible()
  await expect(page.getByText('Hankyu Osaka-umeda · Unverified')).toBeVisible()
  await page.getByRole('button', { name: 'Toggle theme' }).click()
  await page
    .getByRole('button', { name: 'Sources', exact: false })
    .first()
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Itinerary' }).click()
  await page.getByLabel('Verified step-free links only').check()
  await expect(page.locator('.steps li')).toHaveCount(8)
  await page.getByLabel('Guided route').selectOption('1')
  await page.getByLabel('Verified step-free links only').uncheck()
  await page.getByRole('button', { name: 'B2F', exact: true }).click()
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await expect(page.getByRole('img', { name: /JR Osaka/ })).toContainText(
    'Umekita platforms 21 / 22',
  )
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({ path: info.outputPath('mobile-plan.png') })
})
