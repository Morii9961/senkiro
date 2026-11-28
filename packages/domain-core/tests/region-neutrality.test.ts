import { describe, expect, it } from 'vitest';

declare global {
  interface ImportMeta {
    glob(
      pattern: string,
      options: { query: '?raw'; import: 'default'; eager: true },
    ): Record<string, string>;
  }
}

const sources = import.meta.glob('../src/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Regional identifiers that must never appear in the region-neutral core. */
const FORBIDDEN = [
  /tokyo/i,
  /kanto/i,
  /kansai/i,
  /osaka/i,
  /jr-east/i,
  /jr-central/i,
  /jr-west/i,
  /139\.\d+/, // Tokyo-area longitude literals (Lab A projection origin)
  /['"`]sk:(operator|line|station|segment|complex):/, // hard-coded entity IDs
];

describe('domain-core stays region-neutral (no Lab A Tokyo hard-coding)', () => {
  it('scans every source file', () => {
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(6);
  });

  for (const [file, text] of Object.entries(sources)) {
    it(`${file} contains no regional literal`, () => {
      for (const pattern of FORBIDDEN) {
        expect(pattern.test(text), `${file} matches ${pattern}`).toBe(false);
      }
    });
  }

  it('imports no DOM, React, Three.js or Node APIs', () => {
    for (const [file, text] of Object.entries(sources)) {
      expect(/from ['"](react|three|node:[a-z]+)['"]/.test(text), file).toBe(false);
      expect(/\b(window|document|navigator)\./.test(text), file).toBe(false);
    }
  });
});
