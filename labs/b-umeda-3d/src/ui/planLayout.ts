import type { Link, Place } from '../domain/types'

type Bounds = { minX: number; minY: number; maxX: number; maxY: number }
export type PlanBlock = { id: string; places: Place[]; bounds: Bounds }
export type PlanPanel = { block: PlanBlock; width: number; height: number }

export const panelGap = 10
const panelChrome = 52
const drawingPad = 30
const maxScale = 24
const joinGap = 4 // Schematic units used only for grouping the drawing.

export function floorPlanBlocks(places: Place[], links: Link[]) {
  const parents = new Map(places.map(({ id }) => [id, id]))
  function find(id: string): string {
    const parent = parents.get(id)!
    if (parent === id) return id
    const root = find(parent)
    parents.set(id, root)
    return root
  }
  for (const { from, to, connection } of links) {
    if (connection === 'verified' && parents.has(from) && parents.has(to)) parents.set(find(to), find(from))
  }
  for (const [index, a] of places.entries()) {
    for (const b of places.slice(0, index)) {
      const dx = Math.max(0, Math.abs(a.point[0] - b.point[0]) - (a.size[0] + b.size[0]) / 2)
      const dz = Math.max(0, Math.abs(a.point[1] - b.point[1]) - (a.size[1] + b.size[1]) / 2)
      if (Math.hypot(dx, dz) <= joinGap) parents.set(find(b.id), find(a.id))
    }
  }
  const groups = new Map<string, Place[]>()
  for (const place of places) {
    const root = find(place.id)
    const group = groups.get(root) ?? []
    group.push(place)
    groups.set(root, group)
  }
  const blocks = [...groups.values()].map((group) => ({
    id: group[0].id,
    places: group,
    bounds: {
      minX: Math.min(...group.map(({ point, size }) => point[0] - size[0] / 2)),
      maxX: Math.max(...group.map(({ point, size }) => point[0] + size[0] / 2)),
      minY: Math.min(...group.map(({ point, size }) => point[1] - size[1] / 2)),
      maxY: Math.max(...group.map(({ point, size }) => point[1] + size[1] / 2)),
    },
  }))
  const main = blocks.reduce<PlanBlock | undefined>((best, block) =>
    !best || best.places.length < block.places.length ? block : best, undefined)
  const rotate = !!main && depthOf(main) > widthOf(main)
  if (rotate) {
    for (const block of blocks) {
      const { minX, minY, maxX, maxY } = block.bounds
      block.bounds = { minX: minY, minY: -maxX, maxX: maxY, maxY: -minX }
    }
  }
  blocks.sort((a, b) => a.bounds.minX - b.bounds.minX || a.bounds.minY - b.bounds.minY)
  return { blocks, rotate }
}

const widthOf = ({ bounds }: PlanBlock) => bounds.maxX - bounds.minX
const depthOf = ({ bounds }: PlanBlock) => bounds.maxY - bounds.minY

export function fitPlanBlocks(blocks: PlanBlock[], viewport: { width: number; height: number }) {
  const { width, height } = viewport
  if (!blocks.length) return { columns: [], scale: 1 }
  if (blocks.length === 1) {
    const block = blocks[0]
    const drawingHeight = Math.max(100, height - panelChrome)
    const scale = Math.max(0.5, Math.min(maxScale, (width - drawingPad) / widthOf(block),
      (drawingHeight - drawingPad) / depthOf(block)))
    return { columns: [[{ block, width, height: drawingHeight }]], scale }
  }

  function place(scale: number) {
    const panels = blocks.map((block) => ({
      block,
      width: Math.max(158, widthOf(block) * scale + drawingPad),
      height: Math.max(92, depthOf(block) * scale + drawingPad),
    }))
    // Partition neighboring blocks into columns. Find the narrowest valid partition at this scale.
    const widths = [0]
    const starts = [0]
    for (let end = 1; end <= panels.length; end++) {
      let best = Infinity
      let columnWidth = 0
      let columnHeight = 0
      for (let start = end - 1; start >= 0; start--) {
        const panel = panels[start]
        columnWidth = Math.max(columnWidth, panel.width)
        columnHeight += panel.height + panelChrome + (start === end - 1 ? 0 : panelGap)
        if (columnHeight > height) break
        const needed = widths[start] + (start ? panelGap : 0) + columnWidth
        if (needed < best) {
          best = needed
          starts[end] = start
        }
      }
      widths[end] = best
    }
    if (widths[panels.length] > width) return null
    const columns: PlanPanel[][] = []
    for (let end = panels.length; end > 0; end = starts[end]) {
      const column = panels.slice(starts[end], end)
      const sharedWidth = Math.max(...column.map((panel) => panel.width))
      columns.unshift(column.map((panel) => ({ ...panel, width: sharedWidth })))
    }
    return columns
  }

  let low = 0
  let high = maxScale
  let columns = place(0)
  if (!columns) {
    // A shorter viewport may scroll. Keep the same scale for every block there as well.
    const scale = Math.max(0.5, Math.min(8, (width - drawingPad) / Math.max(...blocks.map(widthOf))))
    return { columns: [blocks.map((block) => ({ block, width, height: Math.max(92, depthOf(block) * scale + drawingPad) }))], scale }
  }
  for (let step = 0; step < 16; step++) {
    const mid = (low + high) / 2
    const fit = place(mid)
    if (fit) {
      low = mid
      columns = fit
    } else high = mid
  }
  return { columns, scale: low }
}
