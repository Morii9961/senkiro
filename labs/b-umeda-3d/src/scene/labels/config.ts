import type { UrlState } from '../../state/url'

export type ZoomBand = 'far' | 'mid' | 'near'
export type LabelDepth = UrlState['detail']

// At 1440 × 900 the all-level home view is 9.55 px per model unit.
// Two zoom steps admit platforms; five steps admit individual facilities.
export const Z1 = 10.5
export const Z2 = 19
const UP = 1.12
const DOWN = 0.88

export function nextBand(previous: ZoomBand, density: number): ZoomBand {
  if (previous === 'near') {
    if (density >= Z2 * DOWN) return 'near'
    return density < Z1 * DOWN ? 'far' : 'mid'
  }
  if (density >= Z2 * UP) return 'near'
  if (previous === 'mid') return density < Z1 * DOWN ? 'far' : 'mid'
  return density >= Z1 * UP ? 'mid' : 'far'
}

export function effectiveBand(band: ZoomBand, promote: boolean): ZoomBand {
  if (!promote || band === 'near') return band
  return band === 'far' ? 'mid' : 'near'
}

const depthCap = { guide: 2, facility: 3, structure: 4 }

export function permitsLabel(level: number, band: ZoomBand, detail: LabelDepth) {
  if (level === 0) return true
  if (level === 1) return band !== 'near'
  if (level > depthCap[detail]) return false
  return level === 2 ? band !== 'far' : band === 'near'
}
