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

test('AT-LINE-02: Osaka platforms show the operator codes for each serving line', async ({ page }) => {
  await page.goto('/?sel=platform:sk:platform:jr-5-6')
  const pin = page.locator('.platform-pin[data-owner="sk:platform:jr-5-6"]')
  await expect(pin.locator('.line-mark')).toHaveText(['A', 'G'])
  const detail = page.getByTestId('detail-sheet')
  await expect(detail.locator('.line-badge')).toHaveText(['AJR神戸線', 'GJR宝塚線'])
  await expect(detail.locator('[data-field="boarding"]')).toContainText('5・6')
  await expect(detail.locator('[data-field="neighbors"]')).toContainText('塚本')
  await detail.getByText('公式時刻表', { exact: true }).click()
  await expect(detail.getByRole('link', { name: /JR神戸線/ })).toHaveAttribute('href', /2796012001$/)
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
  const badge = page.locator('.line-badge').filter({ hasText: synthetic })
  await expect(badge).toHaveAttribute('data-line-color', 'known')
  await expect(badge.locator('.line-mark')).toHaveCSS('background-color', 'rgb(27, 54, 93)')
  await expect(badge.locator('.line-mark')).toHaveCSS('color', 'rgb(255, 255, 255)')
})
