import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allElements } from '../../src/domain/validate';
import { loadModel, loadSources } from './helpers';

const model = loadModel();
const sources = loadSources();
const root = resolve(__dirname, '../..');

describe('provenance and honesty rules', () => {
  it('every element names at least one known source, a geometry confidence and validity fields', () => {
    const ids = new Set(sources.map((s) => s.id));
    const elements = allElements(model);
    expect(elements.length).toBeGreaterThan(140);
    for (const e of elements) {
      expect(e.provenance.sourceIds.length, e.id).toBeGreaterThan(0);
      for (const s of e.provenance.sourceIds) expect(ids.has(s), `${e.id} → ${s}`).toBe(true);
      expect(['verified', 'schematic', 'unknown'], e.id).toContain(e.geometryConfidence);
      expect(e, e.id).toHaveProperty('validFrom');
      expect(e, e.id).toHaveProperty('validTo');
      expect(e.provenance.lastVerifiedAt, e.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('nothing claims surveyed geometry', () => {
    expect(allElements(model).filter((e) => e.geometryConfidence === 'verified')).toEqual([]);
  });

  it('verified elements carry the date printed on their source; sources in use are never marked unused', () => {
    const used = new Set<string>();
    for (const e of allElements(model)) {
      if (e.existence === 'verified') expect(e.asOf, e.id).toMatch(/^\d{4}-\d{2}$/);
      e.provenance.sourceIds.forEach((s) => used.add(s));
    }
    for (const s of sources) {
      if (used.has(s.id)) expect(s.usedInData, s.id).toBe(true);
    }
    // the licence-restricted ODPT datasets must stay unused
    for (const id of ['src:odpt-nwd-jreast-shinjuku', 'src:odpt-jreast-train-information']) {
      expect(used.has(id), id).toBe(false);
      expect(sources.find((s) => s.id === id)!.usedInData).toBe(false);
    }
  });

  it('every area is either paid or unpaid, and every platform is paid', () => {
    for (const a of model.areas) {
      expect(a.fareZone === 'unpaid' || a.fareZone.startsWith('paid:'), a.id).toBe(true);
      if (a.kind === 'platform') expect(a.fareZone, a.id).not.toBe('unpaid');
    }
  });

  it('what could not be read stays a block marked unverified, with synthetic provenance', () => {
    expect(model.unverifiedBlocks.map((b) => b.id)).toEqual(['sk:block:toei-oedo-gate-b-inside']);
    for (const b of model.unverifiedBlocks) {
      expect(b.existence).toBe('unverified');
      expect(b.geometryConfidence).toBe('unknown');
      expect(b.provenance.dataNature).toBe('synthetic');
      expect(b.notes).toMatch(/NOT VERIFIED/);
    }
  });

  it('does not mix up Shinjuku with similarly named stations', () => {
    // Neighbouring stations may be named as a direction on a sign, but never as an element of this model.
    const text = JSON.stringify([model.areas, model.gates, model.entrances, model.verticals, model.levels, model.stations].flat().map((e) => [e.id, e.names]));
    expect(text).not.toMatch(/西武新宿|新宿三丁目|新宿西口駅/);
    expect(model.stations.map((s) => s.id)).not.toContain('sk:station:toei-oedo-shinjuku-nishiguchi');
    const excluded = model.complex.explicitlyExcluded.map((x) => x.name).join(' ');
    expect(excluded).toMatch(/西武新宿/);
    expect(excluded).toMatch(/新宿三丁目/);
    expect([...model.complex.stationIds].sort()).toEqual(model.stations.map((s) => s.id).sort());
    expect(model.stations).toHaveLength(6);
  });

  it('JR track legend: 16 tracks on 8 islands, Yamanote on 14 and 15', () => {
    const jr = model.areas.filter((a) => a.kind === 'platform' && a.stationId === 'sk:station:jr-east-shinjuku');
    const tracks = jr.flatMap((p) => (p.kind === 'platform' ? p.tracks : []));
    expect(tracks.map((t) => Number(t.number)).sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    const yamanote = tracks.filter((t) => t.services.some((s) => s.railLineId === 'sk:line:jr-east-yamanote'));
    expect(yamanote.map((t) => t.number)).toEqual(['14', '15']);
  });

  it('kana readings were not verified, so none is filled in', () => {
    for (const e of allElements(model)) expect(e.names.ja_kana, e.id).toBeNull();
  });

  it('the repository ships no image, PDF or font files — official maps are never redistributed', () => {
    const banned = /\.(png|jpe?g|gif|webp|avif|svg|pdf|woff2?|ttf|otf|glb|gltf)$/i;
    const skip = new Set(['node_modules', 'dist', 'test-results', 'playwright-report', '.vite', 'raw']);
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (skip.has(name)) continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (banned.test(name)) hits.push(full);
      }
    };
    walk(root);
    expect(hits).toEqual([]);
  });

  it('no secret is committed: the ODPT key appears only as a variable name', () => {
    const provider = readFileSync(join(root, 'src/providers/odptOverlayProvider.ts'), 'utf8');
    expect(provider).toMatch(/ODPT_CONSUMER_KEY/);
    expect(provider).not.toMatch(/acl:consumerKey=[A-Za-z0-9]{8,}/);
  });
});
