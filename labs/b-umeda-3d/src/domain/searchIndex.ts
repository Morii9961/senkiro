import { linkTarget, placeTarget } from './index'
import type { Entity, Model, Place, RailLine } from './types'
import type { SelectionTarget } from '../state/selection'

type Names = Pick<Entity['names'], 'ja' | 'en'>

export type SearchGroup = 'station' | 'platform' | 'line' | 'access' | 'facility'

export type SearchEntry = {
  target: SelectionTarget
  group: SearchGroup
  names: Names
  station: Names | null
  stationId: string | null
  floor: { ordinal: number; label: string } | null
  zone: Place['zone'] | null
  line: RailLine | null
  endpoints: { start: string; end: string } | null
}

type Site = { id: string; names: Names; stationId: string | null; anchorId: string }

const groupRank: Record<SearchGroup, number> = { station: 0, platform: 1, line: 2, access: 3, facility: 4 }

function normalize(text: string) {
  return text.normalize('NFKC').toLowerCase().replace(/[\s・·]+/gu, '')
}

function terms(names: Partial<Entity['names']> | null | undefined) {
  return [names?.ja, names?.en, names?.ja_kana].filter((word): word is string => !!word)
}

export function createSearchIndex(model: Model, sites: Site[] = model.context) {
  const places = new Map(model.places.map((place) => [place.id, place]))
  const levels = new Map(model.levels.map((level) => [level.id, level]))
  const stations = new Map(model.stations.map((station) => [station.id, station]))
  const lines = new Map(model.lines.map((line) => [line.id, line]))
  const operators = new Map(model.operators.map((operator) => [operator.id, operator]))
  const stationSites = new Map(sites.flatMap((site) => site.stationId ? [[site.stationId, site] as const] : []))
  const entries = new Map<string, { record: SearchEntry; keys: string[]; associated: string[] }>()

  function add(record: SearchEntry, aliases: string[], associated: string[] = []) {
    entries.set(record.target.id, {
      record,
      keys: [...new Set(aliases.map(normalize).filter(Boolean))],
      associated: [...new Set(associated.map(normalize).filter(Boolean))],
    })
  }

  for (const station of model.stations) {
    const site = stationSites.get(station.id)
    const anchor = site && places.get(site.anchorId)
    add({
      target: { kind: 'station', id: station.id },
      group: 'station',
      names: site?.names ?? station.names,
      station: null,
      stationId: station.id,
      floor: anchor ? levels.get(anchor.levelId) ?? null : null,
      zone: anchor?.zone ?? null,
      line: null,
      endpoints: anchor ? { start: anchor.id, end: anchor.id } : null,
    }, [...terms(station.names), ...terms(site?.names)])
  }
  for (const site of sites) {
    if (site.stationId) continue
    const anchor = places.get(site.anchorId)
    add({
      target: { kind: 'station', id: site.id }, group: 'station', names: site.names,
      station: null, stationId: site.id, floor: anchor ? levels.get(anchor.levelId) ?? null : null,
      zone: anchor?.zone ?? null, line: null,
      endpoints: anchor ? { start: anchor.id, end: anchor.id } : null,
    }, terms(site.names))
  }

  for (const line of model.lines) {
    add({
      target: { kind: 'line', id: line.id }, group: 'line', names: line.names,
      station: null, stationId: null, floor: null, zone: null, line, endpoints: null,
    }, terms(line.names))
  }

  for (const place of model.places) {
    const target = placeTarget(place)
    if (!target) continue
    const station = place.stationId ? stations.get(place.stationId) : null
    const site = (station && stationSites.get(station.id)) ??
      (!station && place.id.startsWith('sk:concourse:whity-') ? sites.find((entry) => entry.id === 'sk:context:whity') : null)
    const stationNames = site?.names ?? station?.names ?? null
    const servedLines = (place.serviceLineIds ?? []).flatMap((lineId) => lines.get(lineId) ?? [])
    const operator = station ? operators.get(station.operatorId) : null
    const number = place.kind === 'Platform'
      ? place.boarding?.label ?? place.names.ja.match(/\d+(?:[・·]\d+)*(?=番|号)/u)?.[0]
      : null
    const aliases = terms(place.names)
    if (number) {
      aliases.push(number, number + '号', number + '番')
      const operatorShortName = operator?.names.en.replace(/\s+(?:Electric )?Railway$/iu, '')
      const prefixes = [...terms(stationNames), ...terms(operator?.names)]
      if (operatorShortName) prefixes.push(operatorShortName)
      for (const member of number.split(/[・·]/u)) {
        for (const prefix of prefixes) {
          aliases.push(prefix + member)
        }
      }
    }
    add({
      target,
      group: target.kind === 'platform' ? 'platform' : target.kind === 'entrance' ? 'access' : 'facility',
      names: place.names,
      station: stationNames,
      stationId: station?.id ?? site?.id ?? null,
      floor: levels.get(place.levelId) ?? null,
      zone: place.zone,
      line: servedLines.length === 1 ? servedLines[0] : null,
      endpoints: { start: place.id, end: place.id },
    }, aliases, [...terms(stationNames), ...servedLines.flatMap((line) => terms(line.names))])
  }

  for (const link of model.links) {
    const from = places.get(link.from)
    const to = places.get(link.to)
    if (!from || !to) continue
    const stationId = from.stationId ?? to.stationId
    const station = stationId ? stationSites.get(stationId) ?? stations.get(stationId) : null
    const target = linkTarget(link)
    add({
      target,
      group: target.kind === 'gate' ? 'access' : 'facility',
      names: link.names, station: station?.names ?? null, stationId,
      floor: levels.get(from.levelId) ?? null,
      zone: from.zone === to.zone ? from.zone : null,
      line: null,
      endpoints: link.connection === 'verified' ? { start: from.id, end: to.id } : null,
    }, terms(link.names), terms(station?.names))
  }

  return {
    get(id: string) {
      const stationId = sites.find((site) => site.id === id)?.stationId
      return entries.get(stationId ?? id)?.record
    },
    find(query: string, context: { floor?: number | null; site?: string | null } = {}) {
      const key = normalize(query)
      if (!key) return []
      const scope = context.site ? sites.find((site) => site.id === context.site)?.stationId ?? context.site : null
      return [...entries.values()].flatMap(({ record, keys, associated }) => {
        const match = keys.includes(key) ? 0
          : keys.some((term) => term.startsWith(key)) ? 1
            : [...keys, ...associated].some((term) => term.includes(key)) ? 2 : -1
        if (match < 0) return []
        const local = Number(scope !== null && record.stationId === scope)
          + Number(context.floor != null && record.floor?.ordinal === context.floor)
        return [{ record, match, local }]
      }).sort((a, b) =>
        a.match - b.match || groupRank[a.record.group] - groupRank[b.record.group] ||
        b.local - a.local || a.record.target.id.localeCompare(b.record.target.id, 'en'),
      ).map(({ record }) => record)
    },
  }
}
