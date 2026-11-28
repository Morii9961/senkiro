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

test('AT-URL-02: a platform deep link opens and focuses the model', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?floor=2')
  const canvas = page.locator('canvas[data-camera]')
  const overview = (await canvas.getAttribute('data-camera'))!
  await page.goto('/?sel=platform:sk:platform:hk-3&floor=2')
  await expect(canvas).toHaveAttribute('data-selected', 'platform:sk:platform:hk-3')
  await expect(canvas).toHaveAttribute('data-highlighted', /^[1-9]\d*$/)
  await expect(canvas).not.toHaveAttribute('data-camera', overview)
  await expect(page.getByTestId('detail-title')).toHaveText('阪急 3号線')
  await expect(page.getByRole('button', { name: '3F', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect.poll(() => new URL(page.url()).searchParams.get('sel')).toBeNull()
})

test('AT-URL-03: refresh restores view and route choices', async ({ page }) => {
  await page.goto('/')
  await page.locator('header select').selectOption('en')
  await page.getByRole('button', { name: 'Toggle theme' }).click()
  await page.getByRole('button', { name: 'Routes & places' }).click()
  await page.getByLabel('To', { exact: true }).selectOption('sk:platform:jr-3-4')
  await page.getByRole('button', { name: 'Start walkthrough' }).click()
  await page.getByRole('button', { name: '2D', exact: true }).click()
  await expect.poll(() => Object.fromEntries(new URL(page.url()).searchParams)).toMatchObject({
    lang: 'en', theme: 'dark', mode: '2d', to: 'sk:platform:jr-3-4', step: '0',
  })

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('main')).toHaveClass('app dark')
  await expect(page.getByRole('button', { name: '2D', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[aria-current="step"]')).toHaveCount(1)
  await expect(page.getByLabel('To', { exact: true })).toHaveValue('sk:platform:jr-3-4')
  await page.goto('/?lang=en&feed=demo')
  await expect(page.locator('.sample-tag')).toContainText('EXAMPLE MODE')
})

test('App split regression snapshots preserve header, floor controls and itinerary', async ({ page }) => {
  await page.goto('/')
  await page.locator('header select').selectOption('en')
  await expect(page.locator('header')).toMatchAriaSnapshot(`
    - heading "Umeda Station 3D" [level=1]
    - group "Map view":
      - button "3D" [pressed]
      - button "2D"
    - button "Routes & places"
    - button "Controls"
    - button "Toggle theme"
    - combobox "Language":
      - option "日本語"
      - option "EN" [selected]
      - option "中文"
  `)
  await expect(page.locator('.floors')).toMatchAriaSnapshot(`
    - group "Floor":
      - button "All" [pressed]
      - button "3F"
      - button "2F"
      - button "中2F"
      - button "1F"
      - button "B1F"
      - button "B2F"
  `)
  await page.getByRole('button', { name: 'Routes & places' }).click()
  await expect(page.locator('aside')).toMatchAriaSnapshot(`
    - navigation:
      - button "Itinerary" [pressed]
      - button "Model guide"
    - heading "Explore a route" [level=2]
    - combobox "Guided route"
    - combobox "From"
    - combobox "To"
    - checkbox "Verified step-free links only"
    - button /Start walkthrough/
  `)
})
