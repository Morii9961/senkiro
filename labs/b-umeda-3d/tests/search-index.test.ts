import { expect, it } from 'vitest'
import { createSearchIndex } from '../src/domain/searchIndex'
import { sites, station } from '../src/model'

it('AT-SRCH-01: finds full-width, spaced and Japanese platform aliases', () => {
  const index = createSearchIndex(station, sites)
  for (const query of ['阪急3', '阪急 3', 'hankyu 3', '３号', 'ＨＡＮＫＹＵ　３']) {
    expect(index.find(query).some(({ target }) => target.id === 'sk:platform:hk-3')).toBe(true)
  }
  for (const query of ['３・４', '3·4', '3 4']) {
    expect(index.find(query).some(({ target }) => target.id === 'sk:platform:jr-3-4')).toBe(true)
  }
  expect(index.find('不存在的站')).toEqual([])
})

it('AT-SRCH-05: exact, prefix and substring outrank local context, with stable type precedence', () => {
  const names = (value: string) => ({ ja: value, en: value, ja_kana: null, zh: null })
  const model = {
    ...station,
    stations: [{ ...station.stations[0], names: names('Test') }],
    lines: [{ ...station.lines[0], names: names('Test') }],
    places: [
      { ...station.places.find(({ id }) => id === 'sk:platform:jr-3-4')!, names: names('Test') },
      { ...station.places.find(({ id }) => id === 'sk:entrance:midosuji-south')!, names: names('Test') },
      { ...station.places.find(({ id }) => id === 'sk:concourse:jr-midosuji-in')!, names: names('Test') },
      { ...station.places.find(({ id }) => id === 'sk:platform:jr-5-6')!, names: names('Test platform') },
      { ...station.places.find(({ id }) => id === 'sk:platform:jr-7-8')!, names: names('A test platform') },
    ],
    links: [],
    context: [],
  }
  expect(createSearchIndex(model).find('test').map(({ target }) => target.id)).toEqual([
    model.stations[0].id, 'sk:platform:jr-3-4', model.lines[0].id,
    'sk:entrance:midosuji-south', 'sk:concourse:jr-midosuji-in', 'sk:platform:jr-5-6', 'sk:platform:jr-7-8',
  ])
})
