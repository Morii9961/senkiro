import { expect, it } from 'vitest'
import { lineStyles, type LineStyle } from '../data/manual/lines'
import { sources } from '../data/manual/sources'
import { contrastRatio, lineBadgeTextColor, validateLineStyles } from '../src/domain/lines'
import { station } from '../src/model'

const sourcesById = new Set(sources.map((source) => source.id))
const sample: LineStyle = {
  lineId: 'sk:line:kobe',
  color: { hex: '#757575', sourceIds: ['test-color-source'], dataNature: 'manual-verified' },
  kind: 'jr', shortName: null, stationNumberPrefix: null,
}

it('AT-LINE-01: checks known IDs, duplicates, six-digit color and registered sources', () => {
  expect(() => validateLineStyles(station, lineStyles, sourcesById)).not.toThrow()
  const validate = (entries: LineStyle[]) =>
    validateLineStyles(station, entries, new Set(['test-color-source']))
  expect(() => validate([sample])).not.toThrow()
  expect(() => validate([sample, sample])).toThrow(/duplicate/i)
  expect(() => validate([{ ...sample, lineId: 'sk:line:unknown' }])).toThrow(/unknown line/i)
  expect(() => validate([{ ...sample, color: { ...sample.color!, hex: '#xyz' } }])).toThrow(/color/i)
  expect(() => validate([{ ...sample, color: { ...sample.color!, sourceIds: [] } }])).toThrow(/source/i)
  expect(() => validate([{ ...sample, color: { ...sample.color!, sourceIds: ['missing'] } }])).toThrow(/source/i)
})

it('AT-LINE-03: chooses readable foreground for sourced colors and contrast boundaries', () => {
  const fixtureColors = ['#000000', '#FFFFFF', '#757575', '#767676', '#00AA88', '#D60000']
  const colors = [
    ...fixtureColors,
    ...lineStyles.flatMap((entry) => entry.color?.hex ?? []),
  ]
  for (const color of colors) {
    expect(contrastRatio(color, lineBadgeTextColor(color))).toBeGreaterThanOrEqual(4.5)
  }
})

it('AT-HON-01: covers current lines and keeps their unverified fields null under G3', () => {
  expect(lineStyles.map((entry) => entry.lineId).sort()).toEqual(
    station.lines.map((line) => line.id).sort(),
  )
  expect(lineStyles.every((entry) =>
    entry.color === null && entry.stationNumberPrefix === null && entry.shortName === null,
  )).toBe(true)
})
