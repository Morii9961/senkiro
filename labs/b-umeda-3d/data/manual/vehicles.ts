import type { Entity } from '../../src/domain/types.ts'

export interface VehicleSeries {
  id: string
  operatorId: string
  names: Entity['names']
  category: 'commuter' | 'rapid' | 'limited-express' | 'subway' | 'other' | null
  livery: { body: string; accent: string; stripe: string | null; nature: 'schematic' }
  proportions: { carLengthToWidth: number; carCountDefault: number | null }
  formations: { cars: number; sourceIds: string[] }[]
  provenance: Entity['provenance']
}

export interface VehicleAssignment {
  lineId: string
  seriesId: string | null
  status: 'verified' | 'representative' | 'unknown'
  sourceIds: string[]
}

function series(operator: string, id: string, label: string, category: VehicleSeries['category'], design: {
  ratio: number; colors: [string, string, string]; sources: string[]; formation?: [number, string]
}): VehicleSeries {
  const [body, accent, stripe] = design.colors
  const sources = design.sources.map((id) => 'sk:source:' + id)
  const formations = design.formation
    ? [{ cars: design.formation[0], sourceIds: ['sk:source:' + design.formation[1]] }] : []
  return {
    id: 'sk:vehicle:' + id,
    operatorId: 'sk:operator:' + operator,
    names: { ja: label + '系', en: label + ' series', ja_kana: null, zh: null },
    category,
    // Original display palettes and ratios have no operating or trademark meaning.
    livery: { body, accent, stripe, nature: 'schematic' },
    proportions: { carLengthToWidth: design.ratio, carCountDefault: null },
    formations,
    provenance: { sourceIds: sources, dataNature: 'manual-verified', lastVerifiedAt: '2026-11-23' },
  }
}

const loop = series('jr-west', 'jr-323', '323', 'commuter', {
  ratio: 5.9, colors: ['#b5a68c', '#4b493b', '#d7ca9e'],
  sources: ['jr-vehicle-323'], formation: [8, 'jr-vehicle-323'],
})
const rapid = series('jr-west', 'jr-225', '225', 'rapid', {
  ratio: 6.25, colors: ['#889caa', '#24385b', '#d9a664'],
  sources: ['jr-vehicle-225', 'jr-vehicle-formations'], formation: [8, 'jr-vehicle-formations'],
})
const east = series('jr-west', 'jr-221', '221', 'commuter', {
  ratio: 5.75, colors: ['#ccc7a9', '#486861', '#6b7983'], sources: ['jr-vehicle-225'],
})
const midosuji = series('osaka-metro', 'metro-30000', '30000', 'subway', {
  ratio: 5.55, colors: ['#b4a5c0', '#473c5d', '#d3cb94'], sources: ['metro-vehicle-30000'],
})
const tanimachi = series('osaka-metro', 'metro-32', '32', 'subway', {
  ratio: 5.7, colors: ['#c6b69e', '#54473b', '#7698a0'], sources: ['metro-vehicle-30000'],
})
const yotsubashi = series('osaka-metro', 'metro-23', '23', 'subway', {
  ratio: 5.65, colors: ['#a8b4a2', '#364833', '#b99478'], sources: ['metro-vehicle-23'],
})
const hankyuKyoto = series('hankyu', 'hankyu-9300', '9300', 'limited-express', {
  ratio: 6.75, colors: ['#597e80', '#254346', '#d2c498'],
  sources: ['hankyu-vehicle-9300', 'hankyu-vehicle-express', 'hankyu-vehicle-9300-set'],
  formation: [8, 'hankyu-vehicle-9300-set'],
})
const hankyu = series('hankyu', 'hankyu-1000', '1000', 'commuter', {
  ratio: 6.85, colors: ['#8e8464', '#373b36', '#c2c09c'], sources: ['hankyu-vehicle-1000'],
})
const hanshin = series('hanshin', 'hanshin-5700', '5700', 'commuter', {
  ratio: 6.05, colors: ['#a9a4a9', '#514656', '#9fa782'],
  sources: ['hanshin-vehicle-5700', 'hanshin-vehicle-5700-set'], formation: [4, 'hanshin-vehicle-5700-set'],
})

export const vehicleSeries = [loop, rapid, east, midosuji, tanimachi, yotsubashi, hankyuKyoto, hankyu, hanshin]

const representative = (line: string, item: VehicleSeries): VehicleAssignment => ({
  lineId: 'sk:line:' + line, seriesId: item.id, status: 'representative', sourceIds: item.provenance.sourceIds,
})

export const vehicleAssignments: VehicleAssignment[] = [
  representative('loop', loop), representative('kyoto', rapid), representative('kobe', rapid),
  representative('east', east), representative('midosuji', midosuji), representative('tanimachi', tanimachi),
  representative('yotsubashi', yotsubashi), representative('hk-kyoto', hankyuKyoto),
  representative('hk-kobe', hankyu), representative('hk-takarazuka', hankyu), representative('hs-main', hanshin),
  { lineId: 'sk:line:jr-tozai', seriesId: null, status: 'unknown', sourceIds: [] },
]
