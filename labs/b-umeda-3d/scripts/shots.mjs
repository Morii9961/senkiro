import { mkdir } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'
import { preview } from 'vite'
import { installedBrowser } from './browser.mjs'

const [directory, outDir] = process.argv.slice(2)
if (!directory || !/^[\w-]+$/.test(directory)) {
  throw new Error('Usage: node scripts/shots.mjs <shot-set> [dist-directory]')
}
const output = 'shots/' + directory
await mkdir(output, { recursive: true })
const server = await preview({
  build: { outDir },
  preview: { host: '127.0.0.1', port: 27240, strictPort: true },
})
const url = 'http://127.0.0.1:' + server.httpServer.address().port
let browser

try {
  browser = await chromium.launch({
    executablePath: installedBrowser(),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  const canvas = page.locator('canvas[data-triangles]')
  const button = (name) => page.getByRole('button', { name, exact: true })
  const capture = async (name) => {
    await expect(canvas).toHaveAttribute('data-triangles', /^[1-9]\d*$/)
    await page.mouse.move(0, 0)
    await page.screenshot({ path: `${output}/${name}.png` })
  }

  await page.goto(url, { waitUntil: 'networkidle' })
  await capture('01-overview')
  await button('2F').click()
  await capture('02-floor-2f')
  await button('B1F').click()
  await capture('03-floor-b1f')
  await button('経路・施設').click()
  await page.getByRole('button', { name: /経路案内を開始/ }).click()
  for (let step = 1; step <= 8; step += 1) {
    if ([1, 4, 8].includes(step)) await capture('04-route-' + step)
    if (step < 8) await button('案内を進める').click()
  }

  await page.goto(url, { waitUntil: 'networkidle' })
  for (const [name, site] of [
    ['05-passenger-hankyu', '阪急 大阪梅田'],
    ['06-passenger-whity', 'ホワイティうめだ'],
  ]) {
    await page.locator('.surround summary').click()
    await page.locator('.site-list button').filter({ hasText: site }).click()
    await button('乗客目線').click()
    await expect(canvas).toHaveAttribute('data-view', 'interior')
    await capture(name)
  }

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  for (const [name, id] of [
    ['platform', 'sk:platform:jr-3-4'],
    ['gate', 'sk:gate:jr-midosuji'],
    ['entrance', 'sk:entrance:midosuji-south'],
  ]) {
    await page.goto(url, { waitUntil: 'networkidle' })
    await button('EN').click()
    if (name === 'gate') {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await button('Routes & places').click()
      await page.getByRole('button', { name: 'Start walkthrough' }).click()
      await expect(canvas).toHaveAttribute('data-focus', id)
      await page.emulateMedia({ reducedMotion: 'no-preference' })
    }
    if (name === 'entrance') {
      await button('1F').click()
      await button('Routes & places').click()
      await button('Model guide').click()
    }
    const featurePicker = name === 'platform' &&
      !(await page.locator(`.pin[data-owner="${id}"]:visible`).first().isVisible())
    if (featurePicker) {
      await button('Routes & places').click()
      await button('Model guide').click()
    }
    const before = await canvas.getAttribute('data-camera')
    if (before) {
      await canvas.evaluate((element) => {
        const stopFocus = new MutationObserver(() => {
          if (!element.getAttribute('data-selected')) return
          stopFocus.disconnect()
          // Stop the focus before its first frame without moving the camera.
          element.dispatchEvent(new WheelEvent('wheel', { deltaY: 0 }))
        })
        stopFocus.observe(element, { attributeFilter: ['data-selected'] })
      })
    }
    if (name === 'entrance' || featurePicker) {
      await page.getByLabel('Facility', { exact: true }).selectOption(id)
    } else {
      const pin = page.locator(`.pin[data-owner="${id}"]:visible`).first()
      await expect(pin).toBeVisible()
      const { x, y, width, height } = await pin.boundingBox()
      await page.mouse.click(x + width / 2, y + height / 2)
    }
    if (before) {
      await expect(canvas).toHaveAttribute('data-selected', name + ':' + id)
      await expect(canvas).toHaveAttribute('data-camera', before)
      await page.waitForTimeout(200)
    }
    if (featurePicker) await button('Routes & places').click()
    await capture('07-selection-' + name)
  }
  expect(errors).toEqual([])
} finally {
  await browser?.close()
  await server.close()
}
