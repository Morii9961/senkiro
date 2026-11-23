import type { ExitInfo } from '../../src/domain/index.ts'

export const exits: ExitInfo[] = [
  {
    placeId: 'sk:entrance:midosuji-south',
    exitLabel: { ja: '御堂筋南口', en: 'Midosuji South Exit' },
    surfaceNote: null,
    provenance: { dataNature: 'manual-verified', lastVerifiedAt: '2026-11-23', sourceIds: ['sk:source:jr-map'] },
  },
  {
    placeId: 'sk:entrance:jr-midosuji-north',
    exitLabel: { ja: '御堂筋北口', en: 'Midosuji North Exit' },
    surfaceNote: null,
    provenance: { dataNature: 'manual-verified', lastVerifiedAt: '2026-11-23', sourceIds: ['sk:source:jr-map'] },
  },
  {
    placeId: 'sk:entrance:jr-central-south',
    exitLabel: { ja: '中央南口', en: 'Central South Exit' },
    surfaceNote: null,
    provenance: { dataNature: 'manual-verified', lastVerifiedAt: '2026-11-23', sourceIds: ['sk:source:jr-map'] },
  },
  {
    placeId: 'sk:entrance:surface-crossing',
    exitLabel: null,
    surfaceNote: {
      ja: 'JR大阪駅の御堂筋口付近からバスターミナルへ向かう途中の地上横断歩道',
      en: 'Street-level crossing between the Midosuji gate area of JR Osaka Station and the bus terminal',
    },
    provenance: { dataNature: 'manual-verified', lastVerifiedAt: '2026-11-23', sourceIds: ['sk:source:city-b'] },
  },
]
