/**
 * Graph 4 · FarePassGraph (contract §5.4): versioned fare rules, six-state fare quotes with
 * explanation trees, region plug-ins and pass products.
 */
import type { BaseEntity, DataNature, Provenance } from './base.ts';
import type { SkId } from './ids.ts';
import type { LineClass, Station } from './track.ts';

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
  /** Source records attributing the tariff table itself; merged into quote provenance. */
  readonly sourceIds?: readonly string[];
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
 * An honest refusal returned by an optional rule-pack hook. It aborts pricing with the
 * given non-`OK` status; it can never carry an amount.
 */
export interface FareRuleRejection {
  status: UnpricedFareQuoteStatus;
  reason: string;
  steps?: FareExplanationStep[];
}

/** Input of {@link RegionalFareRulePack.precheck}: the request and its resolved endpoints. */
export interface FarePrecheckContext {
  request: FareQuoteRequest;
  origin: Station;
  destination: Station;
}

/**
 * Contract-owned route-search guidance returned by
 * {@link RegionalFareRulePack.resolveRoutePreference}. It deliberately uses plain IDs and
 * flags rather than any engine search type, so `@senkiro/contracts` stays independent of
 * `@senkiro/domain-core`; the engine translates it into its own path-search options.
 */
export interface FareRulePreferencePlan {
  /** Ordered waypoints (used only when the request names no `viaStationIds`). */
  viaStationIds?: readonly SkId<'station'>[];
  /** Lines whose segments the search should favour. */
  preferredLineIds?: readonly SkId<'line'>[];
  /** Search weight factor for preferred lines (engine default when omitted). */
  preferredLineWeightFactor?: number;
  /** Segments whose every line is avoided are skipped. */
  avoidedLineIds?: readonly SkId<'line'>[];
  allowShinkansen?: boolean;
  allowLocalLines?: boolean;
  /** Every traversed segment must carry this fare-zone tag. */
  requireFareZoneTag?: string;
}

/** Context handed to hooks that run once the billing path is known. */
export interface FareBillingContext extends FareRulePackContext {
  billedPath: ResolvedPath;
}

/** Result of {@link RegionalFareRulePack.computeValidityAndStopover}. `null` = not established. */
export interface FareValidityResult {
  validityDays: number | null;
  stopoverAllowed: boolean | null;
  rejection?: FareRuleRejection;
}

/** One distance unit priced against one operator scope's tariff. */
export interface FarePricingUnit {
  /** Must match a {@link TariffProvider.operatorScope}. */
  operatorScope: string;
  /** Operator shown on the breakdown line; `null` for a through (multi-operator) unit. */
  operatorId: SkId<'operator'> | null;
  operatingKm: number;
  fareZoneTags: readonly string[];
}

/** A priced seat/limited-express charge with provenance. */
export interface PricedSurchargeQuote {
  status: 'OK';
  item: FareBreakdownItem;
  disclaimer: string | null;
  steps?: FareExplanationStep[];
  sourceIds?: readonly string[];
}

/** {@link RegionalFareRulePack.lookupSurcharge}: a priced charge or an honest refusal. */
export type SurchargeQuoteResult = PricedSurchargeQuote | FareRuleRejection;

/** Narrow any optional-hook result to its refusal branch. */
export function isFareRuleRejection(value: unknown): value is FareRuleRejection {
  if (typeof value !== 'object' || value === null || !('status' in value)) {
    return false;
  }
  const { status, reason } = value as { status: unknown; reason?: unknown };
  return (
    typeof status === 'string' &&
    status !== 'OK' &&
    (FARE_QUOTE_STATUSES as readonly string[]).includes(status) &&
    typeof reason === 'string'
  );
}

/**
 * Region/operator plug-in carrying suburban-area, Article 69, specific-fare and seat
 * surcharge rules, so the fare engine itself contains no regional hard-coding.
 *
 * The hooks below `evaluate` are optional extensions (promoted from P0-S1); a pack written
 * against the original v1.0 surface remains valid as-is.
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
  /** Checks before path resolution (ticket type, coverage); `null` = proceed. */
  precheck?(context: FarePrecheckContext): FareRuleRejection | null;
  /** Resolve `pack:*` and default preferences; `null` = no special guidance. */
  resolveRoutePreference?(
    request: FareQuoteRequest,
  ): FareRulePreferencePlan | FareRuleRejection | null;
  /** Active rule version on the travel date within this registration; `null` = none in force. */
  resolveRuleVersion?(travelDate: string): string | null;
  computeValidityAndStopover?(context: FareBillingContext): FareValidityResult;
  /** Through or per-operator distance units; the engine defaults to one unit per operator. */
  pricingUnits?(context: FareBillingContext): readonly FarePricingUnit[];
  lookupSurcharge?(context: FareBillingContext): SurchargeQuoteResult;
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
