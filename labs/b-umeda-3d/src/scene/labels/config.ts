export type ZoomBand = 'far' | 'mid' | 'near'

// Relative to the fitted view so the overview stays quiet on large displays.
export const Z1 = 1.12
export const Z2 = 1.8
const UP = 1.12
const DOWN = 0.88

export function nextBand(previous: ZoomBand, zoom: number): ZoomBand {
  if (previous === 'near') {
    if (zoom >= Z2 * DOWN) return 'near'
    return zoom < Z1 * DOWN ? 'far' : 'mid'
  }
  if (zoom >= Z2 * UP) return 'near'
  if (previous === 'mid') return zoom < Z1 * DOWN ? 'far' : 'mid'
  return zoom >= Z1 * UP ? 'mid' : 'far'
}

export function permitsLabel(level: number, band: ZoomBand, lineSummary = false) {
  if (level === 0) return true
  if (level === 1) return band !== 'near'
  return lineSummary ? band === 'mid' : band === 'near'
}
