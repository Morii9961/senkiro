import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('AT-LBL-00 regression: layout retains the baseline label candidates and reports visible keys', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('/')
  const canvas = page.locator('canvas[data-triangles]')
  await expect(canvas).toBeVisible()
  const views: { name: string; reported: string | null; keys: (string | null)[] }[] = []
  for (const [name, floor] of [['overview', null], ['2f', '2F'], ['b1f', 'B1F']] as const) {
    if (floor) await page.getByRole('button', { name: floor, exact: true }).click()
    const visible = await page.locator('.pin:visible').evaluateAll((labels) => labels.map((label) => ({
      owner: label.getAttribute('data-owner'),
      text: label.textContent,
      key: label.getAttribute('data-key'),
    })))
    const baseline = readFileSync(new URL(
      './labels.spec.ts-snapshots/' + name + '-labels-win32.txt', import.meta.url,
    ), 'utf8').trim().split(/\r?\n/)
    const normalize = (line: string) => line.replace(/\s*[・·]\s*/g, '·')
    const candidates = await page.locator('.pin[data-owner]').evaluateAll((labels) => labels.map((label) => {
      const caption = [...label.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent).join('')
      return label.getAttribute('data-owner') + ' | ' + caption
    }))
    expect(candidates.map(normalize)).toEqual(expect.arrayContaining(baseline.map(normalize)))
    views.push({
      name,
      reported: await canvas.getAttribute('data-labels'),
      keys: visible.map(({ key }) => key).sort(),
    })
  }
  for (const { name, reported, keys } of views) {
    expect(reported, name).not.toBeNull()
    expect(keys, name).not.toContain(null)
    expect(new Set(keys).size, name).toBe(keys.length)
    expect(JSON.parse(reported!), name).toEqual(keys)
  }
  expect(errors).toEqual([])
})

test('orbiting reprojects the same visible labels until release', async ({ page }) => {
  await page.goto('/')
  const canvas = page.locator('canvas[data-triangles]')
  const pin = page.locator('.station-pin[data-key="station:sk:station:jr-osaka"]:visible')
  await expect(pin).toBeVisible()
  const bounds = (await canvas.boundingBox())!
  const x = bounds.x + bounds.width * 0.58
  const y = bounds.y + bounds.height * 0.61
  await page.mouse.move(x, y)
  await page.mouse.down()
  const keys = await canvas.getAttribute('data-labels')
  const before = await pin.evaluate((element) => getComputedStyle(element).transform)
  await page.mouse.move(x + 45, y + 15, { steps: 3 })
  await expect(canvas).toHaveAttribute('data-labels', keys!)
  expect(await pin.evaluate((element) => getComputedStyle(element).transform)).not.toBe(before)
  await expect(page.locator('.label-leaders')).toHaveCSS('visibility', 'hidden')
  await page.mouse.up()
  await expect(page.locator('.label-leaders')).toHaveCSS('visibility', 'visible')
})
