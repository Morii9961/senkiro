import { expect, test, type Page } from '@playwright/test'

const train = 'demo:umeda-kyoto'
const target = 'train:' + train
const station = '/?lang=en&floor=2&site=sk:context:hankyu&debug=trains'

async function startDemo(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(station)
  await page.getByRole('button', { name: 'Routes & places' }).click()
  await page.getByRole('button', { name: 'Trains', exact: true }).click()
  const epoch = new Date('2026-01-01T00:00:00Z')
  await page.clock.install({ time: epoch })
  await page.clock.pauseAt(new Date(epoch.getTime() + 100))
  await page.getByRole('button', { name: 'Demo', exact: true }).evaluate((button) => (button as HTMLButtonElement).click())
  await page.clock.fastForward(38_000)
  const canvas = page.locator('canvas[data-frame]')
  await expect(canvas).toHaveAttribute('data-train-state', /doors-open/)
  return canvas
}

async function clickTrainBody(page: Page, id = train) {
  const canvas = page.locator('canvas[data-frame]')
  await expect(canvas).toHaveAttribute('data-train-points', new RegExp(id))
  const { [id]: point } = JSON.parse((await canvas.getAttribute('data-train-points'))!)
  const canvasBox = (await canvas.boundingBox())!
  await page.mouse.click(canvasBox.x + point[0], canvasBox.y + point[1])
  await expect(canvas).toHaveAttribute('data-selected', 'train:' + id)
}

test('AT-TRN-07: a real canvas hit selects the train and links to its platform schedule', async ({ page }) => {
  const canvas = await startDemo(page)
  const rebuilds = await canvas.getAttribute('data-rebuilds')
  await clickTrainBody(page)
  const card = page.getByTestId('detail-sheet')
  await expect(canvas).toHaveAttribute('data-selected', target)
  await expect(canvas).toHaveAttribute('data-highlighted', /^[1-9]/)
  await expect(card).toHaveAttribute('data-target', target)
  for (const fact of ['Fictional', '京都方面', '特急', 'Kyoto Line', 'Hankyu track 3',
    '09:00:30', '09:01:30', '9300', 'Representative', 'Formation unverified', 'Schematic appearance', 'Doors open']) {
    await expect(card).toContainText(fact)
  }
  await expect(page.locator('.train-marker[data-owner="' + train + '"]')).toContainText('Fictional')
  await card.getByRole('button', { name: 'Hankyu track 3', exact: true }).evaluate((button) => (button as HTMLButtonElement).click())
  await expect(card).toHaveAttribute('data-target', 'platform:sk:platform:hk-3')
  const service = card.getByTestId('platform-service')
  await expect(service).toContainText('Fictional')
  await expect(service).toContainText('09:00:30')
  await expect(service).toContainText('09:01:30')
  await expect(service).not.toContainText('Live feed unavailable')
  await expect(canvas).toHaveAttribute('data-rebuilds', rebuilds!)
})

test('AT-TRN-08 and AT-SEL-05: follow moves the camera, and clearing selection preserves the view', async ({ page }) => {
  const canvas = await startDemo(page)
  await clickTrainBody(page)
  const card = page.getByTestId('detail-sheet')
  const parked = await canvas.getAttribute('data-camera')
  await card.getByRole('button', { name: 'Close', exact: true }).evaluate((button) => (button as HTMLButtonElement).click())
  await expect(canvas).toHaveAttribute('data-selected', '')
  await expect(canvas).toHaveAttribute('data-camera', parked!)
  await clickTrainBody(page)
  const model = (await canvas.boundingBox())!
  await page.mouse.click(model.x + model.width * 0.04, model.y + model.height * 0.11)
  await expect(canvas).toHaveAttribute('data-selected', '')
  await expect(canvas).toHaveAttribute('data-camera', parked!)
  await clickTrainBody(page)
  const follow = card.getByRole('button', { name: 'Follow', exact: true })
  await follow.evaluate((button) => (button as HTMLButtonElement).click())
  await expect(follow).toHaveAttribute('aria-pressed', 'true')
  await expect(canvas).toHaveAttribute('data-following', train)
  const standing = await canvas.getAttribute('data-camera')
  await page.clock.fastForward(67_000)
  await expect(canvas).not.toHaveAttribute('data-camera', standing!)
  const stage = (await canvas.boundingBox())!
  await page.mouse.move(stage.x + stage.width * 0.55, stage.y + stage.height * 0.4)
  await page.mouse.down()
  await page.mouse.move(stage.x + stage.width * 0.6, stage.y + stage.height * 0.49, { steps: 4 })
  await page.mouse.up()
  await expect(canvas).toHaveAttribute('data-following', '')
  await expect(follow).toHaveAttribute('aria-pressed', 'false')
  const dragged = await canvas.getAttribute('data-camera')
  await page.clock.fastForward(9000)
  await expect(canvas).toHaveAttribute('data-camera', dragged!)
  await page.keyboard.press('Escape')
  await expect(canvas).toHaveAttribute('data-selected', '')
  await expect(canvas).toHaveAttribute('data-highlighted', '0')
  await expect(card).toHaveCount(0)
  await expect(canvas).toHaveAttribute('data-camera', dragged!)
})

test('AT-TRN-07: an unknown vehicle and missing service class stay explicit', async ({ page }) => {
  const canvas = await startDemo(page)
  await page.getByLabel('Service day').evaluate((control) => {
    const select = control as HTMLSelectElement
    select.value = 'weekend'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.clock.fastForward(90_000)
  await clickTrainBody(page, 'demo:umeda-kobe')
  const card = page.getByTestId('detail-sheet')
  await expect(canvas).toHaveAttribute('data-selected', 'train:demo:umeda-kobe')
  await expect(card.locator('[data-field="class"] .unknown-value')).toHaveText('Unverified')
  await expect(card.locator('[data-vehicle-status="unknown"]')).toHaveText('Vehicle unverified (generic body)')
  await expect(card.getByRole('button', { name: 'Hankyu track 8', exact: true })).toBeVisible()
})

test('AT-2D-03: a scheduled demo selection survives the view switch while its trip is active', async ({ page }) => {
  const canvas = await startDemo(page)
  await clickTrainBody(page)
  const card = page.getByTestId('detail-sheet')
  await page.getByRole('button', { name: '2D', exact: true }).evaluate((button) => (button as HTMLButtonElement).click())
  await expect(card).toHaveAttribute('data-target', target)
  await expect(card.getByRole('button', { name: 'Follow', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '3D', exact: true }).evaluate((button) => (button as HTMLButtonElement).click())
  await expect(canvas).toHaveAttribute('data-selected', target)
  await expect(card.getByRole('button', { name: 'Follow', exact: true })).toHaveAttribute('aria-pressed', 'false')
})
