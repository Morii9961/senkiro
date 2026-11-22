import type { LineStyle } from '../../data/manual/lines.ts'
import type { Language, Model } from './types.ts'

export function validateLineStyles(model: Model, entries: LineStyle[], sources: Set<string>) {
  const known = new Set(model.lines.map((line) => line.id))
  const seen = new Set<string>()
  for (const { lineId, color } of entries) {
    if (!known.has(lineId)) throw new Error('Unknown line ' + lineId)
    if (seen.has(lineId)) throw new Error('Duplicate line style ' + lineId)
    seen.add(lineId)
    if (!color) continue
    if (!/^#[0-9a-f]{6}$/i.test(color.hex)) throw new Error('Invalid line color ' + lineId)
    if (!color.sourceIds.length || !color.sourceIds.every((id) => sources.has(id))) {
      throw new Error('Missing or unregistered line color source ' + lineId)
    }
  }
}

function luminance(hex: string) {
  const rgb = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
  const linear = rgb.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

export function contrastRatio(a: string, b: string) {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

export function lineBadgeTextColor(background: string) {
  return contrastRatio(background, '#000000') >= contrastRatio(background, '#ffffff')
    ? '#000000'
    : '#ffffff'
}

export function unverifiedLineColor(lang: Language) {
  return lang === 'ja' ? '線色未確認' : 'Line color unverified'
}
