import { preview } from 'vite'
import { chromium } from 'playwright'
import { installedBrowser } from './browser.mjs'
const server = await preview({ preview: { host: '127.0.0.1', port: 0 } })
let browser
try {
  browser = await chromium.launch({
    executablePath: installedBrowser(),
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })
  await page.goto('http://127.0.0.1:' + server.httpServer.address().port)
  const canvas = page.locator('canvas[data-triangles]')
  await canvas.waitFor()
  await canvas.focus()
  // Drive an actual camera operation once per animation frame; alternating pan avoids drifting off-screen.
  const measurement = await canvas.evaluate(async (c) => {
    const start = performance.now(),
      initial = Number(c.dataset.frame)
    let ticks = 0
    await new Promise((resolve) => {
      function move() {
        c.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: ticks++ % 2 ? 'ArrowLeft' : 'ArrowRight',
            bubbles: true,
          }),
        )
        if (performance.now() - start < 3000) requestAnimationFrame(move)
        else resolve()
      }
      requestAnimationFrame(move)
    })
    const ms = performance.now() - start
    return {
      ms,
      ticks,
      interactionFps: (ticks * 1000) / ms,
      drawnFrames: Number(c.dataset.frame) - initial,
      calls: c.dataset.calls,
      triangles: c.dataset.triangles,
      viewport: [innerWidth, innerHeight],
      canvas: [c.width, c.height],
    }
  })
  console.log(
    JSON.stringify(
      {
        browser: browser.version(),
        renderer: 'ANGLE SwiftShader (headless)',
        ...measurement,
      },
      null,
      2,
    ),
  )
} finally {
  await browser?.close()
  await server.close()
}
