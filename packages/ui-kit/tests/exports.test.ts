// @vitest-environment node
/**
 * P0-W2 follow-up #1: a production (rolldown) build drops the CSS side-effect imports in
 * `src/index.ts`, so apps must import the stylesheets through explicit subpaths. These
 * tests keep both subpaths exported and pointing at real files.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageRoot = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8')) as {
  exports: Record<string, unknown>;
  sideEffects: unknown;
};

describe('package exports', () => {
  it.each([
    ['./tokens.css', './src/styles/tokens.css'],
    ['./base.css', './src/styles/base.css'],
  ])('exports %s as %s', (subpath, target) => {
    expect(manifest.exports[subpath]).toBe(target);
    expect(existsSync(new URL(target, packageRoot))).toBe(true);
  });

  it('keeps CSS marked as side-effectful so explicit imports survive tree-shaking', () => {
    expect(manifest.sideEffects).toEqual(['**/*.css']);
  });

  it('base.css resets the body margin and box sizing', () => {
    const base = readFileSync(new URL('src/styles/base.css', packageRoot), 'utf8');
    expect(base).toMatch(/box-sizing:\s*border-box/);
    expect(base).toMatch(/body\s*\{\s*margin:\s*0;/);
    expect(base).toContain(':focus-visible');
  });
});
