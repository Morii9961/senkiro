import { expect, it } from 'vitest'
import { layoutLabels, overlaps, type LabelCandidate } from '../src/scene/labels/layout'

const viewport = { width: 800, height: 520 }
const candidate = (key: string, x: number, y: number, extra: Partial<LabelCandidate> = {}): LabelCandidate => ({
  key, x, y, width: 56, height: 18, level: 2, priority: 0, ...extra,
})

it('AT-LBL-02 keeps higher priority labels and separates ordinary rectangles by 4 px', () => {
  const input = Array.from({ length: 30 }, (_, i) => candidate(String(i), 400, 260, { priority: i }))
  const result = layoutLabels(input.reverse(), viewport)
  expect(result[0].key).toBe('0')
  expect(result.length).toBeLessThan(30)
  for (let i = 0; i < result.length; i++) {
    for (const other of result.slice(i + 1)) expect(overlaps(result[i].rect, other.rect, 4)).toBe(false)
  }
})

it('AT-LBL-03 clamps near edges and keeps a directional marker for offscreen L0', () => {
  const result = layoutLabels([
    candidate('clamped', 30, 100),
    candidate('outside', -90, 200),
    candidate('mandatory', 950, 380, { level: 0 }),
    candidate('reserved', 400, 300),
  ], viewport, [{ x: 325, y: 220, width: 150, height: 160 }])
  expect(result.map(({ key }) => key)).not.toContain('outside')
  expect(result.map(({ key }) => key)).not.toContain('reserved')
  expect(result.find(({ key }) => key === 'clamped')?.rect.x).toBeGreaterThanOrEqual(8)
  expect(result.find(({ key }) => key === 'mandatory')?.edge).toBe(true)
})

it('AT-LBL-04 suppresses an occluded candidate while retaining L0 with an indicator', () => {
  const result = layoutLabels([
    candidate('hidden', 200, 150, { occluded: true }),
    candidate('selected', 400, 150, { level: 0, occluded: true }),
  ], viewport)
  expect(result.map(({ key, occluded }) => [key, occluded])).toEqual([['selected', true]])
})

it('AT-LBL-05 marks displaced labels with a leader and caps ordinary distance at 48 px', () => {
  const result = layoutLabels([
    candidate('blocked-above', 400, 260),
  ], viewport, [{ x: 359, y: 221, width: 62, height: 53 }])
  expect(result).toHaveLength(1)
  expect(result[0].distance).toBeGreaterThan(12)
  expect(result[0].distance).toBeLessThanOrEqual(48)
  expect(result[0].leader).toBe(true)
})

it('clusters tight groups, folds nearby equivalents and bounds the nonmandatory count', () => {
  const group = Array.from({ length: 4 }, (_, i) =>
    candidate('platform-' + i, 60 + i * 4, 100, { clusterKey: 'station', number: i + 1 }))
  const plentiful = Array.from({ length: 50 }, (_, i) =>
    candidate('label-' + i, 62 + (i % 10) * 72, 170 + Math.floor(i / 10) * 60))
  const result = layoutLabels([
    ...group, ...plentiful,
    candidate('same-first', 500, 90, { meaning: 'gate:West gate' }),
    candidate('same-second', 506, 92, { meaning: 'gate:West gate', priority: 1 }),
  ], viewport)
  expect(result.find(({ members }) => members)?.text).toBe('1–4')
  expect(result.map(({ key }) => key)).not.toContain('same-second')
  expect(result.length).toBeLessThanOrEqual(40)
})
