import { nameIn, textIn } from '../language'
import { vehicleSeries } from '../../../data/manual/vehicles'
import type { TimetableRecord, VehicleAssignmentStatus } from '../../timetable/types'
import { timetableText } from '../../timetable/display'
import type { TrainPhase, TrainPlan } from '../../trains/simulate'
import type { FacilityIndex } from '../index'
import type { Language } from '../types'
import type { DetailSpec } from './types'

const seriesById = new Map(vehicleSeries.map((series) => [series.id, series]))
const stages: Record<TrainPhase, Record<Language, string>> = {
  approaching: { ja: '接近', en: 'Approaching', zh: '接近' },
  braking: { ja: '制動中', en: 'Braking', zh: '减速中' },
  'doors-opening': { ja: '開扉中', en: 'Doors opening', zh: '开门中' },
  'doors-open': { ja: '開扉', en: 'Doors open', zh: '车门已开' },
  'doors-closing': { ja: '閉扉中', en: 'Doors closing', zh: '关门中' },
  stopped: { ja: '停車', en: 'Stopped', zh: '停站' },
  departing: { ja: '出発', en: 'Departing', zh: '出站' },
}

export function describeVehicle(record: TimetableRecord, status: VehicleAssignmentStatus, lang: Language) {
  const series = status !== 'unknown' && record.vehicle_series ? seriesById.get(record.vehicle_series) : null
  if (!series || series.operatorId !== record.operator_id) {
    return {
      label: textIn(lang, '車種未確認（汎用車体）', 'Vehicle unverified (generic body)', '车型未核实（通用车体）'),
      status: 'unknown' as const,
    }
  }
  const marker = status === 'verified' ? (textIn(lang, '確認済み', 'Verified', '已核实')) : (textIn(lang, '代表例', 'Representative', '代表车型'))
  return { label: nameIn(series.names, lang) + ' · ' + marker, status }
}

export function describeTrain(
  index: FacilityIndex, plan: TrainPlan, phase: TrainPhase | null, lang: Language, following: boolean,
): DetailSpec {
  const { record } = plan
  const platform = index.place(plan.track.platformId)!
  const floor = index.levelOf(platform.id)
  const t = (ja: string, en: string, zh: string) => lang === 'zh' ? zh : lang === 'ja' ? ja : en
  const facts = [
    { key: 'class', label: t('種別', 'Service class', '列车种别'), value: timetableText(record.service_class, lang) },
    { key: 'destination', label: t('行先', 'Destination', '目的地'), value: timetableText(record.destination_text, lang) },
    { key: 'phase', label: t('状態', 'Phase', '状态'), value: phase ? stages[phase][lang] : null },
    { key: 'arrival', label: t('予定到着', 'Scheduled arrival', '计划到达'), value: record.arrival_time_local },
    { key: 'departure', label: t('予定発車', 'Scheduled departure', '计划出发'), value: record.departure_time_local },
    { key: 'formation', label: t('編成', 'Formation', '编组'), value: plan.vehicle.cars === null
      ? t('編成未確認', 'Formation unverified', '编组未核实') : t(plan.vehicle.cars + '両', plan.vehicle.cars + ' cars', plan.vehicle.cars + ' 节') },
  ]
  if (plan.arrivalAssumed || plan.shortStopAssumed) {
    facts.push({ key: 'assumed', label: t('表示上の停車', 'Illustrated dwell', '示意停站'), value: plan.arrivalAssumed
      ? t('到着時刻未確認のため仮定', 'Assumed because the arrival time is unverified', '到达时间未核实，停站时间为估算')
      : t('同一分の時刻に基づく仮定', 'Assumed within the reported minute', '同一分钟内估算停站时间') })
  }
  return {
    target: { kind: 'train', id: plan.id },
    title: plan.feedKind === 'demo' ? t('架空の列車', 'Fictional train', '虚构列车') : t('時刻表シミュレーション', 'Timetable simulation', '按时刻表模拟'),
    subtitle: t('外観は模式表現', 'Schematic appearance', '示意外观'),
    chips: {
      lines: index.linesAtPlace(platform.id).filter(({ id }) => id === record.line_id),
      floor: floor?.label ?? null,
      area: null,
      vehicle: describeVehicle(record, plan.vehicle.status, lang),
    },
    facts,
    actions: [{ kind: 'follow', label: t('追従', 'Follow', '跟随'), pressed: following }],
    relations: [{
      key: 'train-platform', title: t('停車するのりば', 'Stops at', '停靠站台'),
      items: [{ target: { kind: 'platform', id: platform.id }, label: nameIn(platform.names, lang) }],
    }],
    provenance: {
      sourceIds: [record.source_id, ...(plan.vehicle.status === 'unknown' || !record.vehicle_series
        ? [] : seriesById.get(record.vehicle_series)?.provenance.sourceIds ?? [])],
      nature: plan.feedKind === 'demo' ? 'synthetic' : 'derived',
      confidence: 'schematic',
      missing: facts.filter(({ value }) => value === null).map(({ label }) => label),
    },
  }
}
