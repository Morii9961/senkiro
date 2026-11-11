/**
 * Live operations overlay from the Public Transportation Open Data Center.
 *
 * STATUS: deliberately not wired to the network.
 *
 * The dataset that would feed it — "JR東日本 鉄道関連情報 / Train information
 * of JR East" (https://ckan.odpt.org/dataset/jreast_tokyo_area) — is published
 * under the 公共交通オープンデータチャレンジ限定ライセンス with JR East specific
 * conditions: use is limited to the ODPT Challenge, the licence ends on
 * 2027-03-12, and services competing with JR East are excluded. SENKIRO has
 * not entered the Challenge and nobody has decided whether those terms are
 * acceptable, so per the shared contract (§1.8) the data is not used.
 *
 * A key would also have to stay server-side: the contract reads
 * ODPT_CONSUMER_KEY from the repository-root .env.local, and a browser bundle
 * must never contain it. This prototype has no server, so the provider only
 * ever answers "unavailable" with the reason — never with invented data.
 */
import type { OperationOverlayProvider, OverlayResult } from '../domain/overlay';

export const ODPT_KEY_VARIABLE = 'ODPT_CONSUMER_KEY';
export const ODPT_TRAIN_INFORMATION_SOURCE_ID = 'src:odpt-jreast-train-information';

export interface OdptProviderConfig {
  /** Present only when a server-side proxy holds the key. Never a key itself. */
  proxyUrl?: string;
  /** Must be set explicitly once someone has accepted the licence terms. */
  licenseAccepted?: boolean;
}

export function createOdptOverlayProvider(config: OdptProviderConfig = {}): OperationOverlayProvider {
  return {
    id: 'odpt-jreast',
    label: {
      ja: 'ODPT（JR東日本 鉄道関連情報）',
      en: 'ODPT (JR East train information)',
      zh: 'ODPT（JR东日本列车运行信息）',
    },
    live: true,
    async getSnapshot(): Promise<OverlayResult> {
      if (!config.licenseAccepted) {
        return {
          status: 'unavailable',
          reason: 'license-restricted',
          sourceId: ODPT_TRAIN_INFORMATION_SOURCE_ID,
          detail:
            'The dataset is under the ODPT Challenge-limited licence (ends 2027-03-12, JR East specific conditions). Its use has not been approved for this project.',
        };
      }
      if (!config.proxyUrl) {
        return {
          status: 'unavailable',
          reason: 'missing-key',
          sourceId: ODPT_TRAIN_INFORMATION_SOURCE_ID,
          detail: `No server-side proxy is configured. ${ODPT_KEY_VARIABLE} must stay in the repository-root .env.local and never be shipped to the browser.`,
        };
      }
      return {
        status: 'unavailable',
        reason: 'not-implemented',
        sourceId: ODPT_TRAIN_INFORMATION_SOURCE_ID,
        detail:
          'Mapping the GTFS / GTFS-RT feed onto LineStatus and TrackDeparture is not implemented in this prototype.',
      };
    },
  };
}
