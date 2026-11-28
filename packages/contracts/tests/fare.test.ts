import { describe, expect, it } from 'vitest';
import {
  assertHonestFareQuote,
  ContractViolationError,
  createUnpricedFareQuote,
  FARE_QUOTE_STATUSES,
  type FareQuote,
  type UnpricedFareQuote,
} from '../src/index.ts';
import { breakdownItem, quoteDraft } from './fixtures.ts';

function violation(fn: () => void): ContractViolationError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ContractViolationError) {
      return error;
    }
    throw error;
  }
  throw new Error('expected a ContractViolationError');
}

const UNPRICED = FARE_QUOTE_STATUSES.filter((status) => status !== 'OK');

describe('assertHonestFareQuote', () => {
  it('accepts an OK quote whose breakdown sums to the total', () => {
    const quote = quoteDraft();
    expect(() => assertHonestFareQuote(quote)).not.toThrow();
  });

  it('accepts every non-OK status with null total and empty breakdown', () => {
    expect(UNPRICED).toHaveLength(5);
    for (const status of UNPRICED) {
      const quote = quoteDraft({ status, totalAmountYen: null, breakdown: [], statusReason: 'x' });
      expect(() => assertHonestFareQuote(quote), status).not.toThrow();
    }
  });

  it('refuses to let any non-OK status expose a yen amount', () => {
    for (const status of UNPRICED) {
      const error = violation(() =>
        assertHonestFareQuote(quoteDraft({ status, totalAmountYen: 210, breakdown: [] })),
      );
      expect(error.code).toBe('DISHONEST_FARE_QUOTE');
    }
  });

  it('refuses a partial breakdown on a non-OK status', () => {
    const error = violation(() =>
      assertHonestFareQuote(
        quoteDraft({
          status: 'MISSING_DATA',
          totalAmountYen: null,
          breakdown: [breakdownItem(200)],
        }),
      ),
    );
    expect(error.issues.join(' ')).toMatch(/empty breakdown/);
  });

  it('requires a status reason on non-OK quotes', () => {
    expect(() =>
      assertHonestFareQuote(
        quoteDraft({
          status: 'UNSUPPORTED',
          totalAmountYen: null,
          breakdown: [],
          statusReason: ' ',
        }),
      ),
    ).toThrow(ContractViolationError);
  });

  it('rejects an OK quote with no amount, a fractional amount or a negative amount', () => {
    for (const totalAmountYen of [null, 210.5, -10]) {
      expect(
        () => assertHonestFareQuote(quoteDraft({ totalAmountYen })),
        String(totalAmountYen),
      ).toThrow(ContractViolationError);
    }
  });

  it('rejects an OK quote whose total is not explained by its breakdown', () => {
    expect(() => assertHonestFareQuote(quoteDraft({ breakdown: [] }))).toThrow(
      /non-empty breakdown/,
    );
    expect(() => assertHonestFareQuote(quoteDraft({ totalAmountYen: 999 }))).toThrow(/sums to 300/);
    expect(() =>
      assertHonestFareQuote(quoteDraft({ breakdown: [breakdownItem(300), breakdownItem(null)] })),
    ).toThrow(/breakdown\[1\]/);
  });

  it('requires a disclaimer on synthetic tariffs', () => {
    expect(() => assertHonestFareQuote(quoteDraft({ tariffDisclaimer: null }))).toThrow(
      /tariffDisclaimer/,
    );
    expect(() =>
      assertHonestFareQuote(quoteDraft({ isSyntheticTariff: false, tariffDisclaimer: null })),
    ).not.toThrow();
  });

  it('rejects unknown statuses coming from untrusted JSON', () => {
    const payload = JSON.parse(JSON.stringify(quoteDraft())) as ReturnType<typeof quoteDraft>;
    (payload as { status: string }).status = 'ESTIMATED';
    expect(() => assertHonestFareQuote(payload)).toThrow(/unknown status/);
  });

  it('collects every issue instead of stopping at the first', () => {
    const error = violation(() =>
      assertHonestFareQuote(
        quoteDraft({
          status: 'STALE_RULE',
          totalAmountYen: 300,
          breakdown: [breakdownItem(300)],
          statusReason: '',
          tariffDisclaimer: null,
        }),
      ),
    );
    expect(error.issues).toHaveLength(4);
  });

  it('narrows a draft to the FareQuote union after the assertion', () => {
    const quote = quoteDraft({ status: 'ERROR', totalAmountYen: null, breakdown: [] });
    assertHonestFareQuote(quote);
    const narrowed: FareQuote = quote;
    if (narrowed.status !== 'OK') {
      const amount: null = narrowed.totalAmountYen;
      expect(amount).toBeNull();
    }
  });
});

describe('FareQuote type lock and createUnpricedFareQuote', () => {
  it('builds non-OK quotes that cannot carry an amount', () => {
    const {
      status: _s,
      totalAmountYen: _t,
      breakdown: _b,
      statusReason: _r,
      ...base
    } = quoteDraft();
    const quote = createUnpricedFareQuote(base, 'MISSING_DATA', 'segment km unknown');
    expect(quote.totalAmountYen).toBeNull();
    expect(quote.breakdown).toEqual([]);
    expect(quote.explanation).toEqual([]);
    expect(() => assertHonestFareQuote(quote)).not.toThrow();
  });

  it('rejects at compile time a non-OK quote carrying yen', () => {
    const { status: _s, totalAmountYen: _t, breakdown: _b, ...base } = quoteDraft();
    const bad: UnpricedFareQuote = {
      ...base,
      status: 'MISSING_DATA',
      // @ts-expect-error — totalAmountYen is typed `null` on every non-OK status
      totalAmountYen: 210,
      breakdown: [],
    };
    const badBreakdown: UnpricedFareQuote = {
      ...base,
      status: 'UNSUPPORTED',
      totalAmountYen: null,
      // @ts-expect-error — breakdown is typed as the empty tuple on non-OK statuses
      breakdown: [breakdownItem(100)],
    };
    expect([bad, badBreakdown]).toHaveLength(2);
  });
});
