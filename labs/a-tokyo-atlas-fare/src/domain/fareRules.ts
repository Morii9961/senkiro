/**
 * Versioned JR Passenger Operating Rules (旅客営業規則) Registry & Conditional Predicates.
 * Pure TypeScript — travelDate selects the active rule version; out-of-range dates yield STALE_RULE.
 */

import type { FareRule, ResolvedPath, SkId } from './types.js';

export interface RuleVersionConfig {
  versionId: 'jr-fare-v2025' | 'jr-fare-v2026';
  label: string;
  validFrom: string; // YYYY-MM-DD inclusive
  validTo: string; // YYYY-MM-DD inclusive
  tokaidoShinkansenTokyoAtamiSameLine: boolean;
  tohokuShinkansenTokyoOmiyaSameLine: boolean;
  shinagawaOdawaraIntermediateException: boolean;
  tokyoTierUnifiedToTrunk: boolean;
  crossCompanyAddonModel: boolean;
}

export const JR_RULE_VERSIONS: RuleVersionConfig[] = [
  {
    versionId: 'jr-fare-v2025',
    label: 'JR 旅客営業規則（2026年3月13日以前版）',
    validFrom: '2020-04-01',
    validTo: '2026-03-13',
    tokaidoShinkansenTokyoAtamiSameLine: true,
    tohokuShinkansenTokyoOmiyaSameLine: true,
    shinagawaOdawaraIntermediateException: true,
    tokyoTierUnifiedToTrunk: false,
    crossCompanyAddonModel: false,
  },
  {
    versionId: 'jr-fare-v2026',
    label: 'JR 旅客営業規則（2026年3月14日改定版）',
    validFrom: '2026-03-14',
    validTo: '2027-03-31',
    tokaidoShinkansenTokyoAtamiSameLine: false,
    tohokuShinkansenTokyoOmiyaSameLine: true,
    shinagawaOdawaraIntermediateException: true,
    tokyoTierUnifiedToTrunk: true,
    crossCompanyAddonModel: true,
  },
];

export function resolveRuleVersion(travelDate: string): RuleVersionConfig | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(travelDate)) return null;
  for (const cfg of JR_RULE_VERSIONS) {
    if (travelDate >= cfg.validFrom && travelDate <= cfg.validTo) {
      return cfg;
    }
  }
  return null;
}

export interface SpecificSectionDefinition {
  ruleId: string;
  articleRef: string;
  officialUrl: string;
  label: string;
  boundaryA: SkId<'station'>;
  boundaryB: SkId<'station'>;
  shorterLineId: SkId<'line'>;
  longerLineId: SkId<'line'>;
  shorterKm: number;
  longerKm: number;
}

/**
 * Verified JR 旅客営業規則 第69条 (Tokyo-slice specific sections)
 */
export const ART69_SPECIFIC_SECTIONS: SpecificSectionDefinition[] = [
  {
    ruleId: 'JR-ART69-2',
    articleRef: '旅客営業規則 第69条第1項第2号',
    officialUrl: 'https://www.jreast.co.jp/kippu/1101.html',
    label: '日暮里以遠〜赤羽以遠（尾久経由 7.6km → 王子経由 7.4km）',
    boundaryA: 'sk:station:jr-east-nippori',
    boundaryB: 'sk:station:jr-east-akabane',
    shorterLineId: 'sk:line:jr-east-tohoku',
    longerLineId: 'sk:line:jr-east-tohoku-oku',
    shorterKm: 7.4,
    longerKm: 7.6,
  },
  {
    ruleId: 'JR-ART69-3',
    articleRef: '旅客営業規則 第69条第1項第3号',
    officialUrl: 'https://www.jreast.co.jp/kippu/1101.html',
    label: '赤羽以遠〜大宮以遠（埼京線・戸田公園経由 18.0km → 東北本線・川口/浦和経由 17.1km）',
    boundaryA: 'sk:station:jr-east-akabane',
    boundaryB: 'sk:station:jr-east-omiya',
    shorterLineId: 'sk:line:jr-east-tohoku',
    longerLineId: 'sk:line:jr-east-tohoku-saikyo',
    shorterKm: 17.1,
    longerKm: 18.0,
  },
  {
    ruleId: 'JR-ART69-4',
    articleRef: '旅客営業規則 第69条第1項第4号',
    officialUrl: 'https://www.jreast.co.jp/kippu/1101.html',
    label: '品川以遠〜鶴見以遠（横須賀線・西大井経由 17.8km → 東海道本線・大井町/川崎経由 14.9km）',
    boundaryA: 'sk:station:jr-east-shinagawa',
    boundaryB: 'sk:station:jr-east-tsurumi',
    shorterLineId: 'sk:line:jr-east-tokaido',
    longerLineId: 'sk:line:jr-east-tokaido-hinkaku',
    shorterKm: 14.9,
    longerKm: 17.8,
  },
];

export const FARE_RULE_CATALOG: FareRule[] = [
  {
    id: 'sk:rule:jr-art67-base',
    externalIds: { ryokaku: 'Art.67' },
    names: {
      ja: '実乗車経路計算原則・端数切上（第67条・第14条）',
      ja_kana: null,
      en: 'Actual-Route Base Fare Principle & Ceiling Km (Art. 67 / Art. 14)',
    },
    provenance: {
      sourceIds: ['src-jr-east-ryokaku-2026'],
      dataNature: 'manual-verified',
      lastVerifiedAt: '2026-11-21',
    },
    validFrom: '2020-04-01',
    validTo: '2027-03-31',
    ruleId: 'JR-ART67-BASE',
    articleRef: '旅客営業規則 第67条・第14条',
    officialUrl: 'https://www.jreast.co.jp/ryokaku/',
    category: 'base_fare',
    summary: '特例が適用されない場合、実乗車経路の営業キロ合算（1km未満切上げ）に基づき基礎運賃を算出する。',
    preconditions: ['JR普通乗車券', '全区間の営業キロが検証済み'],
    exceptions: ['第69条特定区間', '第157条第2項大都市近郊区間', '地方交通線（換算キロ要）'],
  },
  {
    id: 'sk:rule:jr-local-line-conversion',
    externalIds: { ryokaku: 'Art.77/84' },
    names: {
      ja: '地方交通線 換算キロ運賃計算（未実装拒算）',
      ja_kana: null,
      en: 'Local Line Fare Conversion (換算キロ — Explicitly Unsupported)',
    },
    provenance: {
      sourceIds: ['src-jr-east-ryokaku-2026'],
      dataNature: 'manual-verified',
      lastVerifiedAt: '2026-11-21',
    },
    validFrom: '2020-04-01',
    validTo: '2027-03-31',
    ruleId: 'JR-LOCAL-LINE-UNSUPPORTED',
    articleRef: '旅客営業規則 第77条・第84条（地方交通線）',
    officialUrl: 'https://www.jreast.co.jp/ryokaku/',
    category: 'local_line_conversion',
    summary: '八高線等の地方交通線を経由する場合、幹線営業キロと異なる換算キロ・擬制キロ規則が必要。本プロトタイプでは未実装のため UNSUPPORTED を返す。',
    preconditions: ['経路に地方交通線（lineClass === local_line）を含む'],
    exceptions: [],
  },
  {
    id: 'sk:rule:jr-art69',
    externalIds: { ryokaku: 'Art.69' },
    names: {
      ja: '特定区間における運賃計算の特例（第69条第2〜4号）',
      ja_kana: null,
      en: 'Specific Sections Shortest-Corridor Billing (Art. 69)',
    },
    provenance: {
      sourceIds: ['src-jr-east-kippu-1101', 'src-jr-east-ryokaku-2026'],
      dataNature: 'manual-verified',
      lastVerifiedAt: '2026-11-21',
    },
    validFrom: '2020-04-01',
    validTo: '2027-03-31',
    ruleId: 'JR-ART69',
    articleRef: '旅客営業規則 第69条第1項第2・3・4号',
    officialUrl: 'https://www.jreast.co.jp/kippu/1101.html',
    category: 'specific_section',
    summary: '日暮里以遠〜赤羽以遠、赤羽以遠〜大宮以遠、品川以遠〜鶴見以遠をう回経路で通過する場合、短い指定経路の営業キロで運賃を計算する。',
    preconditions: ['両境界駅の「以遠」に跨る普通乗車券', 'う回対象支線を通過すること'],
    exceptions: ['支線途中駅（尾久・戸田公園・西大井等）を発着とする場合は不適用'],
  },
  {
    id: 'sk:rule:jr-art157-suburban',
    externalIds: { ryokaku: 'Art.156/157(2)' },
    names: {
      ja: '大都市近郊区間（東京近郊区間）最短経路運賃特例',
      ja_kana: null,
      en: 'Metropolitan Suburban Area Shortest-Path Rule (Art. 156 / 157-2)',
    },
    provenance: {
      sourceIds: ['src-jr-east-kippu-1103', 'src-jr-east-ryokaku-2026'],
      dataNature: 'manual-verified',
      lastVerifiedAt: '2026-11-21',
    },
    validFrom: '2020-04-01',
    validTo: '2027-03-31',
    ruleId: 'JR-ART157-SUBURBAN',
    articleRef: '旅客営業規則 第156条・第157条第2項',
    officialUrl: 'https://www.jreast.co.jp/kippu/1103.html',
    category: 'suburban_area',
    summary: '東京近郊区間内の在来線のみで完結し、重複乗車および途中下車がない普通乗車券は、最も短い（安い）経路の営業キロで計算する（有効期間当日限り）。',
    preconditions: [
      'JR東日本 東京近郊区間内の在来線のみで完結',
      '普通乗車券（紙券）',
      '同一駅・同一区間の重複乗車なし（一筆書き）',
      '途中下車を行わない（途中下車不可・前途無効）',
    ],
    exceptions: [
      '近郊区間外（例：三島）に跨る場合',
      '東海道新幹線等を利用する場合',
      '重複乗車がある場合',
      '途中下車が必要な場合',
    ],
  },
  {
    id: 'sk:rule:jr-art16-2-v2025',
    externalIds: { ryokaku: 'Art.16-2 (pre-2026-03-14)' },
    names: {
      ja: '新幹線と並行在来線の同一線路扱い（第16条の2・2026年3月13日以前）',
      ja_kana: null,
      en: 'Shinkansen–Conventional Same-Line Rule (Art. 16-2, pre-2026-03-14)',
    },
    provenance: {
      sourceIds: ['src-jr-east-kippu-1101', 'src-jr-central-rules'],
      dataNature: 'manual-verified',
      lastVerifiedAt: '2026-11-21',
    },
    validFrom: '2020-04-01',
    validTo: '2026-03-13',
    ruleId: 'JR-ART16-2-V2025',
    articleRef: '旅客営業規則 第16条の2第1項・第2項（2026年3月13日以前）',
    officialUrl: 'https://www.jreast.co.jp/kippu/1101.html',
    category: 'shinkansen_equivalence',
    summary: '東北新幹線（東京〜大宮）および東海道新幹線（東京〜熱海）を原則同一線路扱いとするが、品川・小田原間の中間駅（新横浜）を発着・接続駅とする場合は第2項例外により別線扱い。',
    preconditions: ['並行在来線が存在する新幹線区間', '乗降・接続駅が第2項除外中間駅に該当しない'],
    exceptions: ['品川・小田原間の中間駅（新横浜）発着・接続は別線扱い（第16条の2第2項）'],
  },
  {
    id: 'sk:rule:jr-art16-2-v2026',
    externalIds: { ryokaku: 'Art.16-2 (2026-03-14+)' },
    names: {
      ja: '新幹線と並行在来線の同一線路扱いおよび東京〜熱海別線化（2026年3月14日改定）',
      ja_kana: null,
      en: 'Shinkansen–Conventional Rule & Tokyo–Atami Separate-Line Revision (2026-03-14+)',
    },
    provenance: {
      sourceIds: ['src-jr-east-kippu-1101', 'src-jr-east-ryokaku-2026', 'src-jr-central-rules'],
      dataNature: 'manual-verified',
      lastVerifiedAt: '2026-11-21',
    },
    validFrom: '2026-03-14',
    validTo: '2027-03-31',
    ruleId: 'JR-ART16-2-V2026',
    articleRef: '旅客営業規則 第16条の2（2026年3月14日改正）',
    officialUrl: 'https://www.jreast.co.jp/kippu/1101.html',
    category: 'shinkansen_equivalence',
    summary: 'JR東日本運賃改定に伴い、東海道新幹線（JR東海）東京〜熱海間は並行する東海道本線（JR東日本）と「別線扱い」に変更。一方、JR東日本自社内の東北新幹線（東京〜大宮）は引き続き同一線路扱い。',
    preconditions: ['乗降日 >= 2026-03-14'],
    exceptions: [
      '東海道新幹線 東京〜熱海間は別線扱い（在来線乗車券との共通利用不可・東京近郊区間適用外）',
      '品川・小田原間の中間駅（新横浜）発着・接続は引き続き別線扱い',
    ],
  },
];

export interface ShinkansenEquivalenceResult {
  ruleId: string;
  articleRef: string;
  officialUrl: string;
  applies: boolean;
  corridor: 'tokaido_shinkansen' | 'tohoku_shinkansen' | 'mixed' | 'none';
  treatedAsSameLine: boolean;
  reason: string;
  details: string;
}

/**
 * Conditional predicate for 旅客営業規則 第16条の2 (幹在同一視).
 * NEVER a global boolean: evaluates corridor, operator ownership, travelDate version,
 * and intermediate connection station exceptions (新横浜 inside 品川–小田原).
 */
export function evaluateShinkansenEquivalence(
  path: ResolvedPath,
  version: RuleVersionConfig,
): ShinkansenEquivalenceResult {
  const shinkLegs = path.legs.filter((l) => l.isShinkansen);
  const ruleId =
    version.versionId === 'jr-fare-v2026' ? 'JR-ART16-2-V2026' : 'JR-ART16-2-V2025';
  const articleRef =
    version.versionId === 'jr-fare-v2026'
      ? '旅客営業規則 第16条の2（2026年3月14日改正）'
      : '旅客営業規則 第16条の2第1項・第2項（2026年3月13日以前）';

  if (shinkLegs.length === 0) {
    return {
      ruleId,
      articleRef,
      officialUrl: 'https://www.jreast.co.jp/kippu/1101.html',
      applies: false,
      corridor: 'none',
      treatedAsSameLine: false,
      reason: '経路に新幹線区間を含まないため第16条の2は非該当。',
      details: 'Conventional lines only.',
    };
  }

  const usesTokaidoShink = shinkLegs.some(
    (l) => l.railLineId === 'sk:line:jr-central-tokaido-shinkansen',
  );
  const usesTohokuShink = shinkLegs.some(
    (l) => l.railLineId === 'sk:line:jr-east-tohoku-shinkansen',
  );

  // Check intermediate connection station exception: 新横浜 as origin, destination, or transfer station!
  const shinkStart = shinkLegs[0]?.fromStationId;
  const shinkEnd = shinkLegs[shinkLegs.length - 1]?.toStationId;
  const shinYokohamaId: SkId<'station'> = 'sk:station:jr-central-shin-yokohama';
  const touchesShinYokohamaEndpoint =
    shinkStart === shinYokohamaId || shinkEnd === shinYokohamaId;

  if (usesTokaidoShink && touchesShinYokohamaEndpoint && version.shinagawaOdawaraIntermediateException) {
    return {
      ruleId,
      articleRef: '旅客営業規則 第16条の2第2項第1号（品川・小田原間の中間駅除外）',
      officialUrl: 'https://www.jreast.co.jp/kippu/1101.html',
      applies: true,
      corridor: 'tokaido_shinkansen',
      treatedAsSameLine: false,
      reason:
        '例外該当（別線扱い）：新横浜駅は品川・小田原間の中間駅であるため、発駅・着駅または接続駅とする場合は第16条の2第2項により並行在来線（東海道本線）とは別線扱いとなります。',
      details: `Shinkansen leg endpoint/transfer touches ${shinYokohamaId}; Art. 16-2(2) separates it from Tokaido Main Line.`,
    };
  }

  // Check 2026-03-14 Tokyo–Atami Tokaido Shinkansen separate-line revision!
  if (usesTokaidoShink && !version.tokaidoShinkansenTokyoAtamiSameLine) {
    return {
      ruleId,
      articleRef: '旅客営業規則 第16条の2（2026年3月14日改定：東京〜熱海別線化）',
      officialUrl: 'https://www.jreast.co.jp/kippu/1101.html',
      applies: true,
      corridor: 'tokaido_shinkansen',
      treatedAsSameLine: false,
      reason:
        '例外該当（2026年3月14日改定・別線扱い）：JR東日本運賃改定に伴い、東海道新幹線（JR東海）東京〜熱海間は並行する東海道本線（JR東日本）とは別線扱いとなり、幹在同一視および東京近郊区間特例は適用されません。',
      details:
        'Post-2026-03-14 cross-company fare divergence separates JR Central Tokaido Shinkansen (Tokyo–Atami) from JR East Tokaido Main Line.',
    };
  }

  // Pre-2026-03-14 Tokaido Shinkansen end-to-end (e.g. Tokyo–Atami or Tokyo–Odawara without Shin-Yokohama boarding/alighting)
  if (usesTokaidoShink && version.tokaidoShinkansenTokyoAtamiSameLine) {
    return {
      ruleId,
      articleRef: '旅客営業規則 第16条の2第1項（2026年3月13日以前）',
      officialUrl: 'https://www.jreast.co.jp/kippu/1101.html',
      applies: true,
      corridor: 'tokaido_shinkansen',
      treatedAsSameLine: true,
      reason:
        '幹在同一視適用（2026年3月13日以前規則）：品川・小田原間の中間駅（新横浜）を発着・接続としない東海道新幹線区間は、並行する東海道本線と同一線路の営業キロで取り扱われます。',
      details:
        'Under pre-2026-03-14 rules, Tokaido Shinkansen between Tokyo/Shinagawa and Odawara/Atami/Mishima is treated as same line as Tokaido Main Line.',
    };
  }

  // Tohoku Shinkansen (JR East: Tokyo–Ueno–Omiya)
  if (usesTohokuShink && version.tohokuShinkansenTokyoOmiyaSameLine) {
    return {
      ruleId,
      articleRef: '旅客営業規則 第16条の2第1項第2号（東北新幹線・JR東日本管内）',
      officialUrl: 'https://www.jreast.co.jp/kippu/1101.html',
      applies: true,
      corridor: 'tohoku_shinkansen',
      treatedAsSameLine: true,
      reason:
        '幹在同一視適用：東北新幹線（東京〜上野〜大宮）はJR東日本自社管内であり、2026年3月14日改定後も東北本線と同一線路（営業キロ 30.3km、実キロ 31.3km ではなく在来線基準）として取り扱われます。',
      details:
        'Tohoku Shinkansen Tokyo–Omiya (JR East) remains equivalent to Tohoku Main Line under Art. 16-2(1)(2).',
    };
  }

  return {
    ruleId,
    articleRef,
    officialUrl: 'https://www.jreast.co.jp/kippu/1101.html',
    applies: true,
    corridor: 'mixed',
    treatedAsSameLine: false,
    reason: '複合新幹線区間のため個別経路（別線）として計算します。',
    details: 'Mixed Shinkansen corridors treated separately.',
  };
}
