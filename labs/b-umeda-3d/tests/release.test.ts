import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { lineStyles } from '../data/manual/lines'
import { planRoute } from '../src/domain/graph'
import { station } from '../src/model'
import { defaultUrlState, parseUrl } from '../src/state/url'
import { RoutePanel, tours } from '../src/ui/panels/RoutePanel'

it('AT-REL-01: the release report covers all ten sections and records the four gate defaults', () => {
  const report = readFileSync(new URL('../REPORT.md', import.meta.url), 'utf8')
  expect([...report.matchAll(/^## (\d+)\./gm)].map((match) => Number(match[1])))
    .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  expect([...report.matchAll(/^\| (G[1-4]) \|/gm)].map((match) => match[1]))
    .toEqual(['G1', 'G2', 'G3', 'G4'])
  expect(lineStyles.every(({ color }) => color === null)).toBe(true)
  expect(parseUrl(new URLSearchParams('lang=zh')).lang).toBe(defaultUrlState.lang)
  expect(defaultUrlState.feed).toBe('off')
})

it('AT-NAV-10: the route summary and steps leave distance and duration unmeasured in both languages', () => {
  const { start, end } = tours[0]
  const result = planRoute(station, start, end)
  expect(result).toMatchObject({ distanceMeters: null, durationSeconds: null })
  const noop = () => {}
  for (const lang of ['ja', 'en'] as const) {
    const rendered = renderToStaticMarkup(createElement(RoutePanel, {
      lang, tour: 0, trip: { start, end }, step: 0, lift: false, result,
      pickTour: noop, endpoint: noop, highlight: noop, onFind: noop, onClear: noop, onSwap: noop, onLiftChange: noop,
    }))
    const summaryAndSteps = rendered.substring(rendered.indexOf('data-testid="route-summary"')).replace(/<[^>]*>/g, ' ')
    expect(summaryAndSteps).toContain(lang === 'ja' ? '距離・所要時間：未測定' : 'Distance and duration: Unmeasured')
    expect(summaryAndSteps).not.toMatch(/\d+(?:[.,]\d+)?\s*(?:メートル|キロメートル|分(?:間)?(?:$|[\s。])|(?:km|m|met(?:er|re)s?|min(?:ute)?s?)\b)/i)
  }
})
