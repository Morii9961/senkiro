import type { FareExplanationStep, FareRule, SkId } from '@senkiro/contracts';

export const EAST = 'sk:operator:jp:jr-east' satisfies SkId<'operator'>;
export const CENTRAL = 'sk:operator:jp:jr-central' satisfies SkId<'operator'>;
export type JrOperatorScope = 'jr-east' | 'jr-central';
export const SUBURBAN = 'suburban:tokyo';
export const SLICE = 'slice:jr-east-kanto';
export const SPECIAL_URL = 'https://www.jreast.co.jp/kippu/1101.html';
export const SUBURBAN_URL = 'https://www.jreast.co.jp/kippu/1103.html';
export const RULE_URL = 'https://www.jreast.co.jp/ryokaku/';

export const VERSIONS = [
  { ruleVersion: 'jr-fare-v2025', validFrom: '2020-04-01', validTo: '2026-03-13' },
  { ruleVersion: 'jr-fare-v2026', validFrom: '2026-03-14', validTo: '2027-03-31' },
] as const;

export function isRevised(date: string): boolean {
  return date >= VERSIONS[1].validFrom;
}

export const station = (slug: string): SkId<'station'> => `sk:station:kanto:${slug}`;
export const line = (slug: string): SkId<'line'> => `sk:line:kanto:${slug}`;

export const corridors = [
  {
    number: 2,
    boundaryA: station('jr-east-nippori'),
    boundaryB: station('jr-east-akabane'),
    preferredLineId: line('jr-east-tohoku'),
    avoidLineId: line('jr-east-tohoku-oku'),
  },
  {
    number: 3,
    boundaryA: station('jr-east-akabane'),
    boundaryB: station('jr-east-omiya'),
    preferredLineId: line('jr-east-tohoku'),
    avoidLineId: line('jr-east-tohoku-saikyo'),
  },
  {
    number: 4,
    boundaryA: station('jr-east-shinagawa'),
    boundaryB: station('jr-east-tsurumi'),
    preferredLineId: line('jr-east-tokaido'),
    avoidLineId: line('jr-east-tokaido-hinkaku'),
  },
] as const;

interface RuleMetadata {
  ruleId: string;
  articleRef: string;
  officialUrl: string;
  source: string;
  category: FareRule['category'];
  summary: string;
}

const metadata: RuleMetadata[] = [
  ...VERSIONS.map(
    ({ ruleVersion }, index): RuleMetadata => ({
      ruleId: index === 0 ? 'JR-ART16-2-V2025' : 'JR-ART16-2-V2026',
      articleRef: '旅客営業規則 第16条の2',
      officialUrl: SPECIAL_URL,
      source: 'jr-east-kippu-1101',
      category: 'shinkansen_equivalence',
      summary: `Shinkansen and parallel conventional line equivalence (${ruleVersion}).`,
    }),
  ),
  ...corridors.map(
    ({ number }): RuleMetadata => ({
      ruleId: `JR-ART69-${number}`,
      articleRef: `旅客営業規則 第69条第1項第${number}号`,
      officialUrl: SPECIAL_URL,
      source: 'jr-east-kippu-1101',
      category: 'specific_section',
      summary: 'Specific-section billing via the prescribed corridor.',
    }),
  ),
  {
    ruleId: 'JR-ART157-SUBURBAN',
    articleRef: '旅客営業規則 第156条・第157条第2項',
    officialUrl: SUBURBAN_URL,
    source: 'jr-east-kippu-1103',
    category: 'suburban_area',
    summary: 'Shortest billing route inside the Tokyo suburban area.',
  },
  {
    ruleId: 'JR-ART157-SUBURBAN-NO-REPEAT',
    articleRef: '旅客営業規則 第68条・第157条第2項',
    officialUrl: SUBURBAN_URL,
    source: 'jr-east-kippu-1103',
    category: 'suburban_area',
    summary: 'A repeated station or segment needs separate tickets.',
  },
  {
    ruleId: 'JR-ART156-SUBURBAN-NO-STOPOVER',
    articleRef: '旅客営業規則 第156条第2号',
    officialUrl: SUBURBAN_URL,
    source: 'jr-east-kippu-1103',
    category: 'suburban_area',
    summary: 'Suburban-only tickets do not allow stopovers.',
  },
  {
    ruleId: 'JR-ART156-UNDER-100KM',
    articleRef: '旅客営業規則 第156条第1号',
    officialUrl: SUBURBAN_URL,
    source: 'jr-east-kippu-1103',
    category: 'base_fare',
    summary: 'Journeys of at most 100 km do not allow stopovers.',
  },
  {
    ruleId: 'JR-LOCAL-LINE-UNSUPPORTED',
    articleRef: '地方交通線の運賃計算',
    officialUrl: RULE_URL,
    source: 'jr-east-ryokaku-2026',
    category: 'local_line_conversion',
    summary: 'Local-line conversion distances are unavailable in this pack.',
  },
  {
    ruleId: 'JR-TICKET-IC-UNSUPPORTED',
    articleRef: 'ICカード乗車券',
    officialUrl: RULE_URL,
    source: 'jr-east-ryokaku-2026',
    category: 'base_fare',
    summary: 'Only ordinary paper tickets are supported in this slice.',
  },
  {
    ruleId: 'JR-CROSS-COMPANY-V2025',
    articleRef: '本州内の営業キロ通算',
    officialUrl: RULE_URL,
    source: 'jr-east-ryokaku-2026',
    category: 'cross_company',
    summary: 'Pre-revision through-distance pricing on the demo tariff.',
  },
  {
    ruleId: 'JR-CROSS-COMPANY-V2026',
    articleRef: '2026年3月14日改定・跨社計算',
    officialUrl: RULE_URL,
    source: 'jr-east-ryokaku-2026',
    category: 'cross_company',
    summary:
      'Post-revision per-company demo breakdown. The amounts and pricing units are illustrative.',
  },
  {
    ruleId: 'JR-ART67-BASE',
    articleRef: '旅客営業規則 第14条・第67条',
    officialUrl: RULE_URL,
    source: 'jr-east-ryokaku-2026',
    category: 'base_fare',
    summary: 'Look up the base fare from billing distance.',
  },
];

export const rules: FareRule[] = metadata.map(({ source, ...rule }) => ({
  ...rule,
  id: `sk:rule:kanto:${rule.ruleId.toLowerCase()}`,
  operatorScope: 'jr-east',
  externalIds: {},
  names: { ja: null, ja_kana: null, en: null, zh: null },
  provenance: {
    sourceIds: [`sk:source:kanto:${source}`],
    dataNature: 'derived',
    lastVerifiedAt: null,
  },
  validFrom: null,
  validTo: null,
  preconditions: [],
  exceptions: [],
}));

const ruleById = new Map(rules.map((rule) => [rule.ruleId, rule]));

export function explain(
  ruleId: string,
  status: FareExplanationStep['status'],
  reason?: string,
): FareExplanationStep {
  const rule = ruleById.get(ruleId);
  if (!rule) {
    throw new Error(`Unknown Kanto JR rule: ${ruleId}`);
  }
  return {
    ruleId,
    articleRef: rule.articleRef,
    officialUrl: rule.officialUrl,
    applied: status === 'APPLIED',
    status,
    reason: reason ?? rule.summary,
  };
}
