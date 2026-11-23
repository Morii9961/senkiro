import { expect, it } from 'vitest'
import { planRoute } from '../src/domain/graph'
import { routeBands } from '../src/scene/route3d'
import { floors, station } from '../src/model'

it('AT-NAV-06: the full route joins only the ordered graph endpoints and keeps the lift columns vertical', () => {
  const plan = planRoute(station, 'sk:concourse:jr-midosuji-in', 'sk:platform:metro-1')
  if ('reason' in plan) throw new Error('The documented route must be available')
  const ordinal = ({ levelId }: { levelId: string }) => floors.get(levelId)!.ordinal
  const bands = routeBands(plan.steps, { ordinal, visible: () => true, gap: 5, active: 3 })
  expect(bands.map(({ linkId }) => linkId)).toEqual(plan.steps.map(({ link }) => link.id))
  for (const [index, band] of bands.entries()) {
    const { from, to } = plan.steps[index]
    expect(band.points[0]).toEqual([from.point[0], ordinal(from) * 5 + 0.56, from.point[1]])
    expect(band.points.at(-1)).toEqual([to.point[0], ordinal(to) * 5 + 0.56, to.point[1]])
    if (index > 0) expect(band.points[0]).toEqual(bands[index - 1].points.at(-1))
    if (ordinal(from) !== ordinal(to)) {
      const [a, b] = band.points.slice(1, 3)
      expect([a[0], a[2]]).toEqual([b[0], b[2]])
      expect(a[1]).not.toBe(b[1])
    }
  }
  expect(bands[3]).toMatchObject({ width: 0.51, active: true })
  expect(bands[0]).toMatchObject({ width: 0.34, active: false })
  expect(bands[7].dimmed).toBe(true)
})
