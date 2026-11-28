/**
 * Runtime honesty guards for the hard invariants of contract §1. Each guard collects every
 * problem it finds and throws one {@link ContractViolationError} listing them all.
 */
import type { Provenance, SourceRecord } from './base.ts';
import { ContractViolationError } from './errors.ts';
import { FARE_QUOTE_STATUSES, type FareQuote, type FareQuoteDraft } from './fare.ts';
import { isSkId } from './ids.ts';
import {
  COMMEMORATIVE_TEMPLATE_IDS,
  COMMEMORATIVE_WATERMARK,
  type CommemorativeTicket,
} from './journey.ts';

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

function isYenAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Invariant 3 (runtime half). Non-`OK` quotes must have `totalAmountYen === null` and an
 * empty `breakdown`. `OK` quotes must carry a whole-yen total that equals the sum of a
 * non-empty, fully priced breakdown. Synthetic tariffs must carry a disclaimer (invariant 4).
 */
export function assertHonestFareQuote(
  quote: FareQuote | FareQuoteDraft,
): asserts quote is FareQuote {
  const issues: string[] = [];
  const status: unknown = quote.status;
  const breakdown: unknown = quote.breakdown;
  const total: unknown = quote.totalAmountYen;

  if (!(FARE_QUOTE_STATUSES as readonly unknown[]).includes(status)) {
    issues.push(`unknown status ${JSON.stringify(status)}`);
  }
  if (!Array.isArray(breakdown)) {
    issues.push('breakdown must be an array');
  }

  if (status === 'OK') {
    if (!isYenAmount(total)) {
      issues.push(`OK quote needs a non-negative whole-yen totalAmountYen, got ${String(total)}`);
    }
    if (Array.isArray(breakdown)) {
      if (breakdown.length === 0) {
        issues.push('OK quote must explain its total with a non-empty breakdown');
      }
      let sum = 0;
      let allPriced = true;
      for (const [index, item] of breakdown.entries()) {
        const amount: unknown = (item as { amountYen?: unknown } | null)?.amountYen;
        if (isYenAmount(amount)) {
          sum += amount;
        } else {
          allPriced = false;
          issues.push(`OK quote breakdown[${index}] has no whole-yen amountYen`);
        }
      }
      if (allPriced && isYenAmount(total) && breakdown.length > 0 && sum !== total) {
        issues.push(`breakdown sums to ${sum} yen but totalAmountYen is ${total}`);
      }
    }
  } else {
    if (total !== null) {
      issues.push(
        `status ${String(status)} must not expose an amount (totalAmountYen=${String(total)})`,
      );
    }
    if (Array.isArray(breakdown) && breakdown.length > 0) {
      issues.push(`status ${String(status)} must have an empty breakdown`);
    }
    if (isBlank(quote.statusReason)) {
      issues.push(`status ${String(status)} must state a statusReason`);
    }
  }

  if (quote.isSyntheticTariff && isBlank(quote.tariffDisclaimer)) {
    issues.push('synthetic tariff quotes must carry a tariffDisclaimer');
  }

  if (issues.length > 0) {
    throw new ContractViolationError('DISHONEST_FARE_QUOTE', issues);
  }
}

/** A ticket as produced by an editor or a JSON payload, before validation. */
export type CommemorativeTicketDraft = Omit<
  CommemorativeTicket,
  'nonValidWatermark' | 'allowsBarcode' | 'templateId'
> & {
  nonValidWatermark: string;
  allowsBarcode: boolean;
  templateId: string;
};

/** Field names suggesting a machine-readable code. Their presence alone is a violation. */
const MACHINE_READABLE_KEY = /qr|bar_?code|magnetic|mag_?stripe|nfc|aztec|data_?matrix|pdf_?417/i;

/**
 * Invariant 5. The ticket must be a non-valid collectible: exact watermark literal, barcode
 * permanently disabled, a known template, a `ticket` SkId, and no field that could carry a
 * QR code, barcode or magnetic stripe payload.
 */
export function assertValidCommemorativeTicket(
  ticket: CommemorativeTicket | CommemorativeTicketDraft,
): asserts ticket is CommemorativeTicket {
  const issues: string[] = [];
  if (ticket.nonValidWatermark !== COMMEMORATIVE_WATERMARK) {
    issues.push(
      `nonValidWatermark must be exactly ${JSON.stringify(COMMEMORATIVE_WATERMARK)}, got ${JSON.stringify(ticket.nonValidWatermark)}`,
    );
  }
  if (ticket.allowsBarcode !== false) {
    issues.push('allowsBarcode must be false');
  }
  if (!(COMMEMORATIVE_TEMPLATE_IDS as readonly string[]).includes(ticket.templateId)) {
    issues.push(`unknown templateId ${JSON.stringify(ticket.templateId)}`);
  }
  if (!isSkId(ticket.id, 'ticket')) {
    issues.push(`id ${JSON.stringify(ticket.id)} is not a ticket SkId`);
  }
  for (const key of Object.keys(ticket)) {
    if (key !== 'allowsBarcode' && MACHINE_READABLE_KEY.test(key)) {
      issues.push(`machine-readable field "${key}" is forbidden on commemorative tickets`);
    }
  }
  if (issues.length > 0) {
    throw new ContractViolationError('INVALID_COMMEMORATIVE_TICKET', issues);
  }
}

export interface ProvenancedRecord {
  id?: string;
  provenance: Provenance;
}

/** A main (CC BY / commercial-compatible) dataset to be checked for ODbL contamination. */
export interface MainDatasetForIsolationCheck {
  sources: readonly SourceRecord[];
  records: readonly ProvenancedRecord[];
}

/**
 * Invariant 7. A main dataset must not register or reference any share-alike source
 * (e.g. OpenStreetMap, ODbL 1.0). A source whose share-alike status is `'unknown'` is
 * rejected too: its licence must be resolved first. Every referenced `sourceId` must
 * resolve in the dataset's own registry, otherwise isolation cannot be verified.
 * ODbL layers (e.g. `TrackVerticalLayer`, urban chunks) belong in separate datasets and
 * join main data only by `SkId`.
 */
export function assertOdbLIsolation(dataset: MainDatasetForIsolationCheck): void {
  const issues: string[] = [];
  const registry = new Map<string, SourceRecord>();
  for (const source of dataset.sources) {
    registry.set(source.id, source);
    if (source.shareAlike === true) {
      issues.push(`share-alike source "${source.id}" (${source.license}) is in the main dataset`);
    } else if (source.shareAlike === 'unknown') {
      issues.push(`source "${source.id}" has unknown share-alike status`);
    }
  }
  for (const [index, record] of dataset.records.entries()) {
    const label = record.id ?? `records[${index}]`;
    for (const sourceId of record.provenance.sourceIds) {
      if (!registry.has(sourceId)) {
        issues.push(`${label} references unregistered source "${sourceId}"`);
      }
    }
  }
  if (issues.length > 0) {
    throw new ContractViolationError('ODBL_ISOLATION_VIOLATION', issues);
  }
}
