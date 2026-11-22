import type { Step } from '../../domain/graph'
import { linkTarget, placeTarget } from '../../domain/index'
import type { Language, Model, Place } from '../../domain/types'
import { sample } from '../../providers/service'
import type { SelectionKind, SelectionTarget } from '../../state/selection'
import { scenePlaceFilter, siteFilter } from '../view'

type Anchor = [number, number, number]

export interface SceneLabelSpec {
  key: string
  targetId: string | null
  targetKind: SelectionKind
  level: 0 | 1 | 2 | 3 | 4
  priority: number
  anchor: Anchor
  text: string
  badges?: { lineId: string }[]
  maxBand?: 'far' | 'mid' | 'near'
  meaningKey?: string
  floorOrdinal: number | null
  // The existing renderer uses these flags until the label layout changes.
  variant?: 'station' | 'platform' | 'floor' | 'lines' | 'facility'
  icon?: string
  title?: string
  active?: boolean
  routePriority?: number
  routeOnly?: boolean
}

interface LabelView {
  floor: number | null
  siteId: string | null
  lang: Language
  spread: boolean
  example: boolean
}

const floorAnchors = {
  '3F': 'jr-bridge',
  中2F: 'jr-sakura-mezz',
  '1F': 'jr-central-south',
  B1F: 'umekita-out',
  B2F: 'jr-23-24',
  '2F': 'jr-1-2',
}

export function buildLabels(
  model: Model,
  view: LabelView,
  // Selection is resolved by appearance so it can change without rebuilding the candidates.
  _selection: SelectionTarget | null,
  route: { steps: readonly Step[]; step: number },
): SceneLabelSpec[] {
  const { lang, floor, spread, example } = view
  const current = route.steps[route.step]
  const routeIds = new Set(route.steps.map(({ link }) => link.id))
  const places = new Map(model.places.map((place) => [place.id, place]))
  const levels = new Map(model.levels.map((level) => [level.id, level]))
  const visible = scenePlaceFilter(model, view, current)
  const ordinal = (place: Place) => levels.get(place.levelId)!.ordinal
  const position = (place: Place, offset: number): Anchor =>
    [place.point[0], ordinal(place) * (spread ? 9 : 5) + offset, place.point[1]]
  const labels: SceneLabelSpec[] = []

  for (const place of model.places.filter(visible)) {
    if (place.kind === 'Platform') {
      const { id, stationId } = place
      if (!current && floor === null && stationId) {
        const names = id.endsWith('21-22')
          ? { ja: 'JR うめきた地下ホーム', en: 'JR Umekita platforms' }
          : id.endsWith('jr-11')
            ? { ja: 'JR 大阪駅', en: 'JR Osaka Station' }
            : id.endsWith('metro-1')
              ? { ja: '御堂筋線 梅田', en: 'Midosuji · Umeda' }
              : null
        if (names) {
          const umekita = id.endsWith('21-22')
          labels.push({
            key: 'station:' + stationId + (umekita ? ':umekita' : ''),
            targetId: stationId, targetKind: 'station', level: 1, priority: -1,
            anchor: position(place, umekita ? 2.5 : 3.2), floorOrdinal: ordinal(place),
            text: names[lang], variant: 'station',
          })
        }
      }
      if (example && id === sample.platformId) {
        labels.push({
          key: 'example:' + id, targetId: id, targetKind: 'platform', level: 0, priority: -3,
          anchor: position(place, 3), floorOrdinal: ordinal(place), active: true,
          text: (lang === 'ja' ? 'サンプル' : 'EXAMPLE') + ' · +' + sample.delayMinutes + ' min',
        })
      }
      const [width, depth] = place.size
      const anchor = position(place, 1.03)
      if (width > depth) anchor[0] += width * 0.37
      else anchor[2] += depth * 0.32
      const number = place.boarding?.label ??
        id.split(':').pop()!.replace(/^(jr|metro)-/, '').replace('-', ' · ')
      labels.push({
        key: 'platform:' + id, targetId: id, targetKind: 'platform', level: 2, priority: 1,
        anchor, floorOrdinal: ordinal(place), text: number, title: place.names[lang],
        variant: 'platform', badges: place.serviceLineIds?.map((lineId) => ({ lineId })),
      })
    } else if (place.kind === 'Entrance' && place.id !== 'sk:entrance:surface-crossing') {
      labels.push({
        key: 'entrance:' + place.id, targetId: place.id, targetKind: 'entrance', level: 2, priority: 1,
        anchor: position(place, 1.5), floorOrdinal: ordinal(place), text: place.names[lang],
      })
    } else if (place.kind === 'Concourse' && !place.id.includes('landing') &&
      (!current || place.id === current.from.id || place.id === current.to.id)) {
      labels.push({
        key: 'concourse:' + place.id, targetId: place.id, targetKind: 'concourse', level: 4, priority: 2,
        anchor: position(place, 1), floorOrdinal: ordinal(place), text: place.names[lang],
      })
    }
  }

  if (!current) {
    for (const site of model.context) {
      const anchor = places.get(site.anchorId)!
      const inSite = siteFilter(model, site.id)
      const here = visible(anchor) ? anchor : model.places.find((place) =>
        place.kind !== 'Landing' && inSite(place) && visible(place),
      )
      if (!here) continue
      labels.push({
        key: 'station:' + site.id, targetId: site.id, targetKind: 'station', level: 1, priority: -2,
        anchor: position(here, 2.65), floorOrdinal: ordinal(here),
        text: site.names[lang], variant: 'station',
      })
    }
  }
  for (const name of labels.filter((label) => label.variant === 'station')) {
    const context = model.context.find((site) => site.id === name.targetId)
    const station = model.stations.find((entry) => entry.id === (context ? context.stationId : name.targetId))
    if (!station?.lineIds.length || name.key.endsWith(':umekita')) continue
    const badges = station.lineIds.map((lineId) => ({ lineId }))
    labels.push({
      ...name, key: 'lines:' + name.targetId, variant: 'lines', level: 2, badges,
      anchor: [name.anchor[0], name.anchor[1] - 2, name.anchor[2]],
      text: model.lines.filter((line) => station.lineIds.includes(line.id)).map((line) => line.names[lang]).join(' · '),
    })
  }
  if (!current && floor === null) {
    for (const [name, suffix] of Object.entries(floorAnchors)) {
      const place = model.places.find((entry) =>
        entry.id.endsWith(':' + suffix) && levels.get(entry.levelId)?.label === name,
      )
      if (!place || !visible(place)) continue
      const target = placeTarget(place)!
      const anchor = position(place, 0.75)
      anchor[0] -= place.size[0] * 0.46
      anchor[2] += place.size[1] * 0.41
      labels.push({
        key: 'floor:' + name, targetId: target.id, targetKind: target.kind, level: 2, priority: 0,
        anchor, floorOrdinal: ordinal(place), text: name, variant: 'floor',
      })
    }
  }

  for (const link of model.links) {
    const from = places.get(link.from)!
    const to = places.get(link.to)!
    const fromVisible = visible(from)
    const toVisible = visible(to)
    if (!fromVisible && !toVisible) continue
    const start = position(from, 0.46)
    const end = position(to, 0.46)
    const middle = start.map((value, axis) => value + (end[axis] - value) * 0.5) as Anchor
    const active = routeIds.has(link.id)
    const focus = current?.link.id === link.id
    if (link.kind === 'Gate' && fromVisible && toVisible && !focus) {
      labels.push({
        key: 'gate:' + link.id, targetId: link.id, targetKind: 'gate', level: 2,
        priority: active && current ? 1 : 2, active: active && !!current,
        routePriority: active && !current ? 1 : undefined,
        anchor: [middle[0], middle[1] + 2.7, middle[2]], floorOrdinal: ordinal(from),
        text: link.names[lang],
      })
    }
    if (active && (link.kind === 'Elevator' || focus)) {
      const anchor = fromVisible && toVisible ? middle : fromVisible ? start : end
      const linkFloor = fromVisible && toVisible && ordinal(from) !== ordinal(to)
        ? null : ordinal(fromVisible ? from : to)
      labels.push({
        key: 'route:' + link.id, targetId: link.id, targetKind: linkTarget(link).kind,
        level: focus ? 0 : 3, priority: focus ? -2 : 0,
        anchor: [anchor[0], anchor[1] + 1.5, anchor[2]], floorOrdinal: linkFloor,
        text: focus && current.from.id !== link.from ? current.to.names[lang] : link.names[lang],
        active: true, routeOnly: !current,
      })
    } else if (link.kind === 'Elevator' || link.kind === 'Stairs' || link.kind === 'Escalator') {
      const anchor = fromVisible && toVisible ? middle : fromVisible ? start : end
      labels.push({
        key: 'facility:' + link.id, targetId: link.id, targetKind: 'vertical', variant: 'facility',
        icon: link.kind === 'Elevator' ? '↕' : link.kind === 'Stairs' ? '↗' : '⇅',
        level: 3, priority: 3,
        anchor: [anchor[0], anchor[1] + 1.5, anchor[2]],
        floorOrdinal: fromVisible && toVisible ? null : ordinal(fromVisible ? from : to),
        text: link.names[lang], title: link.names[lang],
      })
    }
  }
  if (current) {
    const start = route.steps[0].from
    const end = route.steps[route.steps.length - 1].to
    for (const [key, place, text] of [
      ['route-start', start, lang === 'ja' ? '出発' : 'Start'],
      ['route-end', end, lang === 'ja' ? '到着' : 'Destination'],
    ] as const) {
      const target = placeTarget(place)
      if (target) labels.push({
        key, targetId: target.id, targetKind: target.kind, level: 0, priority: -1,
        anchor: position(place, 1.4), floorOrdinal: ordinal(place), text, active: true,
        title: place.names[lang],
      })
    }
  }
  return labels
}

export function objectLabel(model: Model, view: LabelView, target: SelectionTarget): SceneLabelSpec | null {
  const link = model.links.find((entry) => entry.id === target.id)
  const place = model.places.find((entry) => entry.id === (link?.from ?? target.id))
  if (!place) return null
  const level = model.levels.find((entry) => entry.id === place.levelId)!
  const anchor: Anchor = [place.point[0], level.ordinal * (view.spread ? 9 : 5) + 1.6, place.point[1]]
  if (link) {
    const to = model.places.find((entry) => entry.id === link.to)!
    const end = model.levels.find((entry) => entry.id === to.levelId)!
    anchor[0] = (anchor[0] + to.point[0]) / 2
    anchor[1] += (end.ordinal - level.ordinal) * (view.spread ? 9 : 5) / 2
    anchor[2] = (anchor[2] + to.point[1]) / 2
  }
  return {
    key: 'object:' + target.id, targetId: target.id, targetKind: target.kind, level: 0, priority: -2,
    anchor, floorOrdinal: level.ordinal, text: (link ?? place).names[view.lang],
  }
}
