import type { SelectionTarget } from '../state/selection'
import { cost, nextPlaceId, route, vertical } from './graph'
import type { Entity, Level, Link, Model, Operator, Place, RailLine, Station } from './types'

export interface PlatformDirection {
  id: string
  towards: { ja: string; en: string | null } | null
  bound: 'up' | 'down' | 'inner' | 'outer' | 'other' | null
  terminusStationName: { ja: string; en: string | null } | null
  neighborStationName: { ja: string; en: string | null } | null
  sourceIds: string[]
}

export interface PlatformService {
  platformId: string
  lineId: string
  directions: PlatformDirection[] | null
  track: { sides: (-1 | 1)[]; terminalEnd?: -1 | 1 } | null
  provenance: Entity['provenance']
}

export interface ExitInfo {
  placeId: string
  exitLabel: { ja: string; en: string | null } | null
  surfaceNote: { ja: string; en: string | null } | null
  provenance: Entity['provenance']
}

export interface GateView {
  gate: Link
  insideSide: Place
  outsideSide: Place
  operatorsAcross: [Operator | null, Operator | null]
  servedPlatforms: Place[]
  facilitiesOutside: Place[]
  stepFree: boolean | null
}

export interface PlatformView {
  platform: Place
  station: Station
  operator: Operator
  lines: RailLine[]
  services: PlatformService[]
  nearestGates: Link[]
  nearestVerticals: Link[]
  transfers: {
    toPlatformId: string
    gates: number
    levelChanges: number
    stepFreeKnown: boolean | null
  }[]
}

export interface ExitView {
  entrance: Place
  info: ExitInfo | null
  nearestArea: Place | null
  reachableLines: RailLine[]
}

export interface VerticalView {
  link: Link
  fromLevel: Level
  toLevel: Level
  servedPlatforms: Place[]
  operatingDirection: Link['direction']
}

export interface FacilityIndex {
  place(id: string): Place | undefined
  link(id: string): Link | undefined
  levelOf(id: string): { ordinal: number; label: string } | undefined
  stationOf(id: string): Station | undefined
  linesAtPlace(id: string): RailLine[]
  linksAt(id: string): Link[]
  gateView(id: string): GateView
  exitView(id: string): ExitView
  platformView(id: string): PlatformView
  verticalView(id: string): VerticalView
  ownersOf(target: SelectionTarget): Set<string>
  relatedTargets(target: SelectionTarget): SelectionTarget[]
}

const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((item) => [item.id, item]))

const placeKinds = {
  Platform: 'platform', Entrance: 'entrance', Concourse: 'concourse', Landing: null,
} as const

export function placeTarget(place: Place): SelectionTarget | null {
  const kind = placeKinds[place.kind]
  return kind ? { kind, id: place.id } : null
}

export function linkTarget(link: Link): SelectionTarget {
  return {
    kind: link.kind === 'Gate' ? 'gate' : link.kind === 'Passage' ? 'passage' : 'vertical',
    id: link.id,
  }
}

export function ownersOf(model: Model, target: SelectionTarget): Set<string> {
  if (target.kind === 'line') {
    return new Set(
      model.places
        .filter((place) => place.kind === 'Platform' && place.serviceLineIds?.includes(target.id))
        .map((place) => place.id),
    )
  }
  if (target.kind !== 'station') return new Set([target.id])

  const context = model.context.find((site) => site.id === target.id)
  const stationId = context ? context.stationId : target.id
  // Arcades use their site slug in the concourse IDs, as in the district model.
  const arcadePrefix = 'sk:concourse:' + target.id.split(':').at(-1) + '-'
  const places = new Set(
    model.places
      .filter((place) => stationId
        ? place.stationId === stationId
        : place.id === context?.anchorId || place.id.startsWith(arcadePrefix))
      .map((place) => place.id),
  )
  const owners = new Set(places)
  for (const link of model.links) {
    if (places.has(link.from) || places.has(link.to)) owners.add(link.id)
  }
  return owners
}

export function createFacilityIndex(
  model: Model,
  { services = [], exits = [] }: { services?: PlatformService[]; exits?: ExitInfo[] } = {},
): FacilityIndex {
  const places = byId(model.places)
  const links = byId(model.links)
  const stations = byId(model.stations)
  const levels = byId(model.levels)
  const operators = byId(model.operators)
  const lines = byId(model.lines)
  const platforms = model.places.filter((place) => place.kind === 'Platform')
  const adjacency = new Map(model.places.map((place) => [place.id, [] as Link[]]))
  for (const link of model.links) {
    adjacency.get(link.from)?.push(link)
    if (link.to !== link.from) adjacency.get(link.to)?.push(link)
  }

  const linksAt = (id: string) => adjacency.get(id)?.slice() ?? []
  const linesAtPlace = (id: string) => (places.get(id)?.serviceLineIds ?? [])
    .flatMap((lineId) => lines.get(lineId) ?? [])

  function endpointsOf(id: string) {
    const place = places.get(id)
    if (place) return [place]
    const link = links.get(id)
    return link ? [places.get(link.from)!, places.get(link.to)!] : []
  }

  function levelOf(id: string) {
    const actual = endpointsOf(id).map((place) => levels.get(place.levelId)!)
    const level = actual[0]
    if (level && actual.every((other) => other.ordinal === level.ordinal)) {
      return { ordinal: level.ordinal, label: level.label }
    }
  }

  function stationOf(id: string) {
    const ends = endpointsOf(id)
    const relevant = links.get(id)?.kind === 'Gate' ? ends.filter((place) => place.zone === 'paid') : ends
    const ids = new Set(relevant.flatMap((place) => place.stationId ?? []))
    if (ids.size === 1) return stations.get([...ids][0])
  }

  // Traversal order measures graph hops. It does not measure physical proximity.
  function walk(starts: Place[], maxHops: number, crossGates: boolean) {
    const queue = starts.map((place) => ({ place, hops: 0 }))
    const visited = new Set(starts.map((place) => place.id))
    const traversed = new Set<Link>()
    for (let i = 0; i < queue.length; i++) {
      const { place, hops } = queue[i]
      if (hops === maxHops) continue
      for (const link of adjacency.get(place.id) ?? []) {
        if (!crossGates && link.kind === 'Gate') continue
        const next = nextPlaceId(link, place.id)
        if (!next) continue
        traversed.add(link)
        if (visited.has(next)) continue
        visited.add(next)
        queue.push({ place: places.get(next)!, hops: hops + 1 })
      }
    }
    return { places: queue.map(({ place }) => place), links: [...traversed] }
  }

  function gateView(id: string): GateView {
    const gate = links.get(id)
    if (gate?.kind !== 'Gate') throw new Error('Unknown gate ' + id)
    const [from, to] = endpointsOf(id)
    const [insideSide, outsideSide] = from.zone === 'paid' ? [from, to] : [to, from]
    const operatorOf = (place: Place) =>
      operators.get(stations.get(place.stationId ?? '')?.operatorId ?? '') ?? null
    return {
      gate, insideSide, outsideSide,
      operatorsAcross: [operatorOf(insideSide), operatorOf(outsideSide)],
      servedPlatforms: walk([insideSide], Infinity, false).places.filter((place) => place.kind === 'Platform'),
      facilitiesOutside: walk([outsideSide], 2, false).places.slice(1)
        .filter((place) => place.kind === 'Entrance' || place.kind === 'Concourse'),
      stepFree: gate.stepFree,
    }
  }

  function platformView(id: string): PlatformView {
    const platform = places.get(id)
    const station = stationOf(id)
    if (platform?.kind !== 'Platform' || !station) throw new Error('Unknown platform ' + id)
    const nearby = walk([platform], 2, true).links
    const lineIds = new Set(platform.serviceLineIds)
    const transfers = !lineIds.size || !model.complex.stationIds.includes(station.id) ? []
      : platforms.flatMap((other) => {
          if (other.id === id || !model.complex.stationIds.includes(other.stationId ?? '') ||
            !other.serviceLineIds?.some((lineId) => !lineIds.has(lineId))) return []
          const path = route(model, id, other.id)
          if (!path) return []
          const { gates, changes, segments } = cost(path)
          const unknown = path.some(({ link }) => link.stepFree === null)
          const blocked = path.some(({ link }) => link.stepFree === false)
          return [{
            toPlatformId: other.id, gates, levelChanges: changes, segments,
            stepFreeKnown: blocked ? false : unknown ? null : true,
          }]
        }).sort((a, b) => a.gates - b.gates || a.levelChanges - b.levelChanges || a.segments - b.segments)
          .slice(0, 8)
          .map(({ toPlatformId, gates, levelChanges, stepFreeKnown }) =>
            ({ toPlatformId, gates, levelChanges, stepFreeKnown }))
    return {
      platform, station, transfers,
      operator: operators.get(station.operatorId)!,
      lines: linesAtPlace(id),
      services: services.filter((service) => service.platformId === id),
      nearestGates: nearby.filter((link) => link.kind === 'Gate'),
      nearestVerticals: nearby.filter(vertical),
    }
  }

  function exitView(id: string): ExitView {
    const entrance = places.get(id)
    if (entrance?.kind !== 'Entrance') throw new Error('Unknown entrance ' + id)
    let fewestGates = Infinity
    const reachable = new Set<RailLine>()
    for (const platform of platforms) {
      const platformLines = linesAtPlace(platform.id)
      if (!platformLines.length) continue
      const path = route(model, id, platform.id)
      if (!path) continue
      const { gates } = cost(path)
      if (gates > fewestGates) continue
      if (gates < fewestGates) reachable.clear()
      fewestGates = gates
      for (const line of platformLines) reachable.add(line)
    }
    return {
      entrance,
      info: exits.find((entry) => entry.placeId === id) ?? null,
      nearestArea: walk([entrance], Infinity, false).places.find((place) => place.kind === 'Concourse') ?? null,
      reachableLines: [...reachable],
    }
  }

  function verticalView(id: string): VerticalView {
    const link = links.get(id)
    if (!link || !vertical(link)) throw new Error('Unknown vertical facility ' + id)
    const ends = endpointsOf(id)
    return {
      link,
      fromLevel: levels.get(ends[0].levelId)!,
      toLevel: levels.get(ends[1].levelId)!,
      servedPlatforms: walk(ends, Infinity, false).places.filter((place) => place.kind === 'Platform'),
      operatingDirection: link.direction,
    }
  }

  function relatedTargets(target: SelectionTarget): SelectionTarget[] {
    const addPlaces = (entries: Place[]) => entries.flatMap((entry) => placeTarget(entry) ?? [])
    const addLines = (entries: RailLine[]) => entries.map((line) => ({ kind: 'line' as const, id: line.id }))
    const id = target.id
    let related: SelectionTarget[]
    switch (target.kind) {
      case 'station':
      case 'line':
        related = [...ownersOf(model, target)].flatMap((owner) => {
          const place = places.get(owner)
          const link = links.get(owner)
          return (place ? placeTarget(place) : link ? linkTarget(link) : null) ?? []
        })
        break
      case 'platform': {
        const view = platformView(id)
        const sameLines = new Set(view.lines.flatMap((line) => [
          ...ownersOf(model, { kind: 'line', id: line.id }),
        ]))
        related = [
          ...[...sameLines].map((id) => ({ kind: 'platform' as const, id })),
          ...addLines(view.lines),
          ...view.nearestGates.map(linkTarget),
          ...view.nearestVerticals.map(linkTarget),
          ...view.transfers.map(({ toPlatformId }) => ({ kind: 'platform' as const, id: toPlatformId })),
        ]
        break
      }
      case 'gate': {
        const view = gateView(id)
        related = addPlaces([view.insideSide, view.outsideSide, ...view.servedPlatforms, ...view.facilitiesOutside])
        break
      }
      case 'vertical':
        related = addPlaces([...endpointsOf(id), ...verticalView(id).servedPlatforms])
        break
      case 'entrance': {
        const view = exitView(id)
        related = [...addPlaces(view.nearestArea ? [view.nearestArea] : []), ...addLines(view.reachableLines)]
        break
      }
      case 'passage':
        related = addPlaces(endpointsOf(id))
        break
      case 'concourse':
        related = linksAt(id).filter((link) => nextPlaceId(link, id)).map(linkTarget)
        break
      case 'train':
        related = []
    }
    return [...new Map(related.filter((entry) => entry.id !== id).map((entry) => [entry.id, entry])).values()]
  }

  return {
    place: (id) => places.get(id),
    link: (id) => links.get(id),
    levelOf, stationOf, linesAtPlace, linksAt, gateView, exitView, platformView, verticalView,
    ownersOf: (target) => ownersOf(model, target),
    relatedTargets,
  }
}
