import { Box3, Matrix4, Vector3 } from 'three'
import { expect, it } from 'vitest'
import { isLabelOccluded, type OcclusionProxy } from '../src/scene/labels/occlusion'

const up = new Vector3(0, 1, 0)
const anchor = new Vector3(0, 2, 0)
const slab: OcclusionProxy = {
  owner: 'upper-deck', floorOrdinal: 1,
  bounds: new Box3(new Vector3(-2, 5, -2), new Vector3(2, 5.5, 2)),
}

it('AT-LBL-04: a lower label behind a deck is obstructed and an open gap is clear', () => {
  expect(isLabelOccluded(anchor, up, 20, [slab], 'platform', 0)).toBe(true)
  expect(isLabelOccluded(new Vector3(3, 2, 0), up, 20, [slab], 'platform', 0)).toBe(false)
  expect(isLabelOccluded(anchor, up, 2, [slab], 'platform', 0)).toBe(false)
})

it('ignores the label owner, same-floor slabs and an upper label', () => {
  expect(isLabelOccluded(anchor, up, 20, [slab], 'upper-deck', 0)).toBe(false)
  expect(isLabelOccluded(anchor, up, 20, [slab], 'platform', 1)).toBe(false)
  expect(isLabelOccluded(new Vector3(0, 7, 0), up, 20, [slab], 'platform', 0)).toBe(false)
})

it('tests the actual oriented roof proxy and respects the camera endpoint', () => {
  const world = new Matrix4().makeRotationX(0.2).scale(new Vector3(4, 0.15, 2))
  world.setPosition(0, 9, 0)
  const roof: OcclusionProxy = {
    owner: 'roof', floorOrdinal: null,
    bounds: new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5)),
    worldToLocal: world.clone().invert(),
  }
  expect(isLabelOccluded(anchor, up, 20, [roof], 'platform', 0)).toBe(true)
  expect(isLabelOccluded(anchor, up, 4, [roof], 'platform', 0)).toBe(false)
  expect(isLabelOccluded(new Vector3(3, 2, 0), up, 20, [roof], 'platform', 0)).toBe(false)
})
