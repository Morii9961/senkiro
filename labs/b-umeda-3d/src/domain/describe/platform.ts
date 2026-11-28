import { nameIn } from '../language'
import { linkTarget, type FacilityIndex } from '../index'
import type { Language, PlatformUpdate } from '../types'
import type { DetailFact, DetailRelation, DetailSpec } from './types'
import type { TimetableRecord } from '../../timetable/types'
import { lineStyleById } from '../../model'

export function describePlatform(
  index: FacilityIndex,
  id: string,
  { lang, example = null, demoRecords = [] }: {
    lang: Language; example?: PlatformUpdate | null; demoRecords?: readonly TimetableRecord[]
  },
): DetailSpec {
  const view = index.platformView(id)
  const { platform, operator, lines } = view
  const t = (ja: string, en: string, zh: string) => lang === 'zh' ? zh : lang === 'ja' ? ja : en
  const directions = view.services.flatMap((service) => service.directions ?? [])
  const words = (values: (string | null | undefined)[]) =>
    [...new Set(values.flatMap((value) => value?.trim() || []))].join(' / ') || null
  const facts: DetailFact[] = [
    { key: 'operator', label: t('運営会社', 'Operator', '运营商'), value: nameIn(operator.names, lang) },
    { key: 'boarding', label: t('のりば', 'Platform number', '站台编号'), value: platform.boarding?.label?.trim() || null },
    { key: 'direction', label: t('方面', 'Direction', '方向'), value: words(directions.map((entry) => nameIn(entry.towards, lang))) },
    { key: 'terminus', label: t('主な行先', 'Destinations', '主要目的地'), value: words(directions.map((entry) => nameIn(entry.terminusStationName, lang))) },
    { key: 'neighbors', label: t('隣接駅', 'Adjacent stations', '相邻站'), value: words(directions.map((entry) => nameIn(entry.neighborStationName, lang))) },
  ]
  const floors = index.levelOf(id)
  const transfers: DetailRelation[] = view.transfers.map(({ toPlatformId, gates, levelChanges }) => ({
    target: { kind: 'platform', id: toPlatformId },
    label: nameIn(index.place(toPlatformId)!.names, lang),
    badge: t('改札 ' + gates + ' · 階層移動 ' + levelChanges,
      gates + ' gates · ' + levelChanges + ' level changes', gates + ' 次过闸 · ' + levelChanges + ' 次换层'),
  }))
  const otherPlatforms = [...index.ownersOf({ kind: 'station', id: platform.stationId! })]
    .flatMap((key) => {
      const place = index.place(key)
      return place?.kind === 'Platform' && place.id !== id
        ? [{ target: { kind: 'platform' as const, id: key }, label: nameIn(place.names, lang) }]
        : []
    })
  const facilities = [...view.nearestGates, ...view.nearestVerticals]
    .map((link) => ({ target: linkTarget(link), label: nameIn(link.names, lang) }))
  const sourceIds = [...new Set([
    ...platform.provenance.sourceIds,
    ...view.services.flatMap((service) => service.provenance.sourceIds),
    ...directions.flatMap((entry) => entry.sourceIds),
    ...lines.flatMap(({ id }) => lineStyleById.get(id)?.color?.sourceIds ?? []),
  ])]
  return {
    target: { kind: 'platform', id },
    title: nameIn(platform.names, lang),
    subtitle: platform.names[lang === 'ja' ? 'en' : 'ja'],
    chips: {
      lines,
      floor: floors?.label ?? null,
      area: platform.zone === 'paid' ? t('改札内', 'Inside gates', '闸机内') : t('改札外', 'Outside gates', '闸机外'),
    },
    facts,
    service: demoRecords.length ? { kind: 'demo-timetable', records: demoRecords }
      : example?.platformId === id ? { kind: 'example', update: example } : { kind: 'unavailable' },
    relations: [
      { key: 'transfers', title: t('乗換', 'Transfers', '换乘'), items: transfers, derived: true },
      { key: 'same-station', title: t('同駅のホーム', 'Other platforms at this station', '本站其他站台'), items: otherPlatforms },
      { key: 'facilities', title: t('改札・昇降設備', 'Gates and vertical facilities', '闸机与升降设施'), items: facilities, derived: true },
    ],
    actions: [
      { kind: 'start', label: t('ここから', 'Start here', '从这里出发') },
      { kind: 'end', label: t('ここへ', 'Route here', '到这里') },
      { kind: 'floor', label: t('この階だけ表示', 'Show this floor', '只显示此层') },
      { kind: 'passenger', label: t('乗客目線', 'Passenger view', '乘客视角') },
    ],
    provenance: {
      sourceIds,
      nature: platform.provenance.dataNature,
      confidence: platform.geometry_confidence,
      missing: [
        ...facts.filter((fact) => fact.value === null).map((fact) => fact.label),
        ...(!lines.length ? [t('路線', 'Lines', '线路')] : []),
      ],
    },
  }
}
