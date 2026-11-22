import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test, type Page } from '@playwright/test'

const errors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  const messages: string[] = []
  errors.set(page, messages)
  page.on('pageerror', (error) => messages.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text())
  })
})
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]))

test('AT-LINE-02: unverified platform and facility badges use neutral styling', async ({ page }) => {
  await page.goto('/?sel=platform:sk:platform:jr-3-4')
  const pin = page.locator('.platform-pin[data-owner="sk:platform:jr-3-4"]')
  await expect(pin).toHaveAttribute('data-line-color', 'unknown')
  await expect(pin).toHaveAttribute('title', /線色未確認/)
  await expect(pin).toHaveCSS('background-color', 'rgb(239, 239, 239)')
  const badge = page.locator('.place-card .line-badge')
  await expect(badge).toHaveAttribute('title', '線色未確認')
  await expect(badge).toContainText('JR神戸線')
  const source = readFileSync('src/Scene.tsx', 'utf8')
  expect(source).not.toMatch(/#(b44041|b95436|537986)/i)
})

test('AT-LINE-02: a synthetic badge fixture renders the supplied color and foreground', async ({ page }) => {
  const { LineBadge } = await import('../../src/ui/atoms/LineBadge')
  const { lineStyleById, linesById } = await import('../../src/model')
  const line = linesById.get('sk:line:kobe')!
  const style = lineStyleById.get(line.id)!
  const original = style.color
  const synthetic = 'SYNTHETIC TEST FIXTURE'
  let markup: string
  try {
    style.color = { hex: '#1b365d', dataNature: 'synthetic', sourceIds: ['test-only'] }
    markup = renderToStaticMarkup(createElement(LineBadge, {
      line: {
        ...line,
        names: { ...line.names, en: synthetic },
        provenance: { ...line.provenance, dataNature: 'synthetic' },
      },
      lang: 'en',
    }))
  } finally {
    style.color = original
  }
  await page.setContent(markup)
  const badge = page.getByText(synthetic)
  await expect(badge).toHaveAttribute('data-line-color', 'known')
  await expect(badge).toHaveCSS('background-color', 'rgb(27, 54, 93)')
  await expect(badge).toHaveCSS('color', 'rgb(255, 255, 255)')
})
