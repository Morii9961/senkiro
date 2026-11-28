import type { Language } from '../domain/types'
import { floorLabels, floors, inSite, nodes, sites, station } from '../model'
import { targetFromOwner, type SelectionTarget } from './selection'

export interface UrlState {
  site: string | null
  floor: number | null
  mode: '3d' | '2d'
  detail: 'guide' | 'facility' | 'structure'
  selection: SelectionTarget | null
  from: string | null
  to: string | null
  routeDraft?: true
  stepFreeOnly: boolean
  step: number
  lang: Language
  theme: 'light' | 'dark'
  feed: 'off' | 'timetable-sim' | 'demo' | 'live'
}

export const defaultUrlState: UrlState = {
  site: null, floor: null, mode: '3d', detail: 'guide', selection: null,
  from: null, to: null, stepFreeOnly: false, step: -1, lang: 'ja', theme: 'light', feed: 'off',
}

function choice<T extends string>(value: string | null, choices: readonly T[], fallback: T): T {
  return choices.find((item) => item === value) ?? fallback
}

function integer(value: string | null): number | null {
  if (value === null || !/^-?\d+$/.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : null
}

function endpoint(value: string | null): string | null {
  const place = value === null ? undefined : nodes.get(value)
  return place?.id ?? null
}

function parseSelection(raw: string | null): SelectionTarget | null {
  const separator = raw?.indexOf(':') ?? -1
  if (raw === null || separator === -1) return null
  const kind = raw.slice(0, separator)
  const id = raw.slice(separator + 1)
  if (kind === 'line' && station.lines.some((line) => line.id === id)) {
    return { kind, id }
  }
  const target = targetFromOwner(id)
  return target?.kind === kind ? target : null
}

export function parseUrl(params: URLSearchParams): UrlState {
  const wantedSite = params.get('site')
  const site = sites.some((entry) => entry.id === wantedSite) ? wantedSite : null
  const floorText = params.get('floor')
  const floor = floorText !== null && /^-?\d+(?:\.\d+)?$/.test(floorText) ? Number(floorText) : null
  const validFloor = floorLabels.some(([ordinal]) => ordinal === floor) &&
    (site === null || station.places.some((place) =>
      inSite(place, site) && floors.get(place.levelId)?.ordinal === floor,
    ))
  const step = integer(params.get('step'))
  return {
    site,
    floor: validFloor ? floor : null,
    mode: choice(params.get('mode'), ['3d', '2d'], defaultUrlState.mode),
    detail: choice(params.get('detail'), ['guide', 'facility', 'structure'], defaultUrlState.detail),
    selection: parseSelection(params.get('sel')),
    from: endpoint(params.get('from')),
    to: endpoint(params.get('to')),
    ...(params.get('draft') === '1' ? { routeDraft: true as const } : {}),
    stepFreeOnly: params.get('sf') === '1',
    step: step !== null && step >= 0 ? step : defaultUrlState.step,
    lang: choice(params.get('lang'), ['ja', 'en', 'zh'], defaultUrlState.lang),
    theme: choice(params.get('theme'), ['light', 'dark'], defaultUrlState.theme),
    feed: choice(params.get('feed'), ['off', 'timetable-sim', 'demo', 'live'], defaultUrlState.feed),
  }
}

export function serializeUrl(state: UrlState, existing?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(existing)
  for (const [key, value] of Object.entries({
    site: state.site,
    floor: state.floor,
    mode: state.mode !== defaultUrlState.mode ? state.mode : null,
    detail: state.detail !== defaultUrlState.detail ? state.detail : null,
    sel: state.selection && state.selection.kind + ':' + state.selection.id,
    from: state.from,
    to: state.to,
    draft: state.routeDraft ? '1' : null,
    sf: state.stepFreeOnly ? '1' : null,
    step: state.step >= 0 ? state.step : null,
    lang: state.lang !== defaultUrlState.lang ? state.lang : null,
    theme: state.theme !== defaultUrlState.theme ? state.theme : null,
    feed: state.feed !== defaultUrlState.feed ? state.feed : null,
  })) {
    params.delete(key)
    if (value !== null) params.set(key, String(value))
  }
  return params
}
