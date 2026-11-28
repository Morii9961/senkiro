// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

function colorTokenNames(css: string | undefined): string[] {
  return [...(css ?? '').matchAll(/(--sk-color-[\w-]+):/g)].map((match) => match[1] ?? '').sort();
}

describe('design tokens', () => {
  it('ships the graphite dark palette and a light theme', () => {
    expect(tokens).toContain('--sk-color-canvas: #181c22;');
    expect(tokens).toContain('--sk-color-surface: #262b33;');
    expect(tokens).toMatch(/\[data-theme="light"\]\s*\{/);
  });

  it('defines the same colour tokens in both themes', () => {
    const [darkBlock, rest] = tokens.split('[data-theme="light"] {');
    const lightBlock = rest?.split('\n}\n')[0];
    const dark = colorTokenNames(darkBlock);
    expect(dark.length).toBeGreaterThan(20);
    expect(colorTokenNames(lightBlock)).toEqual(dark);
  });
});
