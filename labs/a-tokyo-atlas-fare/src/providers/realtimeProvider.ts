/**
 * Realtime Train Operations Provider Interface & Keyless Honest Degradation (Should #20).
 *
 * Honesty Rule (Shared Contract §1.6):
 * When no authorized realtime feed or API key is configured, return an explicit
 * `unavailable` state ("无实时数据 / No real-time data"). NEVER fabricate or animate
 * simulated train positions or delays.
 */

import type { RealtimeServiceStatus, SkId } from '../domain/types.js';

export interface RealtimeStatusProvider {
  readonly providerId: string;
  readonly isConfigured: boolean;
  getOperatorStatus(operatorId: SkId<'operator'>): Promise<RealtimeServiceStatus>;
}

export class OdptRealtimeProvider implements RealtimeStatusProvider {
  readonly providerId = 'odpt-realtime-adapter';
  readonly isConfigured: boolean;

  constructor(private readonly consumerKey: string | null = null) {
    this.isConfigured = Boolean(consumerKey && consumerKey.trim().length > 0);
  }

  async getOperatorStatus(operatorId: SkId<'operator'>): Promise<RealtimeServiceStatus> {
    if (!this.isConfigured) {
      return {
        operatorId,
        railLineId: null,
        status: 'unavailable',
        summary:
          '無実時データ / No real-time data（ODPT_CONSUMER_KEY 未設定・キーレス動作中。列車位置や遅延の疑似表示は行いません）',
        observedAt: null,
        sourceId: null,
        dataNature: 'unknown',
      };
    }

    // Extension point for future authorized ODPT consumer key integration
    try {
      const opMap: Partial<Record<SkId<'operator'>, string>> = {
        'sk:operator:toei': 'odpt.Operator:Toei',
        'sk:operator:tokyo-metro': 'odpt.Operator:TokyoMetro',
        'sk:operator:jr-east': 'odpt.Operator:JR-East',
      };
      const odptOp = opMap[operatorId];
      if (!odptOp) {
        return {
          operatorId,
          railLineId: null,
          status: 'unavailable',
          summary: '対象事業者のODPTリアルタイム運行情報は未対応です。',
          observedAt: null,
          sourceId: null,
          dataNature: 'unknown',
        };
      }
      const url = `https://api.odpt.org/api/v4/odpt:TrainInformation?odpt:operator=${encodeURIComponent(odptOp)}&acl:consumerKey=${encodeURIComponent(this.consumerKey!)}`;
      const res = await fetch(url);
      if (!res.ok) {
        return {
          operatorId,
          railLineId: null,
          status: 'unavailable',
          summary: `ODPT リアルタイムAPI応答エラー（HTTP ${res.status}）`,
          observedAt: null,
          sourceId: null,
          dataNature: 'unknown',
        };
      }
      const rows = (await res.json()) as Array<{
        'odpt:trainInformationText'?: { ja?: string; en?: string };
        'dc:date'?: string;
      }>;
      const first = rows[0];
      return {
        operatorId,
        railLineId: null,
        status: first ? 'normal' : 'unavailable',
        summary:
          first?.['odpt:trainInformationText']?.ja ??
          '運行情報レコードが空のため判定不可。',
        observedAt: first?.['dc:date'] ?? null,
        sourceId: 'src-odpt-toei-gtfs',
        dataNature: 'official',
      };
    } catch {
      return {
        operatorId,
        railLineId: null,
        status: 'unavailable',
        summary: 'リアルタイム運行情報への接続に失敗しました（オフラインまたは認証不可）。',
        observedAt: null,
        sourceId: null,
        dataNature: 'unknown',
      };
    }
  }
}
