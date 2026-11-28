/**
 * EXAMPLE MODE — SYNTHETIC DATA.
 *
 * A fixed, hand-written snapshot that exists only to show what the overlay
 * interface looks like when it is filled in. Nothing here was observed:
 *   - the statuses and the delay figure are made up;
 *   - the departure times are made up and correspond to no timetable;
 *   - the snapshot carries a fixed, obviously artificial timestamp rather than
 *     "now", so it can never pass for a live reading.
 * The UI shows a permanent banner whenever `isSynthetic` is true.
 */
import type { OperationOverlayProvider, OperationSnapshot, OverlayResult } from '../domain/overlay';

export const EXAMPLE_SOURCE_ID = 'src:senkiro-lab-schematic';

/** Fixed on purpose. Not the current time. */
export const EXAMPLE_TIMESTAMP = '2000-01-01T00:00:00+09:00';

const P = (island: string) => `sk:platform:jr-east-shinjuku-${island}`;

export const EXAMPLE_SNAPSHOT: OperationSnapshot = {
  sourceId: EXAMPLE_SOURCE_ID,
  sourceTitle: 'SENKIRO Lab example data (synthetic)',
  dataNature: 'synthetic',
  isSynthetic: true,
  fetchedAt: EXAMPLE_TIMESTAMP,
  disclaimer:
    'SAMPLE ONLY. Invented statuses and times that illustrate the overlay interface. Not real operations, not a timetable.',
  lineStatuses: [
    { railLineId: 'sk:line:jr-east-yamanote', status: 'normal', delayMinutes: null, messageJa: '【サンプル】平常運転', messageEn: '[SAMPLE] Normal service', observedAt: EXAMPLE_TIMESTAMP },
    { railLineId: 'sk:line:jr-east-chuo-rapid', status: 'delayed', delayMinutes: 10, messageJa: '【サンプル】遅延（架空の例）', messageEn: '[SAMPLE] Delayed (fictional example)', observedAt: EXAMPLE_TIMESTAMP },
    { railLineId: 'sk:line:jr-east-chuo-sobu-local', status: 'normal', delayMinutes: null, messageJa: '【サンプル】平常運転', messageEn: '[SAMPLE] Normal service', observedAt: EXAMPLE_TIMESTAMP },
    { railLineId: 'sk:line:jr-east-saikyo', status: 'partial-suspension', delayMinutes: null, messageJa: '【サンプル】一部区間で運転見合わせ（架空の例）', messageEn: '[SAMPLE] Partly suspended (fictional example)', observedAt: EXAMPLE_TIMESTAMP },
    { railLineId: 'sk:line:jr-east-shonan-shinjuku', status: 'unknown', delayMinutes: null, messageJa: '【サンプル】情報なし', messageEn: '[SAMPLE] No information', observedAt: null },
  ],
  departures: [
    { platformId: P('13-14'), trackNumber: '14', railLineId: 'sk:line:jr-east-yamanote', scheduledTime: '00:03', estimatedTime: null, destinationJa: '【サンプル】渋谷・品川方面', destinationEn: '[SAMPLE] for Shibuya, Shinagawa', trainTypeJa: null },
    { platformId: P('15-16'), trackNumber: '15', railLineId: 'sk:line:jr-east-yamanote', scheduledTime: '00:04', estimatedTime: null, destinationJa: '【サンプル】池袋・上野方面', destinationEn: '[SAMPLE] for Ikebukuro, Ueno', trainTypeJa: null },
    { platformId: P('7-8'), trackNumber: '8', railLineId: 'sk:line:jr-east-chuo-rapid', scheduledTime: '00:05', estimatedTime: '00:15', destinationJa: '【サンプル】東京', destinationEn: '[SAMPLE] Tokyo', trainTypeJa: '快速' },
    { platformId: P('11-12'), trackNumber: '12', railLineId: 'sk:line:jr-east-chuo-rapid', scheduledTime: '00:06', estimatedTime: '00:16', destinationJa: '【サンプル】高尾', destinationEn: '[SAMPLE] Takao', trainTypeJa: '快速' },
    { platformId: P('1-2'), trackNumber: '2', railLineId: 'sk:line:jr-east-saikyo', scheduledTime: '00:08', estimatedTime: null, destinationJa: '【サンプル】大宮', destinationEn: '[SAMPLE] Omiya', trainTypeJa: null },
  ],
};

export function createExampleOverlayProvider(): OperationOverlayProvider {
  return {
    id: 'example',
    label: { ja: 'サンプルモード（合成データ）', en: 'Example mode (synthetic data)', zh: '示例模式（合成数据）' },
    live: false,
    async getSnapshot(): Promise<OverlayResult> {
      return { status: 'ok', snapshot: structuredClone(EXAMPLE_SNAPSHOT) };
    },
  };
}
