import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { model } from '../data/manual/model.ts'
import { lineStyles } from '../data/manual/lines.ts'
import { exits } from '../data/manual/exits.ts'
import { services } from '../data/manual/services.ts'
import { sources } from '../data/manual/sources.ts'
import { entities, validate } from '../src/domain/graph.ts'
import { validateLineStyles } from '../src/domain/lines.ts'
import { validatePassengerData } from '../src/domain/passengerData.ts'
import { deriveTrackPaths, validateTrackPaths } from '../src/trains/trackPaths.ts'
import { vehicleAssignments, vehicleSeries } from '../data/manual/vehicles.ts'
import { validateVehicles } from '../src/trains/vehicles.ts'
import { sample } from '../src/providers/service.ts'
const byId = new Map(sources.map((s) => [s.id, s]))
const sourceIds = new Set(byId.keys())
validate(model, sourceIds)
validateLineStyles(model, lineStyles, sourceIds)
validatePassengerData(model, services, exits, sourceIds)
const tracks = deriveTrackPaths(model)
validateTrackPaths(model, tracks)
validateVehicles(model, vehicleSeries, vehicleAssignments, sourceIds)
function output(path: string, value: string) {
  const contents = value + '\n'
  if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8').replaceAll('\r\n', '\n') !== contents)
      throw Error('Stale ' + path + ' — run npm run data:build')
  } else writeFileSync(path, contents)
}
mkdirSync('data/processed', { recursive: true })
output('data/processed/station.json', JSON.stringify(model, null, 2))
output('data/processed/line-styles.json', JSON.stringify(lineStyles, null, 2))
output('data/processed/services.json', JSON.stringify(services, null, 2))
output('data/processed/exits.json', JSON.stringify(exits, null, 2))
output('data/processed/vehicle-series.json', JSON.stringify(vehicleSeries, null, 2))
output('data/processed/vehicle-assignments.json', JSON.stringify(vehicleAssignments, null, 2))
output('data/sources.json', JSON.stringify(sources, null, 2))
const records = sources
  .map((s) =>
    [
      '### ' + s.id,
      '',
      s.title + ' · ' + s.publisher,
      '',
      s.url ? '[原文](' + s.url + ')' : '本项目自制。',
      '',
      '资料日期 ' +
        (s.sourceDate ?? '未知') +
        '，读取日期 ' +
        s.retrievedAt +
        '。' +
        s.notes,
      '',
      s.license +
        '。商业使用 ' +
        s.commercialUse +
        '，原件再分发 ' +
        s.redistribution +
        '，相同方式共享 ' +
        s.shareAlike +
        '。' +
        (s.licenseUrl ? ' [条款](' + s.licenseUrl + ')' : ''),
      '',
      '署名 ' + s.attributionText,
    ].join('\n'),
  )
  .join('\n\n')
const rows = [...entities(model), sample].map(
  (e) =>
    '| ' +
    [
      e.id,
      e.names.ja,
      e.provenance.sourceIds
        .map((id) => id + ' (' + (byId.get(id)?.sourceDate ?? '未知') + ')')
        .join('<br>'),
      e.geometry_confidence,
    ].join(' | ') +
    ' |',
)
output(
  'SOURCES.md',
  [
    '# 资料与元素来源核对表',
    '',
    'AI 对照运营商和大阪市公开资料录入；无实地或人工复核。资料日期、读取日期和业务有效期分别保存。手绘坐标与尺寸仅用于示意；原图未随项目分发。所有 UI 字体使用本机字体，无底图。',
    '',
    records,
    '',
    '## 元素来源核对表',
    '',
    '| 元素 ID | 名称 | 依据资料（资料日期） | geometry_confidence |',
    '|---|---|---|---|',
    ...rows,
  ].join('\n'),
)
console.log(
  model.places.length +
    ' nodes, ' +
    model.links.length +
    ' links, ' +
    lineStyles.length +
    ' line styles, ' + services.length + ' platform services, ' + exits.length + ' exit records, ' +
    tracks.length + ' track paths, ' + vehicleSeries.length + ' vehicle series; sources validated',
)
