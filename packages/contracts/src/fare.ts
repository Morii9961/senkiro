/**
 * Graph 4 · FarePassGraph (contract §5.4): versioned fare rules, six-state fare quotes with
 * explanation trees, region plug-ins and pass products.
 */
import type { BaseEntity, DataNature, Provenance } from './base.ts';
import type { SkId } from './ids.ts';
import type { LineClass } from './track.ts';

export type FareRuleCategory =
  | 'base_fare'
  | 'specific_section'
  | 'suburban_area'
  | 'shinkansen_equivalence'
  | 'local_line_conversion'
  | 'cross_company'
  | 'surcharge'
  | 'pass';

export interface FareRule extends BaseEntity<'rule'> {
  ruleId: string;
  /** e.g. `'jr-west'`, `'jr-east'`, `'kansai-private'`. */
  operatorScope: string;
  articleRef: string;
  officialUrl: string;
  category: FareRuleCategory;
  summary: string;
  preconditions: string[];
  exceptions: string[];
}

export type TicketType = 'ordinary_paper' | 'ic_card';

export type SurchargeType =
  | 'none'
  | 'limited_express_non_reserved'
  | 'limited_express_reserved'
  | 'green_car'
  | 'gran_class'
  | 'privace'
  | 'premium_car'
  | 'kintetsu_limited_express'
  | 'hinotori';

export interface FareProduct extends BaseEntity<'product'> {
  productKind: 'base_fare' | 'surcharge';
  ticketType?: TicketType;
  surchargeType?: SurchargeType;
  tariffNature: DataNature;
  disclaimer: string | null;
}

export const FARE_QUOTE_STATUSES = [
  'OK',
  'NOT_APPLICABLE',
  'MISSING_DATA',
  'UNSUPPORTED',
  'STALE_RULE',
  'ERROR',
] as const;

export type FareQuoteStatus = (typeof FARE_QUOTE_STATUSES)[number];
export type UnpricedFareQuoteStatus = Exclude<FareQuoteStatus, 'OK'>;

export interface FareExplanationStep {
  ruleId: string;
  articleRef: string;
  officialUrl: string;
  applied: boolean;
  status: 'APPLIED' | 'REJECTED' | 'NOT_APPLICABLE' | 'WARNING';
  reason: string;
  details?: string;
}

export interface PathLeg {
  segmentId: SkId<'segment'>;
  fromStationId: SkId<'station'>;
  toStationId: SkId<'station'>;
  railLineId: SkId<'line'>;
  operatorId: SkId<'operator'>;
  operatingKm: number | null;
  isShinkansen: boolean;
  lineClass: LineClass;
}

export interface ResolvedPath {
  stationIds: SkId<'station'>[];
  segmentIds: SkId<'segment'>[];
  legs: PathLeg[];
  /** `null` as soon as any leg's operating km is unknown; never a partial sum. */
  totalOperatingKm: number | null;
  operatorsInvolved: SkId<'operator'>[];
  usesShinkansen: boolean;
  usesLocalLine: boolean;
  /** Fare-zone tags shared by every leg (replaces the Lab A Tokyo-only boolean). */
  commonFareZoneTags: string[];
  hasRepeatedStationOrSegment: boolean;
}

export interface FareBreakdownItem {
  label: string;
  productKind: 'base_fare' | 'surcharge';
  operatorId: SkId<'operator'> | null;
  distanceKm: number | null;
  amountYen: number | null;
  dataNature: DataNature;
  notes: string;
}

/** Route preference; region packs add their own as `pack:<name>` (no regional hard-coding). */
export type FareRoutePreference = 'shortest' | 'shinkansen' | `pack:${string}`;

export interface FareQuoteRequest {
  originStationId: SkId<'station'>;
  destinationStationId: SkId<'station'>;
  viaStationIds?: SkId<'station'>[];
  actualSegmentIds?: SkId<'segment'>[];
  preferShinkansen?: boolean;
  routePreference?: FareRoutePreference;
  /** `YYYY-MM-DD`. */
  travelDate: string;
  ticketType: TicketType;
  requireStopover?: boolean;
  surchargeType?: SurchargeType;
}

export interface FareCandidateRoute {
  id: string;
  label: string;
  path: ResolvedPath;
  isBilledPath: boolean;
}

interface FareQuoteCommon {
  id: SkId<'quote'>;
  statusReason: string;
  request: FareQuoteRequest;
  isSyntheticTariff: boolean;
  tariffDisclaimer: string | null;
  actualPath: ResolvedPath | null;
  billedPath: ResolvedPath | null;
  pathsDiffer: boolean;
  pathDiffSummary: string | null;
  validityDays: number | null;
  stopoverAllowed: boolean | null;
  explanation: FareExplanationStep[];
  ruleVersionUsed: string | null;
  candidateRoutes?: FareCandidateRoute[];
  provenance: Provenance;
}

export interface PricedFareQuote extends FareQuoteCommon {
  status: 'OK';
  totalAmountYen: number;
  breakdown: FareBreakdownItem[];
}

/** Invariant 3, type half: any non-`OK` quote carries no amount and no breakdown. */
export interface UnpricedFareQuote extends FareQuoteCommon {
  status: UnpricedFareQuoteStatus;
  totalAmountYen: null;
  breakdown: [];
}

export type FareQuote = PricedFareQuote | UnpricedFareQuote;

/**
 * The undiscriminated shape an engine or a JSON payload produces before validation.
 * `assertHonestFareQuote` narrows it to {@link FareQuote}.
 */
export interface FareQuoteDraft extends FareQuoteCommon {
  status: FareQuoteStatus;
  totalAmountYen: number | null;
  breakdown: FareBreakdownItem[];
}

export type FareQuoteBaseFields = Omit<
  FareQuoteCommon,
  'statusReason' | 'explanation' | 'pathsDiffer' | 'pathDiffSummary'
> &
  Partial<Pick<FareQuoteCommon, 'explanation' | 'pathsDiffer' | 'pathDiffSummary'>>;

/** Build a non-`OK` quote that structurally cannot leak an amount. */
export function createUnpricedFareQuote(
  base: FareQuoteBaseFields,
  status: UnpricedFareQuoteStatus,
  statusReason: string,
): UnpricedFareQuote {
  return {
    ...base,
    explanation: base.explanation ?? [],
    pathsDiffer: base.pathsDiffer ?? false,
    pathDiffSummary: base.pathDiffSummary ?? null,
    status,
    statusReason,
    totalAmountYen: null,
    breakdown: [],
  };
}

export interface TariffLookupInput {
  operatingKm: number;
  ticketType: TicketType;
  /** `YYYY-MM-DD`; selects the tariff version in force. */
  travelDate: string;
  fareZoneTags: readonly string[];
}

export type TariffLookupResult =
  | { status: 'OK'; amountYen: number; ruleId: string }
  | { status: UnpricedFareQuoteStatus; amountYen: null; reason: string };

/** Distance-to-fare table lookup for one operator scope and tariff version. */
export interface TariffProvider {
  readonly id: string;
  readonly operatorScope: string;
  readonly ruleVersion: string;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly isSynthetic: boolean;
  readonly disclaimer: string | null;
  lookupBaseFare(input: TariffLookupInput): TariffLookupResult;
}

export interface FareRulePackContext {
  request: FareQuoteRequest;
  actualPath: ResolvedPath;
}

export interface FareRulePackOutcome {
  /** Path to bill (may differ from the actual path, e.g. specific-section rules). */
  billedPath: ResolvedPath | null;
  steps: FareExplanationStep[];
  /** Non-`OK` aborts pricing with that status. */
  status: FareQuoteStatus;
  statusReason: string;
}

/**
 * Region/operator plug-in carrying suburban-area, Article 69, specific-fare and seat
 * surcharge rules, so the fare engine itself contains no regional hard-coding.
 */
export interface RegionalFareRulePack {
  readonly id: string;
  readonly region: string;
  readonly operatorScopes: readonly string[];
  readonly ruleVersion: string;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly rules: readonly FareRule[];
  readonly fareZoneTags: readonly string[];
  readonly tariffProviders: readonly TariffProvider[];
  appliesTo(context: FareRulePackContext): boolean;
  evaluate(context: FareRulePackContext): FareRulePackOutcome;
}

export interface PassProduct extends BaseEntity<'pass'> {
  issuerOperatorId: SkId<'operator'>;
  validityDays: number | null;
  coveredSegmentIds: SkId<'segment'>[];
  coveredLineIds: SkId<'line'>[];
  /** e.g. Nozomi/Mizuho restrictions. */
  excludedTrainCategories: string[];
  requiresSupplementFor: SurchargeType[];
  officialPriceYen: number | null;
  rulesSummary: string;
}

export interface PassEligibility {
  passId: SkId<'pass'>;
  eligible: boolean | 'unverified';
  reason: string;
  uncoveredSegmentIds: SkId<'segment'>[];
  requiredSupplements: SurchargeType[];
}

export interface FarePassGraph {
  rules: FareRule[];
  products: FareProduct[];
  passes: PassProduct[];
}
