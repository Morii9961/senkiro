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
  await page.getByRole('button', { name: 'Routes & places' }).click()
  await page.getByRole('button', { name: 'Start walkthrough' }).click()
  await expect(page.locator('[aria-current="step"]')).toHaveCount(1)
  await expect(canvas).toHaveAttribute('data-focus', 'sk:gate:jr-midosuji')
  expect(Number(await canvas.getAttribute('data-zoom'))).toBeGreaterThan(1)
  await page.screenshot({ path: info.outputPath('gate-focus.png') })
  for (let i = 1; i < 8; i++)
    await page.getByRole('button', { name: 'Advance walkthrough' }).click()
  await expect(canvas).toHaveAttribute(
    'data-focus',
    'sk:elevator:metro-platform',
  )
  await page.screenshot({ path: info.outputPath('metro-lift.png') })
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
  await page.getByRole('button', { name: 'Routes & places' }).click()
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
  await expect(page.getByText('Hankyu Osaka-umeda · Station')).toBeVisible()
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
test('selects a model feature and navigates custom endpoints in either direction', async ({
  page,
}, info) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await page.getByRole('button', { name: '2F', exact: true }).click()
  const pin = page.locator('.pin[data-owner="sk:platform:jr-3-4"]').first()
  await expect(pin).toBeVisible()
  const rect = await pin.boundingBox()
  await page.mouse.click(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2)
  await expect(page.locator('.place-card')).toContainText(
    'Osaka platforms 3 / 4',
  )
  await page.getByRole('button', { name: 'Start here' }).click()
  await page
    .getByLabel('To', { exact: true })
    .selectOption('sk:concourse:jr-central-in')
  await expect(page.locator('#tour')).toHaveValue('-1')
  await page.getByRole('button', { name: 'Swap endpoints' }).click()
  await expect(page.getByLabel('From', { exact: true })).toHaveValue(
    'sk:concourse:jr-central-in',
  )
  await page
    .locator('.steps button')
    .filter({ hasText: 'Stairs (map 53)' })
    .click()
  await expect(page.locator('canvas')).toHaveAttribute(
    'data-focus',
    'sk:stairs:jr-53',
  )
  await page.screenshot({ path: info.outputPath('central-stairs.png') })
  await page
    .getByLabel('To', { exact: true })
    .selectOption('sk:concourse:jr-central-in')
  await expect(
    page.getByText('You are already at the destination.'),
  ).toBeVisible()
})
test('opens each district model and shows its own floors, platforms and retail passages', async ({
  page,
}, info) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  for (const [label, expected] of [
    ['Hankyu Osaka-umeda', '3F'],
    ['Hanshin Osaka-Umeda', 'B2F'],
    ['Higashi-Umeda', 'B2F'],
    ['Nishi-Umeda', 'B2F'],
    ['Kitashinchi', 'B2F'],
    ['Whity Umeda', 'B1F'],
  ]) {
    await page.locator('.surround summary').click()
    await page.locator('.site-list button').filter({ hasText: label }).click()
    await expect(page.locator('.viewer-bar strong')).toContainText(label)
    await expect(
      page
        .locator('.floors')
        .getByRole('button', { name: expected, exact: true }),
    ).toBeVisible()
    await expect(page.locator('canvas')).toHaveAttribute(
      'data-triangles',
      /^[1-9]/,
    )
    if (label === 'Hankyu Osaka-umeda' || label === 'Whity Umeda') {
      const slug = label.split(' ')[0]
      await page.screenshot({ path: info.outputPath(slug + '.png') })
      const interior = page.getByRole('button', { name: 'Passenger view' })
      await interior.click()
      const canvas = page.locator('canvas')
      await expect(canvas).toHaveAttribute('data-view', 'interior')
      await page.screenshot({
        path: info.outputPath('passenger-' + slug + '.png'),
      })
      const frame = await canvas.getAttribute('data-frame')
      await canvas.focus()
      await page.keyboard.press('ArrowRight')
      await expect(canvas).not.toHaveAttribute('data-frame', frame!)
      await interior.click()
      await expect(canvas).toHaveAttribute('data-view', 'overview')
    }
  }
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await expect(page.locator('.sheet')).toHaveCount(1)
  await expect(page.locator('.sheet')).toContainText('Izumi-no-Hiroba')
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await page.locator('.surround summary').click()
  await page.getByRole('button', { name: /Entire district/ }).click()
  await expect(page.locator('.viewer-bar strong')).toContainText(
    'Osaka / Umeda',
  )
  expect(errors).toEqual([])
})
