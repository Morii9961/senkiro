import type { SelectionTarget } from '../../state/selection'
import { nextPlaceId, route, vertical } from '../graph'
import { linkTarget, placeTarget, type FacilityIndex } from '../index'
import type { Entity, Language, Model, Place, RailLine } from '../types'
import type { DetailFact, DetailRelation, DetailSpec } from './types'

export function describeFacility(
  model: Model, index: FacilityIndex, target: SelectionTarget, lang: Language,
): DetailSpec | null {
  const { id, kind } = target
  const t = (ja: string, en: string) => (lang === 'ja' ? ja : en)
  const fact = (key: string, ja: string, en: string, value: string | null): DetailFact =>
    ({ key, label: t(ja, en), value })
  const stationOf = (place: Place) => model.stations.find((entry) => entry.id === place.stationId)
  const levels = new Map(model.levels.map((level) => [level.id, level]))
  const floor = (place: Place) => levels.get(place.levelId)?.label ?? null
  const zone = (place: Place) => place.zone === 'paid' ? t('改札内', 'Inside gates') : t('改札外', 'Outside gates')
  const area = (place: Place) => [place.names[lang], floor(place), zone(place)].filter(Boolean).join(' · ')
  const operator = (operatorId: string | undefined) =>
    model.operators.find((entry) => entry.id === operatorId)?.names[lang] ?? null
  const linesById = (ids: string[]) => model.lines.filter((line) => ids.includes(line.id))
  const placeRelation = (place: Place): DetailRelation[] => {
    const target = placeTarget(place)
    return target ? [{ target, label: place.names[lang] }] : []
  }
  const lineRelations = (lines: RailLine[]): DetailRelation[] => lines.map((line) =>
    ({ target: { kind: 'line', id: line.id }, label: line.names[lang] }))
  const group = (key: string, ja: string, en: string, items: DetailRelation[], derived = false) =>
    ({ key, title: t(ja, en), items, derived })
  const stepFree = (known: boolean | null) =>
    known === null ? null : known ? t('確認済み', 'Verified') : t('段差あり', 'Not step-free')
  const endpoints: DetailSpec['actions'] = [
    { kind: 'start', label: t('ここから', 'Start here') },
    { kind: 'end', label: t('ここへ', 'Route here') },
  ]

  function describe(entity: Entity, values: {
    facts: DetailFact[]
    lines?: RailLine[]
    floor?: string | null
    area?: string | null
    relations?: DetailSpec['relations']
    actions?: DetailSpec['actions']
    sourceIds?: string[]
  }): DetailSpec {
    return {
      target, title: entity.names[lang], subtitle: entity.names[lang === 'ja' ? 'en' : 'ja'],
      chips: { lines: values.lines ?? [], floor: values.floor ?? null, area: values.area ?? null },
      facts: values.facts, relations: values.relations ?? [], actions: values.actions ?? [],
      provenance: {
        sourceIds: [...new Set([...entity.provenance.sourceIds, ...values.sourceIds ?? []])],
        nature: entity.provenance.dataNature, confidence: entity.geometry_confidence,
        missing: values.facts.filter((row) => row.value === null).map((row) => row.label),
      },
    }
  }

  if (kind === 'gate') {
    const { gate, insideSide, outsideSide, operatorsAcross, servedPlatforms, facilitiesOutside,
      stepFree: isStepFree } = index.gateView(id)
    const station = stationOf(insideSide)
    const adjacentVerticals = [outsideSide, ...facilitiesOutside].flatMap((place) =>
      index.linksAt(place.id).filter((link) => vertical(link) && nextPlaceId(link, place.id)))
    const nearby = [...new Map(adjacentVerticals.map((link) => [link.id, link])).values()]
    const across = operatorsAcross.every((entry) => entry) && operatorsAcross[0]?.id !== operatorsAcross[1]?.id
      ? operatorsAcross.map((entry) => entry!.names[lang]).join(' ↔ ') : null
    return describe(gate, {
      floor: floor(insideSide), lines: linesById(servedPlatforms.flatMap((place) => place.serviceLineIds ?? [])),
      facts: [
        fact('inside', '改札内', 'Inside gates', area(insideSide)),
        fact('outside', '改札外', 'Outside gates', area(outsideSide)),
        fact('station', '駅', 'Station', station?.names[lang] ?? null),
        fact('operator', '運営会社', 'Operator', operatorsAcross[0]?.names[lang] ?? null),
        fact('step-free', '段差なし', 'Step-free', stepFree(isStepFree)),
        ...(across ? [fact('transfer', '乗換方向', 'Transfer direction', across)] : []),
      ],
      relations: [
        group('served-platforms', '接続ホーム', 'Served platforms', servedPlatforms.flatMap(placeRelation), true),
        group('nearby', '周辺施設', 'Nearby facilities', [
          ...facilitiesOutside.flatMap(placeRelation),
          ...nearby.map((link) => ({ target: linkTarget(link), label: link.names[lang] })),
        ], true),
      ],
      actions: [...endpoints, { kind: 'through', label: t('この改札を通る経路', 'Route through this gate') }],
    })
  }

  if (kind === 'passage') {
    const link = index.link(id)!
    const from = index.place(link.from)!
    const to = index.place(link.to)!
    const lines = linesById([...stationOf(from)?.lineIds ?? [], ...stationOf(to)?.lineIds ?? []])
    const management = {
      railway: t('鉄道会社', 'Railway'), commercial: t('商業施設', 'Commercial facility'),
      'public-road': t('公道', 'Public road'), unknown: null,
    }
    const floorChange = floor(from) === floor(to) ? floor(from) : floor(from) + ' → ' + floor(to)
    return describe(link, {
      floor: floorChange, lines,
      facts: [
        fact('from', '接続元', 'From', area(from)),
        fact('to', '接続先', 'To', area(to)),
        fact('lines', '路線', 'Lines', lines.map((line) => line.names[lang]).join(' / ') || null),
        fact('manager', '管理者', 'Management', from.manager && from.manager === to.manager ? management[from.manager] : null),
        fact('hours', '通行時間帯', 'Opening hours', null),
        fact('distance', '距離', 'Distance', t('未測定', 'Unmeasured')),
        fact('time', '所要時間', 'Walking time', t('未測定', 'Unmeasured')),
      ],
      relations: [group('connected', '接続施設', 'Connected places', [from, to].flatMap(placeRelation))],
      actions: link.connection === 'verified' && link.direction !== 'unknown'
        ? [...endpoints, { kind: 'through', label: t('この通路を含む経路', 'Route through this passage') }]
        : [],
    })
  }

  if (kind === 'entrance') {
    const { entrance, info, nearestArea, reachableLines } = index.exitView(id)
    return describe(entrance, {
      floor: floor(entrance), area: zone(entrance), lines: reachableLines,
      sourceIds: info?.provenance.sourceIds,
      facts: [
        fact('exit-label', '出口番号', 'Official exit number', info?.exitLabel?.[lang] ?? null),
        fact('surface', '地上の位置', 'Street location', info?.surfaceNote?.[lang] ?? null),
        fact('nearest', '近くの駅エリア', 'Nearby station area', nearestArea ? area(nearestArea) : null),
      ],
      relations: [
        group('reachable-lines', '利用できる路線', 'Reachable lines', lineRelations(reachableLines), true),
        group('nearest-area', '周辺施設', 'Nearby facilities', nearestArea ? placeRelation(nearestArea) : [], true),
      ],
      actions: [endpoints[1]],
    })
  }

  if (kind === 'vertical') {
    const view = index.verticalView(id)
    const levels = view.fromLevel.label + ' → ' + view.toLevel.label
    const direction = view.operatingDirection === 'unknown'
      ? t('方向未確認・経路には使いません', 'Direction unverified · excluded from routes')
      : view.operatingDirection === 'forward'
        ? index.place(view.link.from)!.names[lang] + ' → ' + index.place(view.link.to)!.names[lang]
        : t('双方向', 'Both directions')
    return describe(view.link, {
      floor: levels,
      facts: [
        fact('level-change', '階層移動', 'Level change', levels),
        fact('step-free', '段差なし', 'Step-free', stepFree(view.link.stepFree)),
        fact('direction', '運転方向', 'Direction', direction),
        fact('operation', '稼働状況（配信なし）', 'Operating status · no feed', null),
      ],
      relations: [group('served-platforms', '接続ホーム', 'Served platforms', view.servedPlatforms.flatMap(placeRelation), true)],
    })
  }

  if (kind === 'line') {
    const line = model.lines.find((entry) => entry.id === id)!
    const platforms = [...index.ownersOf(target)].flatMap((key) => placeRelation(index.place(key)!))
    return describe(line, {
      lines: [line],
      facts: [fact('operator', '運営会社', 'Operator', operator(line.operatorId))],
      relations: [group('line-platforms', 'この路線のホーム', 'Platforms on this line', platforms)],
    })
  }

  if (kind === 'station') {
    const context = model.context.find((entry) => entry.id === id)
    const station = model.stations.find((entry) => entry.id === (context ? context.stationId : id))
    const entity = context ?? station
    if (!entity) return null
    const ownerIds = index.ownersOf(target)
    const places = model.places.filter((place) => ownerIds.has(place.id))
    const platforms = places.filter((place) => place.kind === 'Platform')
    const anchor = context?.anchorId ?? platforms[0]?.id
    const connected = anchor ? model.stations.flatMap((other) => {
      if (other.id === station?.id) return []
      const stop = model.context.find((site) => site.stationId === other.id)?.anchorId ??
        model.places.find((place) => place.stationId === other.id && place.kind === 'Platform')?.id
      return stop && route(model, anchor, stop)
        ? [{ target: { kind: 'station' as const, id: other.id }, label: other.names[lang] }]
        : []
    }) : []
    const lines = linesById(station?.lineIds ?? [])
    const floors = [...new Set(places.map(floor).filter(Boolean))]
    return describe(entity, {
      lines,
      facts: [
        fact('operator', '運営会社', 'Operator', operator(station?.operatorId)),
        fact('floors', '階層', 'Floors', floors.join(' / ') || null),
        fact('platforms', 'ホーム数', 'Platforms in the model', station ? String(platforms.length) : null),
      ],
      relations: [
        group('station-lines', '路線', 'Lines', lineRelations(lines)),
        group('station-platforms', 'ホーム', 'Platforms', platforms.flatMap(placeRelation)),
        group('walking-connections', '徒歩接続', 'Walking connections', connected, true),
      ],
      actions: [
        { kind: 'site', label: t('この駅だけ表示', 'Show this site only') },
        { kind: 'passenger', label: t('この場所の乗客目線', 'Passenger view at this site') },
      ],
    })
  }

  if (kind === 'concourse') {
    const place = index.place(id)!
    const links = index.linksAt(id).filter((link) => nextPlaceId(link, id))
    return describe(place, {
      floor: floor(place), area: zone(place),
      lines: linesById(stationOf(place)?.lineIds ?? []),
      facts: [
        fact('area', '区画', 'Area', zone(place)),
        fact('station', '駅', 'Station', stationOf(place)?.names[lang] ?? null),
      ],
      relations: [group('connected', '接続施設', 'Connected facilities',
        links.map((link) => ({ target: linkTarget(link), label: link.names[lang] })), true)],
      actions: endpoints,
    })
  }
  return null
}
