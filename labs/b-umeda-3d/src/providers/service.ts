import type { PlatformUpdate } from '../domain/types'
export type ServiceFeed =
  | { mode: 'unavailable'; reason: 'no-licensed-feed' }
  | { mode: 'example' | 'live'; updates: PlatformUpdate[] }
export interface ServiceProvider {
  read(): ServiceFeed | Promise<ServiceFeed>
}
export const liveService: ServiceProvider = {
  read: () => ({ mode: 'unavailable', reason: 'no-licensed-feed' }),
}
// Synthetic fixture: the timestamp, schedule and delay are invented solely for the opt-in example.
export const exampleService = {
  mode: 'example',
  updates: [
    {
      id: 'sk:update:demo-umeda-one',
      externalIds: {},
      names: {
        ja: 'サンプル運行情報',
        en: 'Example platform update',
        ja_kana: null,
        zh: null,
      },
      provenance: {
        sourceIds: ['sk:source:fixture'],
        dataNature: 'synthetic',
        lastVerifiedAt: '2026-11-21',
      },
      validFrom: null,
      validTo: null,
      geometry_confidence: 'unknown',
      lineId: 'sk:line:midosuji',
      platformId: 'sk:platform:metro-1',
      status: 'delayed',
      delayMinutes: 3,
      observedAt: '2000-01-01T09:00:00+09:00',
      scheduledAt: '2000-01-01T09:04:00+09:00',
      sourceId: 'sk:source:fixture',
      dataNature: 'synthetic',
    },
  ],
} satisfies ServiceFeed
export const sample = exampleService.updates[0]
