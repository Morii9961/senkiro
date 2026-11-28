import { assertHonestFareQuote, type FareQuoteRequest } from '@senkiro/contracts';
import { FareRuleGraph, TrackGraphIndex } from '@senkiro/domain-core';
import { describe, expect, it } from 'vitest';
import {
  createFareEngineContext,
  type FareEngineContext,
  calculateFareQuote as quote,
} from '../src/index.ts';
import { createKantoJrRulePack } from '../src/packs/kanto-jr/index.ts';
import { dataset } from './fixtures/atlas.ts';

const trackGraph = new TrackGraphIndex(dataset);
const fareRuleGraph = new FareRuleGraph(trackGraph);
const ctx = createFareEngineContext(trackGraph, [
  createKantoJrRulePack({ trackGraph, fareRuleGraph }),
]);

function calculateFareQuote(request: FareQuoteRequest, context: FareEngineContext) {
  const result = quote(request, context);
  assertHonestFareQuote(result);
  if (result.status !== 'OK') {
    expect(result.totalAmountYen).toBeNull();
    expect(result.breakdown).toEqual([]);
  }
  return result;
}

describe('JR Fare Engine — Rule Verification Suite (≥25 assertions)', () => {
  it('1. Basic JR East trunk route (Tokyo -> Shinjuku via Chuo Line) computes OK in synthetic demo mode', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-east-shinjuku',
        travelDate: '2026-06-01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('OK');
    expect(q.isSyntheticTariff).toBe(true);
    expect(q.tariffDisclaimer).toContain('示例数据');
    expect(q.billedPath?.totalOperatingKm).toBe(10.3);
    expect(q.ruleVersionUsed).toBe('jr-fare-v2026');
    expect(q.validityDays).toBe(1);
    expect(q.stopoverAllowed).toBe(false);
    expect(q.totalAmountYen).not.toBeNull();
  });

  it('2. Art. 69(2) positive: Ueno -> Omiya via Oku bypass (7.6km) is billed via Oji (7.4km)', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-ueno',
        destinationStationId: 'sk:station:kanto:jr-east-omiya',
        routePreference: 'pack:oku_bypass',
        travelDate: '2026-06-01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('OK');
    expect(q.actualPath?.totalOperatingKm).toBe(26.9);
    expect(q.billedPath?.totalOperatingKm).toBe(26.7);
    expect(q.pathsDiffer).toBe(true);
    const art69Step = q.explanation.find((e) => e.ruleId === 'JR-ART69-2');
    expect(art69Step?.applied).toBe(true);
    expect(art69Step?.status).toBe('APPLIED');
  });

  it('3. Art. 69(4) positive outside Tokyo Suburban Area: Tokyo -> Mishima via Nishi-Oi (Yokosuka bypass) bills via Kawasaki (120.7km vs 123.6km)', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-central-mishima',
        routePreference: 'pack:yokosuka_bypass',
        travelDate: '2026-06-01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('OK');
    expect(q.actualPath?.totalOperatingKm).toBe(123.6);
    expect(q.billedPath?.totalOperatingKm).toBe(120.7);
    expect(q.pathsDiffer).toBe(true);
    expect(q.explanation.find((e) => e.ruleId === 'JR-ART69-4')?.applied).toBe(true);
    expect(q.explanation.find((e) => e.ruleId === 'JR-ART157-SUBURBAN')?.applied).toBe(false);
    expect(q.validityDays).toBe(2);
    expect(q.stopoverAllowed).toBe(true);
  });

  it('4. Art. 69(4) negative: Trip starting at intermediate station Nishi-Oi -> Yokohama does NOT trigger Art. 69(4)', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-nishi-oi',
        destinationStationId: 'sk:station:kanto:jr-east-yokohama',
        travelDate: '2026-06-01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('OK');
    expect(q.explanation.find((e) => e.ruleId === 'JR-ART69-4')).toBeUndefined();
    expect(q.billedPath?.totalOperatingKm).toBe(21.3);
  });

  it('5. Art. 69(3) boundary check + Art. 157(2) suburban rule: Akabane -> Omiya via Toda-Koen (18.0km) billed via Urawa (17.1km) by suburban rule', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-akabane',
        destinationStationId: 'sk:station:kanto:jr-east-omiya',
        routePreference: 'pack:saikyo_bypass',
        travelDate: '2026-06-01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('OK');
    expect(q.actualPath?.totalOperatingKm).toBe(18.0);
    expect(q.billedPath?.totalOperatingKm).toBe(17.1);
    expect(q.pathsDiffer).toBe(true);
    // Art. 69(3) requires stations strictly beyond both boundaries; suburban Art. 157(2) applies instead!
    expect(q.explanation.find((e) => e.ruleId === 'JR-ART69-3')?.applied).toBe(false);
    expect(q.explanation.find((e) => e.ruleId === 'JR-ART157-SUBURBAN')?.applied).toBe(true);
  });

  it('6. Metropolitan Suburban Area positive (detour): Tokyo -> Ueno via western Yamanote loop detour bills at shortest 3.6km', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-east-ueno',
        routePreference: 'pack:yamanote_loop_detour',
        travelDate: '2026-06-01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('OK');
    expect((q.actualPath?.totalOperatingKm ?? 0) > 25).toBe(true);
    expect(q.billedPath?.totalOperatingKm).toBe(3.6);
    expect(q.pathsDiffer).toBe(true);
    expect(q.explanation.find((e) => e.ruleId === 'JR-ART157-SUBURBAN')?.applied).toBe(true);
    expect(q.validityDays).toBe(1);
    expect(q.stopoverAllowed).toBe(false);
  });

  it('7. Metropolitan Suburban Area >100km edge: Tokyo -> Atami conventional (104.6km) is STILL inside Tokyo Suburban Area -> validity 1 day, NO stopover', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-east-atami',
        travelDate: '2026-06-01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('OK');
    expect(q.billedPath?.totalOperatingKm).toBe(104.6);
    expect(q.explanation.find((e) => e.ruleId === 'JR-ART157-SUBURBAN')?.applied).toBe(true);
    expect(q.validityDays).toBe(1);
    expect(q.stopoverAllowed).toBe(false);
  });

  it('8. Metropolitan Suburban Area negative (outside area): Tokyo -> Mishima (120.7km, JR Central) is OUTSIDE suburban area -> validity 2 days, stopover allowed', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-central-mishima',
        travelDate: '2026-06-01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('OK');
    expect(q.billedPath?.totalOperatingKm).toBe(120.7);
    expect(q.explanation.find((e) => e.ruleId === 'JR-ART157-SUBURBAN')?.applied).toBe(false);
    expect(q.validityDays).toBe(2);
    expect(q.stopoverAllowed).toBe(true);
  });

  it('9. Metropolitan Suburban Area negative (repeated station/segment): Tokyo -> Shinjuku -> Tokyo -> Ueno is REJECTED as NOT_APPLICABLE with null yen', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-east-ueno',
        viaStationIds: ['sk:station:kanto:jr-east-shinjuku', 'sk:station:kanto:jr-east-tokyo'],
        travelDate: '2026-06-01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('NOT_APPLICABLE');
    expect(q.totalAmountYen).toBeNull();
    expect(q.explanation.some((e) => e.ruleId === 'JR-ART157-SUBURBAN-NO-REPEAT')).toBe(true);
  });

  it('10. Metropolitan Suburban Area negative (stopover required): Tokyo -> Atami with requireStopover=true is REJECTED as NOT_APPLICABLE with null yen', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-east-atami',
        requireStopover: true,
        travelDate: '2026-06-01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('NOT_APPLICABLE');
    expect(q.totalAmountYen).toBeNull();
    expect(q.stopoverAllowed).toBe(false);
    expect(q.explanation.some((e) => e.ruleId === 'JR-ART156-SUBURBAN-NO-STOPOVER')).toBe(true);
  });

  it('11. Outside Suburban Area WITH stopover required (>100km): Tokyo -> Mishima with requireStopover=true succeeds', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-central-mishima',
        requireStopover: true,
        travelDate: '2026-06-01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('OK');
    expect(q.stopoverAllowed).toBe(true);
    expect(q.validityDays).toBe(2);
  });

  it('12. Art. 16-2 positive (Tohoku Shinkansen post-2026-03-14): Tokyo -> Omiya via Tohoku Shinkansen (JR East) STILL treated as same line (30.3km)', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-east-omiya',
        preferShinkansen: true,
        travelDate: '2026-06-01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('OK');
    expect(q.actualPath?.usesShinkansen).toBe(true);
    expect(q.billedPath?.totalOperatingKm).toBe(30.3);
    const step = q.explanation.find((e) => e.ruleId === 'JR-ART16-2-V2026');
    expect(step?.applied).toBe(true);
    expect(step?.status).toBe('APPLIED');
  });

  it('13. Art. 16-2 positive (pre-2026-03-14): Tokyo -> Atami via Tokaido Shinkansen on 2026-03-13 is treated as SAME line', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-east-atami',
        preferShinkansen: true,
        travelDate: '2026-03-13',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('OK');
    expect(q.ruleVersionUsed).toBe('jr-fare-v2025');
    const step = q.explanation.find((e) => e.ruleId === 'JR-ART16-2-V2025');
    expect(step?.applied).toBe(true);
    expect(step?.status).toBe('APPLIED');
    expect(q.billedPath?.totalOperatingKm).toBe(104.6);
  });

  it('14. Art. 16-2 EXCEPTION (2026-03-14 revision!): Tokyo -> Atami via Tokaido Shinkansen on 2026-03-14 is SEPARATE line (別線扱い)', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-east-atami',
        preferShinkansen: true,
        travelDate: '2026-03-14',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('OK');
    expect(q.ruleVersionUsed).toBe('jr-fare-v2026');
    const step = q.explanation.find((e) => e.ruleId === 'JR-ART16-2-V2026');
    expect(step?.applied).toBe(false);
    expect(step?.status).toBe('REJECTED');
    expect(q.billedPath?.usesShinkansen).toBe(true);
    expect(q.billedPath?.operatorsInvolved).toContain('sk:operator:jp:jr-central');
    expect(q.explanation.find((e) => e.ruleId === 'JR-ART157-SUBURBAN')?.applied).toBe(false);
  });

  it('15. Art. 16-2(2) EXCEPTION (intermediate connection station Shin-Yokohama): Shinagawa -> Shin-Yokohama on 2026-03-13 is SEPARATE line even before revision', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-central-shinagawa',
        destinationStationId: 'sk:station:kanto:jr-central-shin-yokohama',
        preferShinkansen: true,
        travelDate: '2026-03-13',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('OK');
    const step = q.explanation.find((e) => e.ruleId === 'JR-ART16-2-V2025');
    expect(step?.applied).toBe(false);
    expect(step?.status).toBe('REJECTED');
    expect(step?.articleRef).toContain('第2項');
  });

  it('16. Local Line conversion refusal (地方交通線 八高線): Tokyo -> Haijima returns UNSUPPORTED with null yen', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-east-haijima',
        travelDate: '2026-06-01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('UNSUPPORTED');
    expect(q.totalAmountYen).toBeNull();
    expect(q.explanation.some((e) => e.ruleId === 'JR-LOCAL-LINE-UNSUPPORTED')).toBe(true);
  });

  it('17. STALE_RULE: Future date beyond verified validity window (2028-01-01) refuses exact yen output', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-east-shinjuku',
        travelDate: '2028-01-01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('STALE_RULE');
    expect(q.totalAmountYen).toBeNull();
  });

  it('18. STALE_RULE: Historical date prior to earliest rule version (2019-09-30) refuses exact yen output', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-east-shinjuku',
        travelDate: '2019-09-30',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('STALE_RULE');
    expect(q.totalAmountYen).toBeNull();
  });

  it('19. MISSING_DATA: MissingTariffProvider refuses exact yen output', () => {
    const noTariffCtx = createFareEngineContext(trackGraph, [
      createKantoJrRulePack({ trackGraph, fareRuleGraph, tariffProviders: [] }),
    ]);
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-east-shinjuku',
        travelDate: '2026-06-01',
        ticketType: 'ordinary_paper',
      },
      noTariffCtx,
    );
    expect(q.status).toBe('MISSING_DATA');
    expect(q.totalAmountYen).toBeNull();
  });

  it('20. MISSING_DATA: Station not in database refuses exact yen output', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-east-nonexistent-999',
        travelDate: '2026-06-01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('MISSING_DATA');
    expect(q.totalAmountYen).toBeNull();
  });

  it('21. NOT_APPLICABLE: Non-JR station (Tokyo Metro Otemachi) refuses exact yen output', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:tokyo-metro-otemachi',
        destinationStationId: 'sk:station:kanto:jr-east-shinjuku',
        travelDate: '2026-06-01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('NOT_APPLICABLE');
    expect(q.totalAmountYen).toBeNull();
  });

  it('22. UNSUPPORTED: JR station outside verified fare slice (Joban Line Ayase) refuses exact yen output', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-east-ayase',
        travelDate: '2026-06-01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('UNSUPPORTED');
    expect(q.totalAmountYen).toBeNull();
  });

  it('23. UNSUPPORTED: IC card ticket type returns UNSUPPORTED with explanation and null yen', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-east-shinjuku',
        travelDate: '2026-06-01',
        ticketType: 'ic_card',
      },
      ctx,
    );
    expect(q.status).toBe('UNSUPPORTED');
    expect(q.totalAmountYen).toBeNull();
    expect(q.explanation.some((e) => e.ruleId === 'JR-TICKET-IC-UNSUPPORTED')).toBe(true);
  });

  it('24. ERROR: Malformed travel date returns ERROR with null yen', () => {
    const q = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-east-shinjuku',
        travelDate: '2026/06/01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q.status).toBe('ERROR');
    expect(q.totalAmountYen).toBeNull();
  });

  it('25. Cross-company rule versioning: Tokyo -> Mishima uses unified breakdown in v2025 vs per-company breakdown in v2026', () => {
    const q2025 = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-central-mishima',
        travelDate: '2026-03-13',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    const q2026 = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-central-mishima',
        travelDate: '2026-03-14',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(q2025.status).toBe('OK');
    expect(q2026.status).toBe('OK');
    expect(q2025.explanation.some((e) => e.ruleId === 'JR-CROSS-COMPANY-V2025')).toBe(true);
    expect(q2026.explanation.some((e) => e.ruleId === 'JR-CROSS-COMPANY-V2026')).toBe(true);
    expect(q2026.breakdown.filter((b) => b.productKind === 'base_fare').length).toBe(2);
  });

  it('26. Surcharge FareProduct layer (Should #17): Shinkansen Gran Class succeeds as separate surcharge; conventional Gran Class is rejected', () => {
    const qShink = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-east-omiya',
        preferShinkansen: true,
        surchargeType: 'gran_class',
        travelDate: '2026-06-01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(qShink.status).toBe('OK');
    expect(qShink.breakdown.some((b) => b.productKind === 'base_fare')).toBe(true);
    expect(qShink.breakdown.some((b) => b.productKind === 'surcharge')).toBe(true);

    const qConv = calculateFareQuote(
      {
        originStationId: 'sk:station:kanto:jr-east-tokyo',
        destinationStationId: 'sk:station:kanto:jr-east-omiya',
        preferShinkansen: false,
        surchargeType: 'gran_class',
        travelDate: '2026-06-01',
        ticketType: 'ordinary_paper',
      },
      ctx,
    );
    expect(qConv.status).toBe('NOT_APPLICABLE');
    expect(qConv.totalAmountYen).toBeNull();
  });
});
