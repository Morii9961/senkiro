import { expect, it } from 'vitest'
import { defaultUrlState, parseUrl, serializeUrl, type UrlState } from '../src/state/url'

it('AT-URL-01: round trips the shareable state and leaves defaults out of a link', () => {
  const state: UrlState = {
    site: 'sk:context:hankyu',
    floor: 2,
    mode: '2d',
    detail: 'structure',
    selection: { kind: 'platform', id: 'sk:platform:hk-3' },
    from: 'sk:concourse:jr-midosuji-in',
    to: 'sk:platform:hk-3',
    stepFreeOnly: true,
    step: 1,
    lang: 'en',
    theme: 'dark',
    feed: 'demo',
  }
  expect(serializeUrl(defaultUrlState).toString()).toBe('')
  expect(parseUrl(serializeUrl(state))).toEqual(state)
  expect(parseUrl(new URLSearchParams('detail=facility&feed=live')).feed).toBe('live')
})

it('ignores unknown parameters and falls back for invalid IDs, enums and indices', () => {
  expect(parseUrl(new URLSearchParams(
    'site=unknown&floor=900&mode=4d&detail=more&sel=gate:sk:platform:hk-3' +
    '&from=unknown&to=unknown&sf=2&step=1e1&lang=zh&theme=sepia&feed=other&other=42',
  ))).toEqual(defaultUrlState)
  expect(parseUrl(new URLSearchParams('floor=0')).floor).toBe(0)
  expect(parseUrl(new URLSearchParams('step=0')).step).toBe(0)
  expect(parseUrl(new URLSearchParams('site=sk:context:hankyu&floor=-2')).floor).toBeNull()
  expect(serializeUrl(defaultUrlState, new URLSearchParams('lang=en&debug=labels')).toString())
    .toBe('debug=labels')
})
