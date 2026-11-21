/**
 * Rule-Driven, Explainable JR Fare Engine (Pure TypeScript, zero React dependency).
 *
 * Operates strictly over the same Station & TrackSegment entities used by the map
 * via Three-Graph Separation (TrackGraph, ServiceGraph, FareRuleGraph).
 *
 * Guarantees:
 *  - Distinguishes all 6 statuses: OK | NOT_APPLICABLE | MISSING_DATA | UNSUPPORTED | STALE_RULE | ERROR
 *  - NEVER outputs an exact yen amount for any non-OK status
 *  - Every calculation produces an auditable explanation tree with RuleId, official article & URL
 *  - Separates actual riding path from statutory billing path and describes their diff
 */

import {
  ART69_SPECIFIC_SECTIONS,
  evaluateShinkansenEquivalence,
  resolveRuleVersion,
} from './fareRules.js';
import {
  SyntheticDemoTariffProvider,
  type FareTariffProvider,
} from './fareTariff.js';
import { FareRuleGraph, TrackGraph, type GraphStep } from './graphs.js';
import type {
  AtlasDataset,
  FareBreakdownItem,
  FareExplanationStep,
  FareQuote,
  FareQuoteRequest,
  FareQuoteStatus,
  ResolvedPath,
  SkId,
} from './types.js';

export interface FareEngineContext {
  dataset: AtlasDataset;
  trackGraph: TrackGraph;
  fareRuleGraph: FareRuleGraph;
  tariffProvider: FareTariffProvider;
}

export function createFareEngineContext(
  dataset: AtlasDataset,
  tariffProvider: FareTariffProvider = new SyntheticDemoTariffProvider(),
): FareEngineContext {
  const trackGraph = new TrackGraph(dataset);
  const fareRuleGraph = new FareRuleGraph(trackGraph);
  return { dataset, trackGraph, fareRuleGraph, tariffProvider };
}

function isJrOperator(operatorId: SkId<'operator'>): boolean {
  return operatorId === 'sk:operator:jr-east' || operatorId === 'sk:operator:jr-central';
}

function buildRejectQuote(
  request: FareQuoteRequest,
  status: Exclude<FareQuoteStatus, 'OK'>,
  statusReason: string,
  explanation: FareExplanationStep[],
  extra?: Partial<FareQuote>,
): FareQuote {
  return {
    id: `sk:quote:${request.originStationId.replace('sk:station:', '')}--${request.destinationStationId.replace('sk:station:', '')}--${request.travelDate}`,
    status,
    statusReason,
    request,
    isSyntheticTariff: extra?.isSyntheticTariff ?? false,
    tariffDisclaimer: extra?.tariffDisclaimer ?? null,
    actualPath: extra?.actualPath ?? null,
    billedPath: extra?.billedPath ?? null,
    pathsDiffer: false,
    pathDiffSummary: null,
    validityDays: extra?.validityDays ?? null,
    stopoverAllowed: extra?.stopoverAllowed ?? null,
    totalAmountYen: null, // HARD RULE: never output an exact yen amount on non-OK status
    breakdown: [],
    explanation,
    ruleVersionUsed: extra?.ruleVersionUsed ?? null,
    candidateRoutes: extra?.candidateRoutes,
    provenance: {
      sourceIds: ['src-jr-east-ryokaku-2026', 'src-jr-east-kippu-1101', 'src-jr-east-kippu-1103'],
      dataNature: 'manual-verified',
      lastVerifiedAt: '2026-11-21',
    },
  };
}

function computeValidityDaysStandard(km: number): number {
  if (km <= 100) return 1;
  return 1 + Math.ceil((km - 100) / 200);
}

function resolveActualPath(
  request: FareQuoteRequest,
  trackGraph: TrackGraph,
): ResolvedPath | null {
  if (request.actualSegmentIds && request.actualSegmentIds.length > 0) {
    return trackGraph.resolveExplicitSegments(
      request.originStationId,
      request.actualSegmentIds,
    );
  }

  const pref = request.preferShinkansen ? 'shinkansen' : (request.routePreference ?? 'shortest');

  // Build waypoint sequence
  const waypoints: SkId<'station'>[] = [request.originStationId];
  if (request.viaStationIds && request.viaStationIds.length > 0) {
    waypoints.push(...request.viaStationIds);
  } else if (pref === 'saikyo_bypass') {
    const toda: SkId<'station'> = 'sk:station:jr-east-toda-koen';
    if (request.originStationId !== toda && request.destinationStationId !== toda) {
      waypoints.push(toda);
    }
  } else if (pref === 'yokosuka_bypass') {
    const nishiOi: SkId<'station'> = 'sk:station:jr-east-nishi-oi';
    if (request.originStationId !== nishiOi && request.destinationStationId !== nishiOi) {
      waypoints.push(nishiOi);
    }
  } else if (pref === 'oku_bypass') {
    const oku: SkId<'station'> = 'sk:station:jr-east-oku';
    if (request.originStationId !== oku && request.destinationStationId !== oku) {
      waypoints.push(oku);
    }
  } else if (pref === 'yamanote_loop_detour') {
    // Detour around western Yamanote loop (Shibuya -> Ikebukuro) when traveling within Tokyo core
    const shibuya: SkId<'station'> = 'sk:station:jr-east-shibuya';
    const ikebukuro: SkId<'station'> = 'sk:station:jr-east-ikebukuro';
    if (
      request.originStationId !== shibuya &&
      request.destinationStationId !== shibuya &&
      request.originStationId !== ikebukuro &&
      request.destinationStationId !== ikebukuro
    ) {
      waypoints.push(shibuya, ikebukuro);
    }
  }
  waypoints.push(request.destinationStationId);

  const allSteps: GraphStep[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    if (!from || !to) return null;

    const isShinkansenOnly = (sid: SkId<'station'>) => {
      const st = trackGraph.getStation(sid);
      return Boolean(
        st &&
          st.railLineIds.length > 0 &&
          st.railLineIds.every((l) => l.includes('shinkansen')),
      );
    };
    const allowShinkansen =
      pref === 'shinkansen' || isShinkansenOnly(from) || isShinkansenOnly(to);

    const preferLines = new Set<SkId<'line'>>();
    const avoidLines = new Set<SkId<'line'>>();

    if (pref === 'shinkansen') {
      preferLines.add('sk:line:jr-central-tokaido-shinkansen');
      preferLines.add('sk:line:jr-east-tohoku-shinkansen');
    } else if (pref === 'saikyo_bypass') {
      preferLines.add('sk:line:jr-east-tohoku-saikyo');
    } else if (pref === 'yokosuka_bypass') {
      preferLines.add('sk:line:jr-east-tokaido-hinkaku');
    } else if (pref === 'oku_bypass') {
      preferLines.add('sk:line:jr-east-tohoku-oku');
    } else if (pref === 'yamanote_loop_detour') {
      avoidLines.add('sk:line:jr-east-chuo');
      preferLines.add('sk:line:jr-east-yamanote');
    }

    const segSteps = trackGraph.findShortestTrackPath(from, to, {
      allowShinkansen: Boolean(allowShinkansen),
      allowOnlyJr: true,
      allowLocalLines: true,
      preferLineIds: preferLines.size > 0 ? preferLines : undefined,
      avoidLineIds: avoidLines.size > 0 ? avoidLines : undefined,
      allowJrTransfers: true,
      weightMode: 'operating_km',
    });

    if (!segSteps) return null;
    allSteps.push(...segSteps);
  }

  return trackGraph.resolveSteps(allSteps, request.originStationId);
}

function summarizePathDiff(
  actualPath: ResolvedPath,
  billedPath: ResolvedPath,
  trackGraph: TrackGraph,
): { pathsDiffer: boolean; summary: string | null } {
  const actualKey = actualPath.segmentIds.join('|');
  const billedKey = billedPath.segmentIds.join('|');
  if (actualKey === billedKey) {
    return { pathsDiffer: false, summary: null };
  }
  const actualKm = actualPath.totalOperatingKm;
  const billedKm = billedPath.totalOperatingKm;
  const actualLines = [
    ...new Set(
      actualPath.legs.map(
        (l) => trackGraph.getLine(l.railLineId)?.names.ja ?? l.railLineId,
      ),
    ),
  ].join(' → ');
  const billedLines = [
    ...new Set(
      billedPath.legs.map(
        (l) => trackGraph.getLine(l.railLineId)?.names.ja ?? l.railLineId,
      ),
    ),
  ].join(' → ');

  return {
    pathsDiffer: true,
    summary: `実乗車経路（${actualLines} / ${actualKm ?? '?'} km）と運賃計算経路（${billedLines} / ${billedKm ?? '?'} km）が異なります。`,
  };
}

/**
 * Main JR fare calculation entry point.
 */
export function calculateFareQuote(
  request: FareQuoteRequest,
  context: FareEngineContext,
): FareQuote {
  const { trackGraph, fareRuleGraph, tariffProvider } = context;
  const explanation: FareExplanationStep[] = [];

  // 1. Validate travel date & rule version
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.travelDate)) {
    explanation.push({
      ruleId: 'JR-DATE-INVALID',
      articleRef: '入力検証',
      officialUrl: 'https://www.jreast.co.jp/ryokaku/',
      applied: false,
      status: 'REJECTED',
      reason: `乗車日 "${request.travelDate}" の形式が不正です（YYYY-MM-DD 形式が必要）。`,
    });
    return buildRejectQuote(request, 'ERROR', 'Invalid travelDate format', explanation);
  }

  const ruleVersion = resolveRuleVersion(request.travelDate);
  if (!ruleVersion) {
    explanation.push({
      ruleId: 'JR-RULE-VERSION-WINDOW',
      articleRef: '規則有効期間チェック',
      officialUrl: 'https://www.jreast.co.jp/ryokaku/',
      applied: false,
      status: 'REJECTED',
      reason: `乗車日 ${request.travelDate} は本プロトタイプが検証済みの規則有効期間（2020-04-01 〜 2027-03-31）外です。期限切れまたは未公表規則のため運賃計算を拒否しました。`,
    });
    return buildRejectQuote(
      request,
      'STALE_RULE',
      `Travel date ${request.travelDate} is outside verified rule validity window (2020-04-01..2027-03-31).`,
      explanation,
    );
  }

  explanation.push({
    ruleId: `VERSION-${ruleVersion.versionId.toUpperCase()}`,
    articleRef: ruleVersion.label,
    officialUrl: 'https://www.jreast.co.jp/ryokaku/',
    applied: true,
    status: 'APPLIED',
    reason: `乗車日 ${request.travelDate} に基づき ${ruleVersion.label}（${ruleVersion.validFrom} 〜 ${ruleVersion.validTo}）を適用。`,
  });

  // 2. Check station existence, operator scope, and fare slice membership
  const origin = trackGraph.getStation(request.originStationId);
  const dest = trackGraph.getStation(request.destinationStationId);
  if (!origin || !dest) {
    explanation.push({
      ruleId: 'JR-STATION-MISSING',
      articleRef: 'データ整合性チェック',
      officialUrl: 'https://www.jreast.co.jp/ryokaku/',
      applied: false,
      status: 'REJECTED',
      reason: `指定された発駅または着駅がデータセットに存在しません（origin=${request.originStationId}, dest=${request.destinationStationId}）。`,
    });
    return buildRejectQuote(
      request,
      'MISSING_DATA',
      'Origin or destination station not found in atlas dataset.',
      explanation,
      { ruleVersionUsed: ruleVersion.versionId },
    );
  }

  const viaStations = (request.viaStationIds ?? []).map((id) => ({
    id,
    station: trackGraph.getStation(id),
  }));
  const missingVia = viaStations.find((v) => !v.station);
  if (missingVia) {
    explanation.push({
      ruleId: 'JR-VIA-MISSING',
      articleRef: 'データ整合性チェック',
      officialUrl: 'https://www.jreast.co.jp/ryokaku/',
      applied: false,
      status: 'REJECTED',
      reason: `経由駅 ${missingVia.id} がデータセットに存在しません。`,
    });
    return buildRejectQuote(
      request,
      'MISSING_DATA',
      `Via station ${missingVia.id} not found.`,
      explanation,
      { ruleVersionUsed: ruleVersion.versionId },
    );
  }

  if (
    request.originStationId === request.destinationStationId &&
    (!request.viaStationIds || request.viaStationIds.length === 0) &&
    (!request.actualSegmentIds || request.actualSegmentIds.length === 0)
  ) {
    explanation.push({
      ruleId: 'JR-SAME-ORIGIN-DEST',
      articleRef: '旅客営業規則 第67条',
      officialUrl: 'https://www.jreast.co.jp/ryokaku/',
      applied: false,
      status: 'REJECTED',
      reason: '発駅と着駅が同一のため片道普通乗車券の運賃計算は対象外です。',
    });
    return buildRejectQuote(
      request,
      'NOT_APPLICABLE',
      'Origin and destination are the same station.',
      explanation,
      { ruleVersionUsed: ruleVersion.versionId },
    );
  }

  // Non-JR operator check
  const allInputStations = [origin, dest, ...viaStations.map((v) => v.station!)];
  const nonJr = allInputStations.find((s) => !isJrOperator(s.operatorId));
  if (nonJr) {
    explanation.push({
      ruleId: 'JR-SCOPE-OPERATOR',
      articleRef: '運賃エンジン対象事業者',
      officialUrl: 'https://www.jreast.co.jp/ryokaku/',
      applied: false,
      status: 'REJECTED',
      reason: `駅「${nonJr.names.ja}」（事業者: ${nonJr.operatorId}）はJR以外の事業者のため、JR運賃エンジンの適用対象外です。`,
    });
    return buildRejectQuote(
      request,
      'NOT_APPLICABLE',
      `Non-JR station (${nonJr.names.ja} / ${nonJr.operatorId}) is not applicable to the JR fare engine.`,
      explanation,
      { ruleVersionUsed: ruleVersion.versionId },
    );
  }

  // Outside JR fare slice check (e.g. Joban Line Ayase/Kanamachi)
  const outsideSlice = allInputStations.find((s) => !s.inFareSlice);
  if (outsideSlice) {
    explanation.push({
      ruleId: 'JR-SCOPE-SLICE',
      articleRef: '検証済み運賃スライス境界',
      officialUrl: 'https://www.jreast.co.jp/ryokaku/',
      applied: false,
      status: 'REJECTED',
      reason: `駅「${outsideSlice.names.ja}」は地図表示対象ですが、本プロトタイプの検証済みJR運賃スライス外（営業キロ未収録）のため計算未対応です。`,
    });
    return buildRejectQuote(
      request,
      'UNSUPPORTED',
      `JR station "${outsideSlice.names.ja}" is outside the verified JR fare slice.`,
      explanation,
      { ruleVersionUsed: ruleVersion.versionId },
    );
  }

  // 3. Ticket type check (IC card explicitly UNSUPPORTED with honest explanation)
  if (request.ticketType === 'ic_card') {
    explanation.push({
      ruleId: 'JR-TICKET-IC-UNSUPPORTED',
      articleRef: 'ICカード乗車券取扱規則（Suica等）',
      officialUrl: 'https://www.jreast.co.jp/suica/use/riding/',
      applied: false,
      status: 'REJECTED',
      reason:
        'ICカード（Suica等）は1円単位運賃表および自動改札最短経路・大回り制限など紙の普通乗車券と異なる規則体系を持つため、本プロトタイプでは UNSUPPORTED として正確金額を出力しません。',
    });
    return buildRejectQuote(
      request,
      'UNSUPPORTED',
      'IC card fare rules (1-yen brackets & automated gate shortest-route rules) are not yet implemented.',
      explanation,
      { ruleVersionUsed: ruleVersion.versionId },
    );
  }

  // 4. Resolve actual riding path on TrackGraph (exact same entities as the map!)
  const actualPath = resolveActualPath(request, trackGraph);
  if (!actualPath || actualPath.legs.length === 0) {
    explanation.push({
      ruleId: 'JR-PATH-UNREACHABLE',
      articleRef: '軌道トポロジ探索',
      officialUrl: 'https://www.jreast.co.jp/ryokaku/',
      applied: false,
      status: 'REJECTED',
      reason: '指定された発着駅・経由条件で有効なJR軌道経路が見つかりませんでした。',
    });
    return buildRejectQuote(
      request,
      'MISSING_DATA',
      'No valid JR track path found between origin and destination.',
      explanation,
      { ruleVersionUsed: ruleVersion.versionId },
    );
  }

  // 5. Local Line Conversion check (地方交通線 換算キロ -> UNSUPPORTED)
  if (actualPath.usesLocalLine) {
    const localLegs = actualPath.legs.filter((l) => l.lineClass === 'local_line');
    const localLineNames = [
      ...new Set(
        localLegs.map(
          (l) => trackGraph.getLine(l.railLineId)?.names.ja ?? l.railLineId,
        ),
      ),
    ].join('・');
    explanation.push({
      ruleId: 'JR-LOCAL-LINE-UNSUPPORTED',
      articleRef: '旅客営業規則 第77条・第84条（地方交通線 換算キロ）',
      officialUrl: 'https://www.jreast.co.jp/ryokaku/',
      applied: false,
      status: 'REJECTED',
      reason: `経路に地方交通線（${localLineNames}）が含まれます。幹線と異なる換算キロ・擬制キロ規則が必須ですが本プロトタイプでは未実装のため拒算（UNSUPPORTED）とします。`,
    });
    return buildRejectQuote(
      request,
      'UNSUPPORTED',
      `Route traverses JR Local Line (${localLineNames}) requiring 換算キロ conversion, which is not implemented.`,
      explanation,
      {
        actualPath,
        ruleVersionUsed: ruleVersion.versionId,
      },
    );
  }

  // 6. Shinkansen–Conventional Line Equivalence Predicate (第16条の2)
  const shinkEval = evaluateShinkansenEquivalence(actualPath, ruleVersion);
  explanation.push({
    ruleId: shinkEval.ruleId,
    articleRef: shinkEval.articleRef,
    officialUrl: shinkEval.officialUrl,
    applied: shinkEval.applies && shinkEval.treatedAsSameLine,
    status: !shinkEval.applies
      ? 'NOT_APPLICABLE'
      : shinkEval.treatedAsSameLine
        ? 'APPLIED'
        : 'REJECTED',
    reason: shinkEval.reason,
    details: shinkEval.details,
  });

  // Start working billing path from actual path (or map Shinkansen to parallel conventional when same-line applies!)
  let workingBilledPath: ResolvedPath = actualPath;
  if (shinkEval.applies && shinkEval.treatedAsSameLine) {
    // Map Shinkansen legs to parallel conventional track basis so map & explanation show statutory billing corridor
    const conventionalAlt = trackGraph.findShortestTrackPath(
      request.originStationId,
      request.destinationStationId,
      {
        allowShinkansen: false,
        allowOnlyJr: true,
        allowLocalLines: false,
        allowJrTransfers: true,
        weightMode: 'operating_km',
      },
    );
    if (conventionalAlt) {
      workingBilledPath = trackGraph.resolveSteps(conventionalAlt, request.originStationId);
    }
  }

  // 7. Specific Section Rule (第69条 第2・3・4号)
  let art69AppliedCount = 0;
  if (!actualPath.usesShinkansen) {
    for (const sec of ART69_SPECIFIC_SECTIONS) {
      const idxA = workingBilledPath.stationIds.indexOf(sec.boundaryA);
      const idxB = workingBilledPath.stationIds.indexOf(sec.boundaryB);
      if (idxA === -1 || idxB === -1) continue;

      const [lo, hi] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
      const strictlyBeyondBoth = lo > 0 && hi < workingBilledPath.stationIds.length - 1;
      const usesLongerLine = workingBilledPath.legs.some((l) => {
        const seg = trackGraph.getSegment(l.segmentId);
        return seg?.railLineIds.includes(sec.longerLineId) ?? false;
      });

      if (usesLongerLine && strictlyBeyondBoth) {
        const replaced = fareRuleGraph.replaceCorridorOnPath(
          workingBilledPath,
          sec.boundaryA,
          sec.boundaryB,
          sec.shorterLineId,
          sec.longerLineId,
        );
        if (replaced) {
          workingBilledPath = replaced;
          art69AppliedCount++;
          explanation.push({
            ruleId: sec.ruleId,
            articleRef: sec.articleRef,
            officialUrl: sec.officialUrl,
            applied: true,
            status: 'APPLIED',
            reason: `特定区間特例適用：${sec.label}。両境界駅の「以遠」に跨るため、短い指定経路（${sec.shorterKm} km）で運賃計算します。`,
          });
        }
      } else if (usesLongerLine && !strictlyBeyondBoth) {
        explanation.push({
          ruleId: sec.ruleId,
          articleRef: sec.articleRef,
          officialUrl: sec.officialUrl,
          applied: false,
          status: 'NOT_APPLICABLE',
          reason: `${sec.label} のう回支線を含みますが、発駅または着駅が境界駅自体であるため第69条（「以遠」相互間）の直接要件は満たしません（近郊区間特例等を別途判定）。`,
        });
      }
    }
  }

  // 8. Metropolitan Suburban Area Rule (大都市近郊区間: 第156条 & 第157条第2項)
  let suburbanApplied = false;
  let validityDays: number;
  let stopoverAllowed: boolean;

  // Check repeated station/segment FIRST — single ordinary ticket cannot have self-intersection / backtracking
  if (actualPath.hasRepeatedStationOrSegment) {
    explanation.push({
      ruleId: 'JR-ART157-SUBURBAN-NO-REPEAT',
      articleRef: '旅客営業規則 第157条第2項・第68条（重複乗車禁止）',
      officialUrl: 'https://www.jreast.co.jp/kippu/1103.html',
      applied: false,
      status: 'REJECTED',
      reason:
        '重複乗車検出：同一駅または同一区間を2度通過する経路には、大都市近郊区間の最短経路特例および単一の片道普通乗車券を適用できません（発着区間を分割する必要があります）。',
    });
    return buildRejectQuote(
      request,
      'NOT_APPLICABLE',
      'Repeated station or track segment detected; suburban shortest-path rule and single one-way ticket do not apply.',
      explanation,
      {
        actualPath,
        ruleVersionUsed: ruleVersion.versionId,
        stopoverAllowed: false,
      },
    );
  }

  const eligibleForSuburbanZone =
    !actualPath.usesShinkansen &&
    actualPath.allWithinTokyoSuburbanArea &&
    actualPath.operatorsInvolved.every((op) => op === 'sk:operator:jr-east');

  if (eligibleForSuburbanZone) {
    if (request.requireStopover) {
      explanation.push({
        ruleId: 'JR-ART156-SUBURBAN-NO-STOPOVER',
        articleRef: '旅客営業規則 第156条第2号（大都市近郊区間内の途中下車不可）',
        officialUrl: 'https://www.jreast.co.jp/kippu/1103.html',
        applied: false,
        status: 'REJECTED',
        reason:
          '途中下車不可：東京近郊区間内相互発着の普通乗車券は、営業キロが100kmを超えていても途中下車できません（下車前途無効）。途中下車が必要な旅程には1枚の近郊区間特例乗車券は適用できません。',
      });
      return buildRejectQuote(
        request,
        'NOT_APPLICABLE',
        'Stopover requested inside Tokyo Suburban Area; Art. 156 prohibits stopovers on suburban-only ordinary tickets.',
        explanation,
        {
          actualPath,
          ruleVersionUsed: ruleVersion.versionId,
          validityDays: 1,
          stopoverAllowed: false,
        },
      );
    }

    const shortestSuburban = fareRuleGraph.findSuburbanShortestBillingPath(
      request.originStationId,
      request.destinationStationId,
    );
    if (shortestSuburban) {
      workingBilledPath = shortestSuburban;
      suburbanApplied = true;
      validityDays = 1;
      stopoverAllowed = false;
      explanation.push({
        ruleId: 'JR-ART157-SUBURBAN',
        articleRef: '旅客営業規則 第156条・第157条第2項（東京近郊区間）',
        officialUrl: 'https://www.jreast.co.jp/kippu/1103.html',
        applied: true,
        status: 'APPLIED',
        reason: `東京近郊区間内の在来線のみで完結（重複乗車なし・途中下車なし）のため、最短運賃計算経路（${shortestSuburban.totalOperatingKm} km）を適用。有効期間は当日限り（1日）、途中下車不可。`,
      });
    } else {
      validityDays = 1;
      stopoverAllowed = false;
    }
  } else {
    // Explain explicitly WHY suburban shortest-path rule did NOT apply
    const nonSuburbanReasons: string[] = [];
    if (actualPath.usesShinkansen) {
      nonSuburbanReasons.push('新幹線区間を含む');
    }
    if (!actualPath.allWithinTokyoSuburbanArea) {
      nonSuburbanReasons.push('東京近郊区間外の駅・区間（例：三島／JR東海区間）を含む');
    }
    explanation.push({
      ruleId: 'JR-ART157-SUBURBAN',
      articleRef: '旅客営業規則 第156条・第157条第2項（東京近郊区間）',
      officialUrl: 'https://www.jreast.co.jp/kippu/1103.html',
      applied: false,
      status: 'NOT_APPLICABLE',
      reason: `東京近郊区間最短経路特例は非適用（理由：${nonSuburbanReasons.join('、')}）。実乗車経路${art69AppliedCount > 0 ? '（第69条特定区間補正後）' : ''}の営業キロで計算します。`,
    });

    const totalKmForValidity = workingBilledPath.totalOperatingKm ?? 0;
    validityDays = computeValidityDaysStandard(totalKmForValidity);
    stopoverAllowed = totalKmForValidity > 100;

    if (request.requireStopover && !stopoverAllowed) {
      explanation.push({
        ruleId: 'JR-ART156-UNDER-100KM',
        articleRef: '旅客営業規則 第156条第1号（100km以下の途中下車不可）',
        officialUrl: 'https://www.jreast.co.jp/kippu/1103.html',
        applied: false,
        status: 'REJECTED',
        reason: `近郊区間外または新幹線利用ですが、計算営業キロが ${totalKmForValidity} km（100km以下）のため途中下車はできません。`,
      });
      return buildRejectQuote(
        request,
        'NOT_APPLICABLE',
        `Stopover requested, but operating distance (${totalKmForValidity} km) is ≤ 100 km.`,
        explanation,
        {
          actualPath,
          billedPath: workingBilledPath,
          ruleVersionUsed: ruleVersion.versionId,
          validityDays,
          stopoverAllowed: false,
        },
      );
    }
  }

  // 9. Verify every segment in billedPath has verified operatingKm
  if (workingBilledPath.totalOperatingKm === null) {
    explanation.push({
      ruleId: 'JR-MISSING-OPERATING-KM',
      articleRef: '旅客営業規則 第67条（営業キロデータ欠損）',
      officialUrl: 'https://www.jreast.co.jp/ryokaku/',
      applied: false,
      status: 'REJECTED',
      reason: '運賃計算経路の一部区間に営業キロデータが存在しないため、正確金額を出力できません（MISSING_DATA）。',
    });
    return buildRejectQuote(
      request,
      'MISSING_DATA',
      'Missing operating kilometers on one or more segments of the billing path.',
      explanation,
      {
        actualPath,
        billedPath: workingBilledPath,
        ruleVersionUsed: ruleVersion.versionId,
      },
    );
  }

  // 10. Base Fare Tariff Calculation (with Cross-Company Awareness!)
  const billedKmRaw = workingBilledPath.totalOperatingKm;
  const billedKmCeil = Math.ceil(billedKmRaw);
  const breakdown: FareBreakdownItem[] = [];

  // Aggregate operating km by operator on workingBilledPath
  const kmByOperator = new Map<SkId<'operator'>, number>();
  for (const leg of workingBilledPath.legs) {
    const prevKm = kmByOperator.get(leg.operatorId) ?? 0;
    kmByOperator.set(leg.operatorId, Math.round((prevKm + (leg.operatingKm ?? 0)) * 10) / 10);
  }

  const operatorsOnBilled = [...kmByOperator.keys()];
  const isCrossCompany = operatorsOnBilled.length > 1;

  let totalAmountYen = 0;

  if (!isCrossCompany) {
    const singleOp = operatorsOnBilled[0] ?? 'sk:operator:jr-east';
    const baseRes = tariffProvider.lookupBaseFare({
      operatorId: singleOp,
      billedKmCeil,
      travelDate: request.travelDate,
      ruleVersionId: ruleVersion.versionId,
    });
    if (!baseRes.available || baseRes.amountYen === null) {
      explanation.push({
        ruleId: 'JR-TARIFF-MISSING',
        articleRef: '運賃表照会',
        officialUrl: 'https://www.jreast.co.jp/ryokaku/',
        applied: false,
        status: 'REJECTED',
        reason: baseRes.unavailableReason ?? '運賃表データが取得できませんでした。',
      });
      return buildRejectQuote(
        request,
        'MISSING_DATA',
        baseRes.unavailableReason ?? 'Tariff data unavailable.',
        explanation,
        {
          actualPath,
          billedPath: workingBilledPath,
          ruleVersionUsed: ruleVersion.versionId,
          validityDays,
          stopoverAllowed,
        },
      );
    }

    totalAmountYen += baseRes.amountYen;
    breakdown.push({
      label: `普通乗車券 基礎運賃（${baseRes.bracketLabel}）`,
      productKind: 'base_fare',
      operatorId: singleOp,
      distanceKm: billedKmRaw,
      amountYen: baseRes.amountYen,
      dataNature: baseRes.dataNature,
      notes: `営業キロ ${billedKmRaw} km → 端数切上 ${billedKmCeil} km（第14条）`,
    });

    explanation.push({
      ruleId: 'JR-ART67-BASE',
      articleRef: '旅客営業規則 第67条・第14条',
      officialUrl: 'https://www.jreast.co.jp/ryokaku/',
      applied: true,
      status: 'APPLIED',
      reason: `計算経路の営業キロ ${billedKmRaw} km（切上 ${billedKmCeil} km）から基礎運賃を算出（${tariffProvider.isSynthetic ? '合成デモ費率' : '検証済費率'}）。`,
    });
  } else {
    // Cross-company JR East + JR Central!
    if (ruleVersion.crossCompanyAddonModel) {
      // Post-2026-03-14: 通算加算方式 (each company's distance portion modeled transparently)
      for (const [opId, opKm] of kmByOperator.entries()) {
        const opCeil = Math.ceil(opKm);
        const res = tariffProvider.lookupBaseFare({
          operatorId: opId,
          billedKmCeil: opCeil,
          travelDate: request.travelDate,
          ruleVersionId: ruleVersion.versionId,
          isCrossCompanySegment: true,
        });
        if (!res.available || res.amountYen === null) {
          explanation.push({
            ruleId: 'JR-TARIFF-MISSING',
            articleRef: '跨社運賃表照会',
            officialUrl: 'https://www.jreast.co.jp/ryokaku/',
            applied: false,
            status: 'REJECTED',
            reason: res.unavailableReason ?? '跨社運賃表データが取得できませんでした。',
          });
          return buildRejectQuote(
            request,
            'MISSING_DATA',
            res.unavailableReason ?? 'Cross-company tariff unavailable.',
            explanation,
            {
              actualPath,
              billedPath: workingBilledPath,
              ruleVersionUsed: ruleVersion.versionId,
              validityDays,
              stopoverAllowed,
            },
          );
        }
        totalAmountYen += res.amountYen;
        breakdown.push({
          label: `跨社区間 基礎運賃（${opId === 'sk:operator:jr-east' ? 'JR東日本' : 'JR東海'} / ${res.bracketLabel}）`,
          productKind: 'base_fare',
          operatorId: opId,
          distanceKm: opKm,
          amountYen: res.amountYen,
          dataNature: res.dataNature,
          notes: `2026年3月14日改定 会社別キロ集計（${opKm} km → 切上 ${opCeil} km・合成デモモデル）`,
        });
      }
      explanation.push({
        ruleId: 'JR-CROSS-COMPANY-V2026',
        articleRef: '旅客営業規則（2026年3月14日改定：JR東日本・JR東海跨社計算）',
        officialUrl: 'https://www.jreast.co.jp/ryokaku/',
        applied: true,
        status: 'APPLIED',
        reason: `JR東日本とJR東海に跨る経路（合計 ${billedKmRaw} km）のため、2026年3月14日改定の会社境界区分に基づき事業者別内訳を計上（合成デモ費率）。`,
      });
    } else {
      // Pre-2026-03-14: unified main-line distance lookup across Honshu 3 companies
      const res = tariffProvider.lookupBaseFare({
        operatorId: 'sk:operator:jr-east',
        billedKmCeil,
        travelDate: request.travelDate,
        ruleVersionId: ruleVersion.versionId,
      });
      if (!res.available || res.amountYen === null) {
        explanation.push({
          ruleId: 'JR-TARIFF-MISSING',
          articleRef: '跨社通算運賃表照会',
          officialUrl: 'https://www.jreast.co.jp/ryokaku/',
          applied: false,
          status: 'REJECTED',
          reason: res.unavailableReason ?? '跨社運賃表データが取得できませんでした。',
        });
        return buildRejectQuote(
          request,
          'MISSING_DATA',
          res.unavailableReason ?? 'Tariff unavailable.',
          explanation,
          {
            actualPath,
            billedPath: workingBilledPath,
            ruleVersionUsed: ruleVersion.versionId,
            validityDays,
            stopoverAllowed,
          },
        );
      }
      totalAmountYen += res.amountYen;
      breakdown.push({
        label: `跨社通算 基礎運賃（JR東日本＋JR東海 / ${res.bracketLabel}）`,
        productKind: 'base_fare',
        operatorId: null,
        distanceKm: billedKmRaw,
        amountYen: res.amountYen,
        dataNature: res.dataNature,
        notes: `2026年3月13日以前 本州3社通算営業キロ ${billedKmRaw} km（切上 ${billedKmCeil} km）`,
      });
      explanation.push({
        ruleId: 'JR-CROSS-COMPANY-V2025',
        articleRef: '旅客営業規則（2026年3月13日以前：本州3社通算）',
        officialUrl: 'https://www.jreast.co.jp/ryokaku/',
        applied: true,
        status: 'APPLIED',
        reason: `2026年3月13日以前の規則により、JR東日本・JR東海の通算営業キロ ${billedKmRaw} km（切上 ${billedKmCeil} km）で算出。`,
      });
    }
  }

  // 11. Optional Surcharge FareProduct Layer (Should #17: 特急・指定席・グリーン・グランクラス)
  const surchargeType = request.surchargeType ?? 'none';
  if (surchargeType !== 'none') {
    const surRes = tariffProvider.lookupSurcharge({
      surchargeType,
      isShinkansen: actualPath.usesShinkansen,
      billedKmCeil,
      travelDate: request.travelDate,
    });
    if (!surRes.available || surRes.amountYen === null) {
      explanation.push({
        ruleId: 'JR-SURCHARGE-NOT-APPLICABLE',
        articleRef: '特別急行料金・座席料金規則',
        officialUrl: 'https://www.jreast.co.jp/ryokaku/',
        applied: false,
        status: 'REJECTED',
        reason: surRes.unavailableReason ?? '選択した付加料金種別はこの経路に適用できません。',
      });
      return buildRejectQuote(
        request,
        'NOT_APPLICABLE',
        surRes.unavailableReason ?? 'Selected surcharge product is not applicable to this route.',
        explanation,
        {
          actualPath,
          billedPath: workingBilledPath,
          ruleVersionUsed: ruleVersion.versionId,
          validityDays,
          stopoverAllowed,
        },
      );
    }

    totalAmountYen += surRes.amountYen;
    breakdown.push({
      label: surRes.label,
      productKind: 'surcharge',
      operatorId: actualPath.operatorsInvolved[0] ?? 'sk:operator:jr-east',
      distanceKm: billedKmRaw,
      amountYen: surRes.amountYen,
      dataNature: surRes.dataNature,
      notes: '基礎乗車券とは別レイヤーの FareProduct（付加料金）として加算',
    });
    explanation.push({
      ruleId: `JR-SURCHARGE-${surchargeType.toUpperCase()}`,
      articleRef: '旅客営業規則 第125条・第130条（特急・グリーン・グランクラス料金）',
      officialUrl: 'https://www.jreast.co.jp/ryokaku/',
      applied: true,
      status: 'APPLIED',
      reason: `付加料金レイヤー「${surRes.label}」を基礎運賃とは独立に組み合わせ計上。`,
    });
  }

  // 12. Compute actual vs billed path diff & candidate routes
  const diff = summarizePathDiff(actualPath, workingBilledPath, trackGraph);

  const candidateRoutes: FareQuote['candidateRoutes'] = [
    {
      id: 'actual',
      label: `実乗車経路（${actualPath.totalOperatingKm ?? '?'} km）`,
      path: actualPath,
      isBilledPath: !diff.pathsDiffer,
    },
  ];
  if (diff.pathsDiffer) {
    candidateRoutes.push({
      id: 'billed',
      label: suburbanApplied
        ? `運賃計算経路：東京近郊区間最短（${workingBilledPath.totalOperatingKm ?? '?'} km）`
        : art69AppliedCount > 0
          ? `運賃計算経路：第69条特定区間（${workingBilledPath.totalOperatingKm ?? '?'} km）`
          : `運賃計算経路：幹在同一視基準（${workingBilledPath.totalOperatingKm ?? '?'} km）`,
      path: workingBilledPath,
      isBilledPath: true,
    });
  }

  return {
    id: `sk:quote:${request.originStationId.replace('sk:station:', '')}--${request.destinationStationId.replace('sk:station:', '')}--${request.travelDate}`,
    status: 'OK',
    statusReason: 'Calculation succeeded under verified rule version.',
    request,
    isSyntheticTariff: tariffProvider.isSynthetic,
    tariffDisclaimer: tariffProvider.disclaimer,
    actualPath,
    billedPath: workingBilledPath,
    pathsDiffer: diff.pathsDiffer,
    pathDiffSummary: diff.summary,
    validityDays,
    stopoverAllowed,
    totalAmountYen,
    breakdown,
    explanation,
    ruleVersionUsed: ruleVersion.versionId,
    candidateRoutes,
    provenance: {
      sourceIds: [
        'src-ksj-n02-2024',
        'src-jr-east-ryokaku-2026',
        'src-jr-east-kippu-1101',
        'src-jr-east-kippu-1103',
        ...(tariffProvider.isSynthetic ? ['src-synthetic-fare-tariff'] : []),
      ],
      dataNature: tariffProvider.isSynthetic ? 'synthetic' : 'derived',
      lastVerifiedAt: '2026-11-21',
    },
  };
}
