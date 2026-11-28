import { describe, expect, it } from 'vitest';
import {
  assertValidCommemorativeTicket,
  COMMEMORATIVE_WATERMARK,
  type CommemorativeTicket,
  type CommemorativeTicketDraft,
  ContractViolationError,
} from '../src/index.ts';
import { ticket } from './fixtures.ts';

function draft(overrides: Record<string, unknown>): CommemorativeTicketDraft {
  return ticket(overrides) as unknown as CommemorativeTicketDraft;
}

describe('assertValidCommemorativeTicket', () => {
  it('uses the exact non-valid watermark literal', () => {
    expect(COMMEMORATIVE_WATERMARK).toBe('SAMPLE · 記念用 · 乗車不可');
  });

  it('accepts a well-formed collectible ticket', () => {
    expect(() => assertValidCommemorativeTicket(ticket())).not.toThrow();
  });

  it('rejects a missing, altered or partial watermark', () => {
    for (const nonValidWatermark of [
      '',
      'SAMPLE',
      'SAMPLE · 記念用',
      'sample · 記念用 · 乗車不可',
    ]) {
      expect(
        () => assertValidCommemorativeTicket(draft({ nonValidWatermark })),
        nonValidWatermark,
      ).toThrow(ContractViolationError);
    }
  });

  it('rejects any ticket that enables barcodes', () => {
    expect(() => assertValidCommemorativeTicket(draft({ allowsBarcode: true }))).toThrow(
      /allowsBarcode must be false/,
    );
  });

  it('rejects truthy non-boolean barcode flags from untrusted JSON', () => {
    expect(() => assertValidCommemorativeTicket(draft({ allowsBarcode: 'false' }))).toThrow(
      ContractViolationError,
    );
  });

  it('rejects machine-readable payload fields (QR, barcode, magnetic stripe)', () => {
    for (const key of ['qrCode', 'barcodeData', 'magneticStripe', 'pdf417', 'nfcPayload']) {
      expect(() => assertValidCommemorativeTicket(draft({ [key]: 'x' })), key).toThrow(
        /machine-readable/,
      );
    }
  });

  it('rejects unknown templates and non-ticket IDs', () => {
    expect(() => assertValidCommemorativeTicket(draft({ templateId: 'real-jr-ticket' }))).toThrow(
      /templateId/,
    );
    expect(() => assertValidCommemorativeTicket(draft({ id: 'sk:ride:jp:x' }))).toThrow(
      /ticket SkId/,
    );
  });

  it('locks the watermark and barcode flag at the type level', () => {
    const base = ticket();
    // @ts-expect-error — allowsBarcode is the literal type `false`
    const withBarcode: CommemorativeTicket = { ...base, allowsBarcode: true };
    // @ts-expect-error — the watermark must be the exact literal
    const noWatermark: CommemorativeTicket = { ...base, nonValidWatermark: 'SAMPLE' };
    expect([withBarcode, noWatermark]).toHaveLength(2);
  });
});
