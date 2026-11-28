/**
 * Test fixtures. Every value here is a structural placeholder for contract tests only:
 * station names, distances and yen amounts are NOT railway facts and must never be copied
 * into a dataset.
 */
import {
  COMMEMORATIVE_WATERMARK,
  type CommemorativeTicket,
  type FareBreakdownItem,
  type FareQuoteDraft,
  makeLocalizedNames,
  type Provenance,
  type SourceRecord,
} from '../src/index.ts';

export const testProvenance: Provenance = {
  sourceIds: ['sk:source:jp:test-fixture'],
  dataNature: 'synthetic',
  lastVerifiedAt: null,
};

export function breakdownItem(amountYen: number | null): FareBreakdownItem {
  return {
    label: 'fixture base fare',
    productKind: 'base_fare',
    operatorId: 'sk:operator:jp:test-operator',
    distanceKm: null,
    amountYen,
    dataNature: 'synthetic',
    notes: 'test fixture, not a real fare',
  };
}

export function quoteDraft(overrides: Partial<FareQuoteDraft> = {}): FareQuoteDraft {
  return {
    id: 'sk:quote:kansai:test-quote',
    status: 'OK',
    statusReason: 'fixture',
    request: {
      originStationId: 'sk:station:kansai:test-a',
      destinationStationId: 'sk:station:kansai:test-b',
      travelDate: '2026-11-28',
      ticketType: 'ic_card',
    },
    isSyntheticTariff: true,
    tariffDisclaimer: 'Synthetic test tariff, not an official fare.',
    actualPath: null,
    billedPath: null,
    pathsDiffer: false,
    pathDiffSummary: null,
    validityDays: null,
    stopoverAllowed: null,
    totalAmountYen: 300,
    breakdown: [breakdownItem(200), breakdownItem(100)],
    explanation: [],
    ruleVersionUsed: null,
    provenance: testProvenance,
    ...overrides,
  };
}

export function ticket(overrides: Record<string, unknown> = {}): CommemorativeTicket {
  return {
    id: 'sk:ticket:jp:test-ticket',
    externalIds: {},
    names: makeLocalizedNames(),
    provenance: { ...testProvenance, dataNature: 'derived' },
    validFrom: null,
    validTo: null,
    rideId: null,
    templateId: 'kansai-maroon',
    displayOrigin: makeLocalizedNames({ ja: '試験駅A' }),
    displayDestination: makeLocalizedNames({ ja: '試験駅B' }),
    travelDate: '2026-11-28',
    seatClassLabel: null,
    nonValidWatermark: COMMEMORATIVE_WATERMARK,
    allowsBarcode: false,
    ...overrides,
  } as CommemorativeTicket;
}

export function source(id: string, shareAlike: SourceRecord['shareAlike']): SourceRecord {
  return {
    id,
    title: `fixture ${id}`,
    publisher: 'fixture',
    url: null,
    retrievedAt: '2026-11-28',
    sourceDate: null,
    license: shareAlike === true ? 'ODbL-1.0' : 'CC-BY-4.0',
    licenseUrl: null,
    commercialUse: 'yes',
    redistribution: 'yes',
    shareAlike,
    attributionText: 'fixture',
    notes: '',
  };
}
