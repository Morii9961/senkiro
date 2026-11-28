import { describe, expect, it } from 'vitest';
import { DOMAIN_CONTRACT_VERSION } from '../src/index.ts';

describe('package entry', () => {
  it('declares the implemented domain contract version', () => {
    expect(DOMAIN_CONTRACT_VERSION).toBe('1.0');
  });
});
