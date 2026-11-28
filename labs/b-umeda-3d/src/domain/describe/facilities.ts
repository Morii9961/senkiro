import { nameIn } from '../language'
import type { SelectionTarget } from '../../state/selection'
import { nextPlaceId, route, vertical } from '../graph'
import { linkTarget, placeTarget, type FacilityIndex } from '../index'
import type { Entity, Language, Model, Place, RailLine } from '../types'
import type { DetailFact, DetailRelation, DetailSpec } from './types'
import { lineStyleById } from '../../model'

export function describeFacility(
  model: Model, index: FacilityIndex, target: SelectionTarget, lang: Language,
): DetailSpec | null {
  const { id, kind } = target
  const t = (ja: string, en: string, zh: string) => lang === 'zh' ? zh : lang === 'ja' ? ja : en
  const fact = (key: string, ja: string, en: string, zh: string, value: string | null): DetailFact =>
    ({ key, label: t(ja, en, zh), value })
  const stationOf = (place: Place) => model.stations.find((entry) => entry.id === place.stationId)
  const levels = new Map(model.levels.map((level) => [level.id, level]))
  const floor = (place: Place) => levels.get(place.levelId)?.label ?? null
  const zone = (place: Place) => place.zone === 'paid' ? t('改札内', 'Inside gates', '闸机内') : t('改札外', 'Outside gates', '闸机外')
  const area = (place: Place) => [nameIn(place.names, lang), floor(place), zone(place)].filter(Boolean).join(' · ')
  const operator = (operatorId: string | undefined) =>
    nameIn(model.operators.find((entry) => entry.id === operatorId)?.names, lang) ?? null
  const linesById = (ids: string[]) => model.lines.filter((line) => ids.includes(line.id))
  const placeRelation = (place: Place): DetailRelation[] => {
    const target = placeTarget(place)
    return target ? [{ target, label: nameIn(place.names, lang) }] : []
  }
  const lineRelations = (lines: RailLine[]): DetailRelation[] => lines.map((line) =>
    ({ target: { kind: 'line', id: line.id }, label: nameIn(line.names, lang) }))
  const group = (key: string, ja: string, en: string, zh: string, items: DetailRelation[], derived = false) =>
    ({ key, title: t(ja, en, zh), items, derived })
  const stepFree = (known: boolean | null) =>
    known === null ? null : known ? t('確認済み', 'Verified', '已核实') : t('段差あり', 'Not step-free', '有台阶')
  const endpoints: DetailSpec['actions'] = [
    { kind: 'start', label: t('ここから', 'Start here', '从这里出发') },
    { kind: 'end', label: t('ここへ', 'Route here', '到这里') },
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
      target, title: nameIn(entity.names, lang), subtitle: entity.names[lang === 'ja' ? 'en' : 'ja'],
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
      ? operatorsAcross.map((entry) => nameIn(entry!.names, lang)).join(' ↔ ') : null
    return describe(gate, {
      floor: floor(insideSide), lines: linesById(servedPlatforms.flatMap((place) => place.serviceLineIds ?? [])),
      facts: [
        fact('inside', '改札内', 'Inside gates', '闸机内', area(insideSide)),
        fact('outside', '改札外', 'Outside gates', '闸机外', area(outsideSide)),
        fact('station', '駅', 'Station', '车站', nameIn(station?.names, lang) ?? null),
        fact('operator', '運営会社', 'Operator', '运营商', nameIn(operatorsAcross[0]?.names, lang) ?? null),
        fact('step-free', '段差なし', 'Step-free', '无台阶', stepFree(isStepFree)),
        ...(across ? [fact('transfer', '乗換方向', 'Transfer direction', '换乘方向', across)] : []),
      ],
      relations: [
        group('served-platforms', '接続ホーム', 'Served platforms', '服务站台', servedPlatforms.flatMap(placeRelation), true),
        group('nearby', '周辺施設', 'Nearby facilities', '附近设施', [
          ...facilitiesOutside.flatMap(placeRelation),
          ...nearby.map((link) => ({ target: linkTarget(link), label: nameIn(link.names, lang) })),
        ], true),
      ],
      actions: [...endpoints, { kind: 'through', label: t('この改札を通る経路', 'Route through this gate', '规划经过此闸机的路线') }],
    })
  }

  if (kind === 'passage') {
    const link = index.link(id)!
    const from = index.place(link.from)!
    const to = index.place(link.to)!
    const lines = linesById([...stationOf(from)?.lineIds ?? [], ...stationOf(to)?.lineIds ?? []])
    const management = {
      railway: t('鉄道会社', 'Railway', '铁路公司'), commercial: t('商業施設', 'Commercial facility', '商业设施'),
      'public-road': t('公道', 'Public road', '公共道路'), unknown: null,
    }
    const floorChange = floor(from) === floor(to) ? floor(from) : floor(from) + ' → ' + floor(to)
    return describe(link, {
      floor: floorChange, lines,
      facts: [
        fact('from', '接続元', 'From', '起点', area(from)),
        fact('to', '接続先', 'To', '终点', area(to)),
        fact('lines', '路線', 'Lines', '线路', lines.map((line) => nameIn(line.names, lang)).join(' / ') || null),
        fact('manager', '管理者', 'Management', '管理方', from.manager && from.manager === to.manager ? management[from.manager] : null),
        fact('hours', '通行時間帯', 'Opening hours', '开放时间', null),
        fact('distance', '距離', 'Distance', '距离', t('未測定', 'Unmeasured', '未测量')),
        fact('time', '所要時間', 'Walking time', '步行时间', t('未測定', 'Unmeasured', '未测量')),
      ],
      relations: [group('connected', '接続施設', 'Connected places', '连接地点', [from, to].flatMap(placeRelation))],
      actions: link.connection === 'verified' && link.direction !== 'unknown'
        ? [...endpoints, { kind: 'through', label: t('この通路を含む経路', 'Route through this passage', '规划经过此通道的路线') }]
        : [],
    })
  }

  if (kind === 'entrance') {
    const { entrance, info, nearestArea, reachableLines } = index.exitView(id)
    return describe(entrance, {
      floor: floor(entrance), area: zone(entrance), lines: reachableLines,
      sourceIds: info?.provenance.sourceIds,
      facts: [
        fact('exit-label', '出口表示', 'Official exit label', '官方出口标识', nameIn(info?.exitLabel, lang) ?? null),
        fact('surface', '地上の位置', 'Street location', '地面位置', nameIn(info?.surfaceNote, lang) ?? null),
        fact('nearest', '近くの駅エリア', 'Nearby station area', '相邻站区', nearestArea ? area(nearestArea) : null),
      ],
      relations: [
        group('reachable-lines', '利用できる路線', 'Reachable lines', '可达线路', lineRelations(reachableLines), true),
        group('nearest-area', '周辺施設', 'Nearby facilities', '附近设施', nearestArea ? placeRelation(nearestArea) : [], true),
      ],
      actions: [endpoints[1]],
    })
  }

  if (kind === 'vertical') {
    const view = index.verticalView(id)
    const levels = view.fromLevel.label + ' → ' + view.toLevel.label
    const direction = view.operatingDirection === 'unknown'
      ? t('方向未確認・経路には使いません', 'Direction unverified · excluded from routes', '方向未核实，无法用于寻路')
      : view.operatingDirection === 'forward'
        ? nameIn(index.place(view.link.from)!.names, lang) + ' → ' + nameIn(index.place(view.link.to)!.names, lang)
        : t('双方向', 'Both directions', '双向')
    return describe(view.link, {
      floor: levels,
      facts: [
        fact('level-change', '階層移動', 'Level change', '换层', levels),
        fact('step-free', '段差なし', 'Step-free', '无台阶', stepFree(view.link.stepFree)),
        fact('direction', '運転方向', 'Direction', '方向', direction),
        fact('operation', '稼働状況（配信なし）', 'Operating status · no feed', '运行状态', null),
      ],
      relations: [group('served-platforms', '接続ホーム', 'Served platforms', '服务站台', view.servedPlatforms.flatMap(placeRelation), true)],
    })
  }

  if (kind === 'line') {
    const line = model.lines.find((entry) => entry.id === id)!
    const platforms = [...index.ownersOf(target)].flatMap((key) => placeRelation(index.place(key)!))
    return describe(line, {
      lines: [line],
      facts: [fact('operator', '運営会社', 'Operator', '运营商', operator(line.operatorId))],
      relations: [group('line-platforms', 'この路線のホーム', 'Platforms on this line', '该线路的站台', platforms)],
      sourceIds: lineStyleById.get(id)?.color?.sourceIds,
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
        ? [{ target: { kind: 'station' as const, id: other.id }, label: nameIn(other.names, lang) }]
        : []
    }) : []
    const lines = linesById(station?.lineIds ?? [])
    const floors = [...new Set(places.map(floor).filter(Boolean))]
    return describe(entity, {
      lines,
      facts: [
        fact('operator', '運営会社', 'Operator', '运营商', operator(station?.operatorId)),
        fact('floors', '階層', 'Floors', '楼层', floors.join(' / ') || null),
        fact('platforms', 'ホーム数', 'Platforms in the model', '模型中的站台数', station ? String(platforms.length) : null),
      ],
      relations: [
        group('station-lines', '路線', 'Lines', '线路', lineRelations(lines)),
        group('station-platforms', 'ホーム', 'Platforms', '站台', platforms.flatMap(placeRelation)),
        group('walking-connections', '徒歩接続', 'Walking connections', '步行连接', connected, true),
      ],
      actions: [
        { kind: 'site', label: t('この駅だけ表示', 'Show this site only', '只显示此站') },
        { kind: 'passenger', label: t('この場所の乗客目線', 'Passenger view at this site', '在这里切换乘客视角') },
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
        fact('area', '区画', 'Area', '区域', zone(place)),
        fact('station', '駅', 'Station', '车站', nameIn(stationOf(place)?.names, lang) ?? null),
      ],
      relations: [group('connected', '接続施設', 'Connected facilities', '相连设施',
        links.map((link) => ({ target: linkTarget(link), label: nameIn(link.names, lang) })), true)],
      actions: endpoints,
    })
  }
  return null
}
