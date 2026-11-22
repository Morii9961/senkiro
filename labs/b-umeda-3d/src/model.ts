import { model as station } from '../data/manual/model'
import { lineStyles } from '../data/manual/lines'
export { station }
export const linesById = new Map(station.lines.map((line) => [line.id, line]))
export const lineStyleById = new Map(lineStyles.map((style) => [style.lineId, style]))
export const nodes = new Map(station.places.map((p) => [p.id, p]))
export const floors = new Map(station.levels.map((l) => [l.id, l]))
export const floorLabels = [
  ...new Map(station.levels.map((l) => [l.ordinal, l.label])).entries(),
].sort((a, b) => b[0] - a[0])
export const sites = [
  {
    id: 'sk:station:jr-osaka',
    names: { ja: 'JR 大阪駅', en: 'JR Osaka' },
    stationId: 'sk:station:jr-osaka',
    anchorId: 'sk:concourse:jr-bridge',
  },
  {
    id: 'sk:station:metro-umeda',
    names: { ja: '御堂筋線 梅田', en: 'Midosuji Umeda' },
    stationId: 'sk:station:metro-umeda',
    anchorId: 'sk:platform:metro-1',
  },
  ...station.context,
]
export function inSite(p: (typeof station.places)[number], id: string | null) {
  if (!id) return true
  const site = sites.find((s) => s.id === id)
  return site?.stationId
    ? p.stationId === site.stationId
    : id === 'sk:context:whity' && p.id.startsWith('sk:concourse:whity-')
}
