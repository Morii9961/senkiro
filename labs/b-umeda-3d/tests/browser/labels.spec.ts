import { expect, test } from '@playwright/test'

test('AT-LBL-00: visible labels match the pre-extraction overview and floors', async ({ page }) => {
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
    expect(visible.map(({ owner, text }) => owner + ' | ' + text).sort().join('\n'))
      .toMatchSnapshot(name + '-labels.txt')
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
