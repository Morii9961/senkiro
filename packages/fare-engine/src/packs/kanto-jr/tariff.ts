import type { FareBillingContext, SurchargeQuoteResult, TariffProvider } from '@senkiro/contracts';
import { type JrOperatorScope, VERSIONS } from './rules.ts';

const DISCLAIMER =
  '示例数据，不可作为实际购票金额 / Synthetic sample tariff. Do not use for ticket purchases.';
export const SYNTHETIC_SOURCE_ID = 'sk:source:kanto:synthetic-fare-tariff';

const brackets = [
  [3, 150, 160],
  [6, 190, 200],
  [10, 200, 210],
  [15, 240, 260],
  [20, 330, 350],
  [25, 420, 450],
  [30, 510, 550],
  [35, 590, 640],
  [40, 680, 730],
  [45, 770, 830],
  [50, 860, 920],
  [60, 990, 1060],
  [70, 1170, 1250],
  [80, 1340, 1440],
  [90, 1520, 1630],
  [100, 1690, 1810],
  [120, 1980, 2120],
  [140, 2310, 2470],
  [160, 2640, 2820],
] as const;

export function createSyntheticKantoTariffs(): TariffProvider[] {
  const scopes: JrOperatorScope[] = ['jr-east', 'jr-central'];
  return VERSIONS.flatMap(({ ruleVersion, validFrom, validTo }, versionIndex) =>
    scopes.map(
      (operatorScope): TariffProvider => ({
        id: `kanto-demo-${operatorScope}-${ruleVersion}`,
        operatorScope,
        ruleVersion,
        validFrom,
        validTo,
        isSynthetic: true,
        sourceIds: [SYNTHETIC_SOURCE_ID],
        disclaimer: DISCLAIMER,
        lookupBaseFare({ operatingKm }) {
          const bracket = brackets.find(([maxKm]) => Math.ceil(operatingKm) <= maxKm);
          return bracket && operatingKm > 0
            ? {
                status: 'OK',
                amountYen: bracket[operatorScope === 'jr-central' || versionIndex === 0 ? 1 : 2],
                ruleId: 'JR-ART67-BASE',
              }
            : {
                status: 'MISSING_DATA',
                amountYen: null,
                reason: 'The synthetic table only covers positive distances up to 160 km.',
              };
        },
      }),
    ),
  );
}

export function lookupSyntheticSurcharge({
  request,
  actualPath,
}: FareBillingContext): SurchargeQuoteResult {
  const type = request.surchargeType;
  if (
    type === 'gran_class' &&
    !actualPath.legs.some(
      ({ railLineId }) => railLineId === 'sk:line:kanto:jr-east-tohoku-shinkansen',
    )
  ) {
    return {
      status: 'NOT_APPLICABLE',
      reason: 'Gran Class is supported only on the Tohoku Shinkansen in this slice.',
    };
  }
  const km = actualPath.totalOperatingKm;
  if (km === null || km <= 0) {
    return {
      status: 'MISSING_DATA',
      reason: 'The actual route has no known operating distance for the surcharge.',
    };
  }
  const bracket = km <= 50 ? 0 : km <= 100 ? 1 : 2;
  const base = (actualPath.usesShinkansen ? [870, 1760, 2530] : [760, 1020, 1580])[bracket] ?? 0;
  let amountYen: number;
  let label: string;
  switch (type) {
    case 'limited_express_non_reserved':
      amountYen = base;
      label = 'Non-reserved limited express';
      break;
    case 'limited_express_reserved':
      amountYen = base + 530;
      label = 'Reserved limited express';
      break;
    case 'green_car':
      amountYen = base + 530 + (km <= 100 ? 1300 : 2800);
      label = 'Green Car';
      break;
    case 'gran_class':
      amountYen = base + 530 + 6000;
      label = 'Gran Class';
      break;
    default:
      return {
        status: 'UNSUPPORTED',
        reason: 'The requested surcharge is unavailable for the Kanto JR slice.',
      };
  }
  const operatorId =
    actualPath.operatorsInvolved.length === 1 ? (actualPath.operatorsInvolved[0] ?? null) : null;
  return {
    status: 'OK',
    disclaimer: DISCLAIMER,
    sourceIds: [SYNTHETIC_SOURCE_ID],
    item: {
      label,
      productKind: 'surcharge',
      operatorId,
      distanceKm: km,
      amountYen,
      dataNature: 'synthetic',
      notes: DISCLAIMER,
    },
    steps: [
      {
        ruleId: `JR-SURCHARGE-${type.toUpperCase()}`,
        articleRef: '特別急行料金・座席料金',
        officialUrl: 'https://www.jreast.co.jp/ryokaku/',
        applied: true,
        status: 'APPLIED',
        reason: DISCLAIMER,
      },
    ],
  };
}
