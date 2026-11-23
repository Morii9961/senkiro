import { vehicleSeries } from '../../../data/manual/vehicles'
import type { TimetableRecord, VehicleAssignmentStatus } from '../../timetable/types'
import type { TrainPhase, TrainPlan } from '../../trains/simulate'
import type { FacilityIndex } from '../index'
import type { Language } from '../types'
import type { DetailSpec } from './types'

const seriesById = new Map(vehicleSeries.map((series) => [series.id, series]))
const stages: Record<TrainPhase, Record<Language, string>> = {
  approaching: { ja: '接近', en: 'Approaching' },
  braking: { ja: '制動中', en: 'Braking' },
  'doors-opening': { ja: '開扉中', en: 'Doors opening' },
  'doors-open': { ja: '開扉', en: 'Doors open' },
  'doors-closing': { ja: '閉扉中', en: 'Doors closing' },
  stopped: { ja: '停車', en: 'Stopped' },
  departing: { ja: '出発', en: 'Departing' },
}

export function describeVehicle(record: TimetableRecord, status: VehicleAssignmentStatus, lang: Language) {
  const series = status !== 'unknown' && record.vehicle_series ? seriesById.get(record.vehicle_series) : null
  if (!series || series.operatorId !== record.operator_id) {
    return {
      label: lang === 'ja' ? '車種未確認（汎用車体）' : 'Vehicle unverified (generic body)',
      status: 'unknown' as const,
    }
  }
  const marker = status === 'verified' ? (lang === 'ja' ? '確認済み' : 'Verified') : (lang === 'ja' ? '代表例' : 'Representative')
  return { label: series.names[lang] + ' · ' + marker, status }
}

export function describeTrain(
  index: FacilityIndex, plan: TrainPlan, phase: TrainPhase | null, lang: Language, following: boolean,
): DetailSpec {
  const { record } = plan
  const platform = index.place(plan.track.platformId)!
  const floor = index.levelOf(platform.id)
  const t = (ja: string, en: string) => lang === 'ja' ? ja : en
  const facts = [
    { key: 'class', label: t('種別', 'Service class'), value: record.service_class },
    { key: 'destination', label: t('行先', 'Destination'), value: record.destination_text },
    { key: 'phase', label: t('状態', 'Phase'), value: phase ? stages[phase][lang] : null },
    { key: 'arrival', label: t('予定到着', 'Scheduled arrival'), value: record.arrival_time_local },
    { key: 'departure', label: t('予定発車', 'Scheduled departure'), value: record.departure_time_local },
    { key: 'formation', label: t('編成', 'Formation'), value: plan.vehicle.cars === null
      ? t('編成未確認', 'Formation unverified') : t(plan.vehicle.cars + '両', plan.vehicle.cars + ' cars') },
  ]
  if (plan.arrivalAssumed || plan.shortStopAssumed) {
    facts.push({ key: 'assumed', label: t('表示上の停車', 'Illustrated dwell'), value: plan.arrivalAssumed
      ? t('到着時刻未確認のため仮定', 'Assumed because the arrival time is unverified')
      : t('同一分の時刻に基づく仮定', 'Assumed within the reported minute') })
  }
  return {
    target: { kind: 'train', id: plan.id },
    title: plan.feedKind === 'demo' ? t('架空の列車', 'Fictional train') : t('時刻表シミュレーション', 'Timetable simulation'),
    subtitle: t('外観は模式表現', 'Schematic appearance'),
    chips: {
      lines: index.linesAtPlace(platform.id).filter(({ id }) => id === record.line_id),
      floor: floor?.label ?? null,
      area: null,
      vehicle: describeVehicle(record, plan.vehicle.status, lang),
    },
    facts,
    actions: [{ kind: 'follow', label: t('追従', 'Follow'), pressed: following }],
    relations: [{
      key: 'train-platform', title: t('停車するのりば', 'Stops at'),
      items: [{ target: { kind: 'platform', id: platform.id }, label: platform.names[lang] }],
    }],
    provenance: {
      sourceIds: [record.source_id],
      nature: plan.feedKind === 'demo' ? 'synthetic' : 'derived',
      confidence: 'schematic',
      missing: facts.filter(({ value }) => value === null).map(({ label }) => label),
    },
  }
}
