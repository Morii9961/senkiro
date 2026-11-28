import type { Provenance, SourceRecord } from '@senkiro/contracts';

/** Clearly fictional test fixtures — not railway facts. */
export const TEST_SOURCE: SourceRecord = {
  id: 'sk:source:jp:test-fixture',
  title: 'Test fixture source',
  publisher: 'SENKIRO test suite',
  url: 'https://example.com/source',
  retrievedAt: '2026-11-28',
  sourceDate: null,
  license: 'CC0-1.0',
  licenseUrl: null,
  commercialUse: 'yes',
  redistribution: 'yes',
  shareAlike: false,
  attributionText: 'Test',
  notes: '',
};

export const OFFICIAL: Provenance = {
  sourceIds: ['sk:source:jp:test-fixture'],
  dataNature: 'official',
  lastVerifiedAt: '2026-11-01',
};

export const SYNTHETIC: Provenance = {
  sourceIds: [],
  dataNature: 'synthetic',
  lastVerifiedAt: null,
};
