/**
 * Hub quick-entry catalogue (decision D-02: Umeda + Kyoto in Kansai, Shinjuku in Kanto).
 *
 * Only place names live here; no station, platform or structure facts. `status` records
 * honestly whether in-station data can be shown in Phase 0:
 * - `slot-pending`: data exists in the Lab baselines and arrives through the
 *   `@senkiro/station-3d` slot once the coordinator wires it.
 * - `phase-1-placeholder`: no data yet (Kyoto is built in Phase 1).
 */
import {
  APP_HUBS,
  type AppHub,
  type AppRegion,
  HUB_REGION,
  type LocalizedNames,
  makeLocalizedNames,
} from '@senkiro/contracts';

export type HubStatus = 'slot-pending' | 'phase-1-placeholder';

export interface HubEntry {
  id: AppHub;
  region: AppRegion;
  names: LocalizedNames;
  status: HubStatus;
}

const NAMES: Readonly<Record<AppHub, LocalizedNames>> = {
  umeda: makeLocalizedNames({ ja: '梅田', ja_kana: 'うめだ', en: 'Umeda', zh: '梅田' }),
  kyoto: makeLocalizedNames({ ja: '京都', ja_kana: 'きょうと', en: 'Kyoto', zh: '京都' }),
  shinjuku: makeLocalizedNames({ ja: '新宿', ja_kana: 'しんじゅく', en: 'Shinjuku', zh: '新宿' }),
};

const STATUS: Readonly<Record<AppHub, HubStatus>> = {
  umeda: 'slot-pending',
  kyoto: 'phase-1-placeholder',
  shinjuku: 'slot-pending',
};

export const HUBS: readonly HubEntry[] = APP_HUBS.map((id) => ({
  id,
  region: HUB_REGION[id],
  names: NAMES[id],
  status: STATUS[id],
}));

export function getHub(id: AppHub): HubEntry {
  const hub = HUBS.find((entry) => entry.id === id);
  if (hub === undefined) {
    throw new Error(`unknown hub ${id}`);
  }
  return hub;
}
