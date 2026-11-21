/**
 * Fare Tariff Provider Interface & Synthetic Rule-Verification Demo Tariff.
 *
 * Honesty constraint (Shared Contract §1.5 & Prompt):
 * Because complete, redistributable, up-to-date official fare tables for all JR companies
 * and post-2026-03-14 cross-company add-on tables cannot be guaranteed without a licensed API,
 * this prototype runs in "Rule Verification Demo Mode" using explicitly marked `synthetic`
 * tariffs, while providing `FareTariffProvider` as a clean extension point for future licensed
 * providers (e.g., Ekispert / official JR tariff feeds).
 */

import type { DataNature, SkId, SurchargeType } from './types.js';

export interface BaseFareLookupInput {
  operatorId: SkId<'operator'>;
  billedKmCeil: number;
  travelDate: string;
  ruleVersionId: string;
  isCrossCompanySegment?: boolean;
}

export interface BaseFareLookupResult {
  available: boolean;
  amountYen: number | null;
  dataNature: DataNature;
  sourceId: string;
  disclaimer: string | null;
  bracketLabel: string;
  unavailableReason?: string;
}

export interface SurchargeLookupInput {
  surchargeType: Exclude<SurchargeType, 'none'>;
  isShinkansen: boolean;
  billedKmCeil: number;
  travelDate: string;
}

export interface SurchargeLookupResult {
  available: boolean;
  amountYen: number | null;
  dataNature: DataNature;
  sourceId: string;
  disclaimer: string | null;
  label: string;
  unavailableReason?: string;
}

export interface FareTariffProvider {
  readonly providerId: string;
  readonly isSynthetic: boolean;
  readonly disclaimer: string | null;
  lookupBaseFare(input: BaseFareLookupInput): BaseFareLookupResult;
  lookupSurcharge(input: SurchargeLookupInput): SurchargeLookupResult;
}

export const SYNTHETIC_DISCLAIMER =
  '示例数据，不可作为实际购票金额 / Sample synthetic tariff for rule verification — NOT official ticket prices.';

const SYNTHETIC_BASE_BRACKETS: { maxKm: number; v2025Yen: number; v2026Yen: number }[] = [
  { maxKm: 3, v2025Yen: 150, v2026Yen: 160 },
  { maxKm: 6, v2025Yen: 190, v2026Yen: 200 },
  { maxKm: 10, v2025Yen: 200, v2026Yen: 210 },
  { maxKm: 15, v2025Yen: 240, v2026Yen: 260 },
  { maxKm: 20, v2025Yen: 330, v2026Yen: 350 },
  { maxKm: 25, v2025Yen: 420, v2026Yen: 450 },
  { maxKm: 30, v2025Yen: 510, v2026Yen: 550 },
  { maxKm: 35, v2025Yen: 590, v2026Yen: 640 },
  { maxKm: 40, v2025Yen: 680, v2026Yen: 730 },
  { maxKm: 45, v2025Yen: 770, v2026Yen: 830 },
  { maxKm: 50, v2025Yen: 860, v2026Yen: 920 },
  { maxKm: 60, v2025Yen: 990, v2026Yen: 1060 },
  { maxKm: 70, v2025Yen: 1170, v2026Yen: 1250 },
  { maxKm: 80, v2025Yen: 1340, v2026Yen: 1440 },
  { maxKm: 90, v2025Yen: 1520, v2026Yen: 1630 },
  { maxKm: 100, v2025Yen: 1690, v2026Yen: 1810 },
  { maxKm: 120, v2025Yen: 1980, v2026Yen: 2120 },
  { maxKm: 140, v2025Yen: 2310, v2026Yen: 2470 },
  { maxKm: 160, v2025Yen: 2640, v2026Yen: 2820 },
];

export class SyntheticDemoTariffProvider implements FareTariffProvider {
  readonly providerId = 'synthetic-demo-tariff-v1';
  readonly isSynthetic = true;
  readonly disclaimer = SYNTHETIC_DISCLAIMER;

  lookupBaseFare(input: BaseFareLookupInput): BaseFareLookupResult {
    if (input.billedKmCeil <= 0) {
      return {
        available: false,
        amountYen: null,
        dataNature: 'synthetic',
        sourceId: 'src-synthetic-fare-tariff',
        disclaimer: this.disclaimer,
        bracketLabel: 'invalid',
        unavailableReason: 'Billing distance must be > 0 km',
      };
    }

    const bracket = SYNTHETIC_BASE_BRACKETS.find((b) => input.billedKmCeil <= b.maxKm);
    if (!bracket) {
      return {
        available: false,
        amountYen: null,
        dataNature: 'synthetic',
        sourceId: 'src-synthetic-fare-tariff',
        disclaimer: this.disclaimer,
        bracketLabel: `>${SYNTHETIC_BASE_BRACKETS[SYNTHETIC_BASE_BRACKETS.length - 1]?.maxKm}km`,
        unavailableReason: `Distance ${input.billedKmCeil} km exceeds synthetic demo tariff table range (max 160 km).`,
      };
    }

    // Use distinct synthetic schedule for JR Central vs JR East v2026 to demonstrate company/version separation
    const isJrCentral = input.operatorId === 'sk:operator:jr-central';
    const amountYen =
      isJrCentral || input.ruleVersionId === 'jr-fare-v2025'
        ? bracket.v2025Yen
        : bracket.v2026Yen;

    return {
      available: true,
      amountYen,
      dataNature: 'synthetic',
      sourceId: 'src-synthetic-fare-tariff',
      disclaimer: this.disclaimer,
      bracketLabel: `≤ ${bracket.maxKm} km (${isJrCentral ? 'JR東海・合成' : input.ruleVersionId === 'jr-fare-v2026' ? 'JR東日本 2026版・合成' : 'JR東日本 2025版・合成'})`,
    };
  }

  lookupSurcharge(input: SurchargeLookupInput): SurchargeLookupResult {
    const baseLtd = input.isShinkansen
      ? input.billedKmCeil <= 50
        ? 870
        : input.billedKmCeil <= 100
          ? 1760
          : 2530
      : input.billedKmCeil <= 50
        ? 760
        : input.billedKmCeil <= 100
          ? 1020
          : 1580;

    let amountYen = baseLtd;
    let label = '';

    switch (input.surchargeType) {
      case 'limited_express_non_reserved':
        label = input.isShinkansen
          ? '新幹線自由席特急料金（合成デモ）'
          : '在来線自由席特急料金（合成デモ）';
        break;
      case 'limited_express_reserved':
        amountYen = baseLtd + 530;
        label = input.isShinkansen
          ? '新幹線指定席特急料金（合成デモ）'
          : '在来線指定席特急料金（合成デモ）';
        break;
      case 'green_car':
        amountYen = baseLtd + 530 + (input.billedKmCeil <= 100 ? 1300 : 2800);
        label = input.isShinkansen
          ? '新幹線グリーン料金＋指定席特急（合成デモ）'
          : '在来線グリーン料金＋指定席特急（合成デモ）';
        break;
      case 'gran_class':
        if (!input.isShinkansen) {
          return {
            available: false,
            amountYen: null,
            dataNature: 'synthetic',
            sourceId: 'src-synthetic-fare-tariff',
            disclaimer: this.disclaimer,
            label: 'グランクラス',
            unavailableReason: 'グランクラスは対応新幹線（東北新幹線等）のみ設定。在来線には適用不可。',
          };
        }
        amountYen = baseLtd + 530 + 6000;
        label = '新幹線グランクラス料金＋特急（合成デモ・東北新幹線等対象）';
        break;
    }

    return {
      available: true,
      amountYen,
      dataNature: 'synthetic',
      sourceId: 'src-synthetic-fare-tariff',
      disclaimer: this.disclaimer,
      label,
    };
  }
}

/**
 * Provider stub representing a missing/unconfigured tariff source (used for MISSING_DATA verification).
 */
export class MissingTariffProvider implements FareTariffProvider {
  readonly providerId = 'missing-tariff-provider';
  readonly isSynthetic = false;
  readonly disclaimer = null;

  lookupBaseFare(): BaseFareLookupResult {
    return {
      available: false,
      amountYen: null,
      dataNature: 'unknown',
      sourceId: 'none',
      disclaimer: null,
      bracketLabel: 'unavailable',
      unavailableReason: '運賃表データ未接続のため正確金額を出力できません（MISSING_DATA）。',
    };
  }

  lookupSurcharge(): SurchargeLookupResult {
    return {
      available: false,
      amountYen: null,
      dataNature: 'unknown',
      sourceId: 'none',
      disclaimer: null,
      label: 'unavailable',
      unavailableReason: '料金表データ未接続のため正確金額を出力できません（MISSING_DATA）。',
    };
  }
}
