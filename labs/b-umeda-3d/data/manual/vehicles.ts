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
    names: { ja: label + '系', en: label + ' series', ja_kana: null, zh: label + ' 系' },
    category,
    // Approximate exterior paint and display proportions, independent of line badge colors.
    livery: { body, accent, stripe, nature: 'schematic' },
    proportions: { carLengthToWidth: design.ratio, carCountDefault: null },
    formations,
    provenance: { sourceIds: sources, dataNature: 'manual-verified', lastVerifiedAt: '2026-11-23' },
  }
}

const loop = series('jr-west', 'jr-323', '323', 'commuter', {
  ratio: 5.9, colors: ['#b6b9bb', '#717474', '#d55a22'],
  sources: ['jr-vehicle-323', 'jr-vehicle-323-design'], formation: [8, 'jr-vehicle-323'],
})
const rapid = series('jr-west', 'jr-225', '225', 'rapid', {
  ratio: 6.25, colors: ['#b0b3b7', '#656b70', '#607d91'],
  sources: ['jr-vehicle-225', 'jr-vehicle-formations', 'jr-vehicle-exterior'], formation: [8, 'jr-vehicle-formations'],
})
const east = series('jr-west', 'jr-221', '221', 'commuter', {
  ratio: 5.75, colors: ['#e8e2d7', '#747575', '#416b86'], sources: ['jr-vehicle-225', 'jr-vehicle-exterior'],
})
const commuter = series('jr-west', 'jr-321', '321', 'commuter', {
  ratio: 6.25, colors: ['#c0c2c4', '#727778', '#003c73'],
  sources: ['jr-vehicle-service', 'jr-vehicle-321-design'],
})
const midosuji = series('osaka-metro', 'metro-30000', '30000', 'subway', {
  ratio: 5.55, colors: ['#c2c6cc', '#757b84', '#bb2635'],
  sources: ['metro-vehicle-30000', 'metro-vehicle-30000-exterior', 'metro-vehicle-guide'],
})
const tanimachi = series('osaka-metro', 'metro-32', '32', 'subway', {
  ratio: 5.55, colors: ['#c2c6cc', '#757b84', '#763e80'], sources: ['metro-vehicle-30000', 'metro-vehicle-guide'],
})
const yotsubashi = series('osaka-metro', 'metro-23', '23', 'subway', {
  ratio: 5.65, colors: ['#b4b9be', '#6a7078', '#326faa'], sources: ['metro-vehicle-23', 'metro-vehicle-guide'],
})
const hankyuKyoto = series('hankyu', 'hankyu-9300', '9300', 'limited-express', {
  ratio: 6.75, colors: ['#4c1823', '#bcb9ad', '#ede2c8'],
  sources: ['hankyu-vehicle-9300', 'hankyu-vehicle-express', 'hankyu-vehicle-9300-set'],
  formation: [8, 'hankyu-vehicle-9300-set'],
})
const hankyu = series('hankyu', 'hankyu-1000', '1000', 'commuter', {
  ratio: 6.85, colors: ['#4c1823', '#bcb9ad', '#ede2c8'], sources: ['hankyu-vehicle-1000'],
})
const hanshin = series('hanshin', 'hanshin-5700', '5700', 'commuter', {
  ratio: 6.05, colors: ['#bbc1c5', '#6e7479', '#3e91b7'],
  sources: ['hanshin-vehicle-5700', 'hanshin-vehicle-5700-set', 'hanshin-vehicle-5700-design'],
  formation: [4, 'hanshin-vehicle-5700-set'],
})

export const vehicleSeries = [loop, rapid, east, commuter, midosuji, tanimachi, yotsubashi, hankyuKyoto, hankyu, hanshin]

const representative = (line: string, item: VehicleSeries): VehicleAssignment => ({
  lineId: 'sk:line:' + line, seriesId: item.id, status: 'representative', sourceIds: item.provenance.sourceIds,
})

export const vehicleAssignments: VehicleAssignment[] = [
  representative('loop', loop), representative('kyoto', rapid), representative('kobe', rapid),
  representative('east', east), representative('midosuji', midosuji), representative('tanimachi', tanimachi),
  representative('yotsubashi', yotsubashi), representative('hk-kyoto', hankyuKyoto),
  representative('hk-kobe', hankyu), representative('hk-takarazuka', hankyu), representative('hs-main', hanshin),
  representative('jr-tozai', commuter), representative('takarazuka', commuter),
  { ...representative('yumesaki', loop), sourceIds: ['sk:source:jr-vehicle-service'] },
  { ...representative('yamatoji', east), sourceIds: ['sk:source:jr-vehicle-service'] },
  ...['hanwa', 'kansai-airport', 'bantan', 'tokaido-express'].map((lineId): VehicleAssignment =>
    ({ lineId: 'sk:line:' + lineId, seriesId: null, status: 'unknown', sourceIds: [] })),
]
