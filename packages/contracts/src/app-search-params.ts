/**
 * Global URL deep-link contract (contract §6), shared by the web app (TanStack Router) and
 * the Expo `"use dom"` mobile shell.
 *
 * Parsing is field-by-field forgiving: one bad or hostile parameter falls back to its safe
 * default (or is dropped) without resetting the rest of the link, and the parser never throws.
 */
import { z } from 'zod';
import { isSkId, type SkId } from './ids.ts';
import { LOCALES, type Locale } from './locale.ts';

export const APP_REGIONS = ['kansai', 'kanto'] as const;
export const APP_MODULES = ['atlas', 'route', 'tickets', 'journey', 'profile'] as const;
export const APP_THEMES = ['light', 'dark'] as const;
export const APP_HUBS = ['umeda', 'kyoto', 'shinjuku'] as const;

export type AppRegion = (typeof APP_REGIONS)[number];
export type AppModule = (typeof APP_MODULES)[number];
export type AppTheme = (typeof APP_THEMES)[number];
export type AppHub = (typeof APP_HUBS)[number];

/** Region each 3D hub belongs to; a hub that contradicts an explicit region is dropped. */
export const HUB_REGION: Readonly<Record<AppHub, AppRegion>> = {
  umeda: 'kansai',
  kyoto: 'kansai',
  shinjuku: 'kanto',
};

export interface AppSearchParams {
  region: AppRegion;
  module: AppModule;
  station?: SkId<'station'>;
  complex?: SkId<'complex'>;
  line?: SkId<'line'>;
  hub?: AppHub;
  /** Hub level ID or label. */
  level?: string;
  /** Selected in-station place/link ID. */
  selection?: string;
  /** Transfer origin (station or in-station node). */
  from?: string;
  /** Transfer destination. */
  to?: string;
  stepFree?: boolean;
  lang: Locale;
  theme: AppTheme;
}

export type AppSearchParamDefaults = Pick<AppSearchParams, 'region' | 'module' | 'lang' | 'theme'>;

export const DEFAULT_APP_SEARCH_PARAMS: Readonly<AppSearchParamDefaults> = {
  region: 'kansai',
  module: 'atlas',
  lang: 'zh-CN',
  theme: 'dark',
};

/** Upper bound for free-text params, so a crafted URL cannot push huge strings into state. */
export const MAX_SEARCH_PARAM_LENGTH = 256;

const freeText = z.string().trim().min(1).max(MAX_SEARCH_PARAM_LENGTH);

function skIdParam<T extends 'station' | 'complex' | 'line'>(entity: T) {
  return z.custom<SkId<T>>((value) => isSkId(value, entity), {
    message: `expected a v1.0 SkId<'${entity}'>`,
  });
}

const booleanParam = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Build the schema with custom defaults (e.g. `theme` from the system colour scheme).
 * The output type is exactly {@link AppSearchParams}; unknown keys are stripped.
 */
export function createAppSearchParamsSchema(defaults: Partial<AppSearchParamDefaults> = {}) {
  const fallback: AppSearchParamDefaults = { ...DEFAULT_APP_SEARCH_PARAMS, ...defaults };
  const fields = z.object({
    region: z.enum(APP_REGIONS).optional().catch(undefined),
    module: z.enum(APP_MODULES).catch(fallback.module),
    station: skIdParam('station').optional().catch(undefined),
    complex: skIdParam('complex').optional().catch(undefined),
    line: skIdParam('line').optional().catch(undefined),
    hub: z.enum(APP_HUBS).optional().catch(undefined),
    level: freeText.optional().catch(undefined),
    selection: freeText.optional().catch(undefined),
    from: freeText.optional().catch(undefined),
    to: freeText.optional().catch(undefined),
    stepFree: booleanParam.optional().catch(undefined),
    lang: z.enum(LOCALES).catch(fallback.lang),
    theme: z.enum(APP_THEMES).catch(fallback.theme),
  });

  return z
    .preprocess((input) => (isRecord(input) ? input : {}), fields)
    .transform((raw): AppSearchParams => {
      // A hub alone implies its region; a hub contradicting an explicit region is dropped.
      const region = raw.region ?? (raw.hub === undefined ? fallback.region : HUB_REGION[raw.hub]);
      const out: AppSearchParams = {
        region,
        module: raw.module,
        lang: raw.lang,
        theme: raw.theme,
      };
      if (raw.station !== undefined) {
        out.station = raw.station;
      }
      if (raw.complex !== undefined) {
        out.complex = raw.complex;
      }
      if (raw.line !== undefined) {
        out.line = raw.line;
      }
      if (raw.hub !== undefined && HUB_REGION[raw.hub] === region) {
        out.hub = raw.hub;
      }
      if (raw.level !== undefined) {
        out.level = raw.level;
      }
      if (raw.selection !== undefined) {
        out.selection = raw.selection;
      }
      if (raw.from !== undefined) {
        out.from = raw.from;
      }
      if (raw.to !== undefined) {
        out.to = raw.to;
      }
      if (raw.stepFree !== undefined) {
        out.stepFree = raw.stepFree;
      }
      return out;
    });
}

/** Default schema, suitable for TanStack Router `validateSearch` (Standard Schema). */
export const appSearchParamsSchema = createAppSearchParamsSchema();

/** Safe parser: never throws; any invalid field falls back to its default or is dropped. */
export function parseAppSearchParams(
  input: unknown,
  defaults: Partial<AppSearchParamDefaults> = {},
): AppSearchParams {
  const schema =
    Object.keys(defaults).length === 0
      ? appSearchParamsSchema
      : createAppSearchParamsSchema(defaults);
  const result = schema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  return { ...DEFAULT_APP_SEARCH_PARAMS, ...defaults };
}

/**
 * Serialise to flat string params for links. Values equal to the defaults are omitted to
 * keep URLs short; `parseAppSearchParams(serializeAppSearchParams(p))` round-trips.
 */
export function serializeAppSearchParams(
  params: AppSearchParams,
  defaults: Partial<AppSearchParamDefaults> = {},
): Record<string, string> {
  const fallback: AppSearchParamDefaults = { ...DEFAULT_APP_SEARCH_PARAMS, ...defaults };
  const out: Record<string, string> = {};
  if (params.region !== fallback.region || params.hub !== undefined) {
    out.region = params.region;
  }
  if (params.module !== fallback.module) {
    out.module = params.module;
  }
  const optionalKeys = [
    'station',
    'complex',
    'line',
    'hub',
    'level',
    'selection',
    'from',
    'to',
  ] as const;
  for (const key of optionalKeys) {
    const value = params[key];
    if (value !== undefined) {
      out[key] = value;
    }
  }
  if (params.stepFree !== undefined) {
    out.stepFree = params.stepFree ? 'true' : 'false';
  }
  if (params.lang !== fallback.lang) {
    out.lang = params.lang;
  }
  if (params.theme !== fallback.theme) {
    out.theme = params.theme;
  }
  return out;
}
