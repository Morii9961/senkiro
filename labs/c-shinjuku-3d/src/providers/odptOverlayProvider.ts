/**
 * Live operations overlay from the Public Transportation Open Data Center —
 * for LOCAL TESTING ONLY.
 *
 * The JR East datasets are published under the 公共交通オープンデータチャレンジ
 * 限定ライセンス (Challenge-limited, ends 2027-03-12, with JR East specific
 * conditions). The project owner decided on 2026-11-12 that they may be used
 * for local testing. Nothing fetched is stored or committed.
 *
 * The developer key never reaches the browser: it is read from ODPT_CONSUMER_KEY
 * in the repository-root .env.local by a proxy that exists only inside the Vite
 * development server (see vite.config.ts). A production build has no proxy, so
 * there this provider answers "unavailable" — it never invents data.
 */
import type { OperationOverlayProvider, OverlayResult, OverlayUnavailableReason } from '../domain/overlay';
import type { StationModel } from '../domain/types';
import { ODPT_TRAIN_SOURCE_ID, mapOdpt, type OdptPayload } from './odptMapping';

export const ODPT_KEY_VARIABLE = 'ODPT_CONSUMER_KEY';
export const ODPT_PROXY_PATH = '/__odpt/snapshot';

const REASONS: OverlayUnavailableReason[] = ['missing-key', 'network-error', 'bad-response', 'license-restricted', 'not-implemented'];

export function createOdptOverlayProvider(
  model: StationModel,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  /** The proxy exists only in the Vite development server. */
  hasProxy: boolean = import.meta.env.DEV,
): OperationOverlayProvider {
  const unavailable = (reason: OverlayUnavailableReason, detail: string): OverlayResult => ({ status: 'unavailable', reason, detail, sourceId: ODPT_TRAIN_SOURCE_ID });
  return {
    id: 'odpt-jreast',
    label: {
      ja: 'ODPT 実データ（JR東日本・ローカル試験用）',
      en: 'ODPT live data (JR East, local testing)',
      zh: 'ODPT 真实数据（JR东日本，仅本地测试）',
    },
    live: true,
    async getSnapshot(): Promise<OverlayResult> {
      const noProxy = `No development proxy at ${ODPT_PROXY_PATH}. Start with "npm run dev" and set ${ODPT_KEY_VARIABLE} in the repository-root .env.local.`;
      if (!hasProxy) return unavailable('missing-key', noProxy);
      let res: Response;
      try {
        res = await fetchImpl(ODPT_PROXY_PATH, { headers: { accept: 'application/json' }, cache: 'no-store' });
      } catch {
        return unavailable('network-error', 'The development proxy could not be reached.');
      }
      if (!(res.headers.get('content-type') ?? '').includes('json')) {
        // a static build or `vite preview`: there is no proxy, hence no key
        return unavailable('missing-key', noProxy);
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return unavailable('bad-response', 'The proxy did not return JSON.');
      }
      if (!res.ok) {
        const code = (body as { error?: string } | null)?.error;
        const reason = REASONS.find((r) => r === code) ?? 'network-error';
        return unavailable(reason, reason === 'missing-key' ? `${ODPT_KEY_VARIABLE} is not set in the repository-root .env.local.` : 'The ODPT request failed.');
      }
      const snapshot = mapOdpt(model, body as OdptPayload);
      if (!snapshot) return unavailable('bad-response', 'The ODPT response did not have the expected shape.');
      return { status: 'ok', snapshot };
    },
  };
}
