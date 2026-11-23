import { expect, test } from '@playwright/test'
import { model } from '../../data/manual/model'
import { deriveTrackPaths } from '../../src/trains/trackPaths'

const tracks = deriveTrackPaths(model)
type TrainFrame = {
  platformId: string
  trackPathId: string
  phase: string
  s: number
  bounds: [number[], number[]]
}

test.use({ reducedMotion: 'reduce', viewport: { width: 1120, height: 780 } })

test('AT-TRN-05/06: demo meshes move, stop on the numbered track and remain inside its corridor', async ({ page }) => {
  const site = 'sk:context:hankyu'
  await page.goto('/?lang=en&floor=2&site=' + encodeURIComponent(site) + '&debug=trains')
  const canvas = page.locator('canvas[data-frame]')
  await expect(canvas).toHaveAttribute('data-trains', '[]')
  await page.getByRole('button', { name: 'Routes & places' }).click()
  await page.getByRole('button', { name: 'Trains', exact: true }).click()
  const epoch = new Date('2026-01-01T00:00:00Z')
  await page.clock.install({ time: epoch })
  await page.clock.pauseAt(new Date(epoch.getTime() + 100))
  await page.getByRole('button', { name: 'Demo', exact: true }).evaluate((button) => (button as HTMLButtonElement).click())
  const rebuilds = await canvas.getAttribute('data-rebuilds')
  const samples: TrainFrame[] = []
  for (const advance of [3, 20, 14, 40, 15, 18, 13]) {
    await page.clock.fastForward(advance * 1000)
    const frame = JSON.parse((await canvas.getAttribute('data-train-state')) ?? '[]') as TrainFrame[]
    samples.push(...frame)
  }
  await expect(page.locator('[data-train-card]').first()).toContainText('Hankyu track 3')
  const firstTrack = samples.filter(({ platformId }) => platformId === 'sk:platform:hk-3')
  expect(firstTrack.map((entry) => entry.phase)).toEqual(expect.arrayContaining(['approaching', 'braking', 'doors-open', 'departing']))
  expect(firstTrack[0]!.s).toBeLessThan(firstTrack[2]!.s)
  expect(firstTrack[5]!.s).toBeLessThan(firstTrack[4]!.s)
  expect(new Set(samples.map(({ platformId }) => platformId))).toEqual(new Set(['sk:platform:hk-3', 'sk:platform:hk-5']))
  const gate = model.links.find(({ id }) => id === 'sk:gate:hk-3f')!
  const gates = [gate.from, gate.to].map((id) => model.places.find((place) => place.id === id)!)
  for (const { platformId, trackPathId, bounds: [min, max] } of samples) {
    const platform = model.places.find(({ id }) => id === platformId)!
    const track = tracks.find(({ id }) => id === trackPathId)!
    const [start, end] = track.polyline
    expect(track.platformId).toBe(platformId)
    expect(track.entrance).toBe('z-')
    expect(min[2]).toBeGreaterThanOrEqual(start[2] - 0.001)
    expect(max[2]).toBeLessThanOrEqual(end[2] + 0.001)
    expect(min[0]).toBeLessThanOrEqual(start[0])
    expect(max[0]).toBeGreaterThanOrEqual(start[0])
    expect(max[0]).toBeLessThan(platform.point[0] - platform.size[0] / 2)
    for (const gateSide of gates) {
      const [x, z] = gateSide.point
      const [w, d] = gateSide.size
      expect(max[0] < x - w / 2 || min[0] > x + w / 2 || max[2] < z - d / 2 || min[2] > z + d / 2).toBe(true)
    }
  }
  const speed = page.getByLabel('Speed')
  await speed.evaluate((control) => {
    const select = control as HTMLSelectElement
    select.value = '10'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.clock.fastForward(3000)
  await expect(page.getByLabel('Simulation time')).toContainText('09:02:33')
  await expect(canvas).toHaveAttribute('data-rebuilds', rebuilds!)
  await page.getByRole('button', { name: 'Off', exact: true }).evaluate((button) => (button as HTMLButtonElement).click())
  await expect(canvas).toHaveAttribute('data-trains', '[]')
  await expect(canvas).toHaveAttribute('data-rebuilds', rebuilds!)
})

test('AT-PERF-03: a full minute of demo does not rebuild the scene', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/?lang=en&floor=2&site=sk:context:hankyu')
  const canvas = page.locator('canvas[data-frame]')
  await page.getByRole('button', { name: 'Routes & places' }).click()
  await page.getByRole('button', { name: 'Trains', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-trains', '[]')
  const before = await canvas.getAttribute('data-rebuilds')
  await page.getByRole('button', { name: 'Demo', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-trains', /demo:umeda-kyoto/)
  const evidence = await canvas.evaluate(async (element) => {
    const canvas = element as HTMLCanvasElement
    const start = performance.now()
    const initial = Number(canvas.dataset.frame)
    await new Promise((resolve) => setTimeout(resolve, 60_000))
    return { ms: Math.round(performance.now() - start), frames: Number(canvas.dataset.frame) - initial }
  })
  console.log('AT-PERF-03 ANGLE SwiftShader, demo-only drawing', evidence)
  expect(evidence.ms).toBeGreaterThanOrEqual(60_000)
  expect(evidence.frames).toBeGreaterThan(0)
  await expect(canvas).toHaveAttribute('data-rebuilds', before!)
  await page.getByRole('button', { name: 'Off', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-trains', '[]')
  await expect(canvas).toHaveAttribute('data-rebuilds', before!)
  const idle = await canvas.evaluate(async (element) => {
    const canvas = element as HTMLCanvasElement
    await new Promise((resolve) => setTimeout(resolve, 300))
    const frame = canvas.dataset.frame
    await new Promise((resolve) => setTimeout(resolve, 700))
    return canvas.dataset.frame === frame
  })
  expect(idle).toBe(true)
})
