import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { lineStyles } from '../data/manual/lines'
import { planRoute } from '../src/domain/graph'
import { station } from '../src/model'
import { defaultUrlState, parseUrl, serializeUrl } from '../src/state/url'
import { RoutePanel, tours } from '../src/ui/panels/RoutePanel'

it('AT-REL-01: the release report covers all ten sections and records the four gate defaults', () => {
  const report = readFileSync(new URL('../REPORT.md', import.meta.url), 'utf8')
  expect([...report.matchAll(/^## (\d+)\./gm)].map((match) => Number(match[1])))
    .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  expect([...report.matchAll(/^\| (G[1-4]) \|/gm)].map((match) => match[1]))
    .toEqual(['G1', 'G2', 'G3', 'G4'])
  expect(lineStyles.some(({ color }) => color?.dataNature === 'derived')).toBe(true)
  const chinese = parseUrl(new URLSearchParams('lang=zh'))
  expect(chinese.lang).toBe('zh')
  expect(serializeUrl(chinese).get('lang')).toBe('zh')
  expect(defaultUrlState.feed).toBe('off')
})

it('AT-NAV-10: the route summary leaves distance and duration unmeasured in all supported languages', () => {
  const { start, end } = tours[0]
  const result = planRoute(station, start, end)
  expect(result).toMatchObject({ distanceMeters: null, durationSeconds: null })
  const noop = () => {}
  for (const [lang, unmeasured] of [
    ['ja', '距離・所要時間：未測定'],
    ['en', 'Distance and duration: Unmeasured'],
    ['zh', '距离与步行时间尚未测量'],
  ] as const) {
    const rendered = renderToStaticMarkup(createElement(RoutePanel, {
      lang, tour: 0, trip: { start, end }, step: 0, lift: false, result,
      pickTour: noop, endpoint: noop, highlight: noop, onFind: noop, onClear: noop, onSwap: noop, onLiftChange: noop,
    }))
    const summaryAndSteps = rendered.substring(rendered.indexOf('data-testid="route-summary"')).replace(/<[^>]*>/g, ' ')
    expect(summaryAndSteps).toContain(unmeasured)
    expect(summaryAndSteps).not.toMatch(/\d+(?:[.,]\d+)?\s*(?:メートル|キロメートル|分(?:間)?(?:$|[\s。])|(?:km|m|met(?:er|re)s?|min(?:ute)?s?)\b)/i)
  }
})
