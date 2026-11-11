import { describe, expect, it } from 'vitest';
import { bindOverlay, worstStatus, type OperationSnapshot } from '../../src/domain/overlay';
import { createExampleOverlayProvider, EXAMPLE_SNAPSHOT, EXAMPLE_TIMESTAMP } from '../../src/providers/exampleOverlayProvider';
import { createOdptOverlayProvider } from '../../src/providers/odptOverlayProvider';
import { loadModel, loadSources } from './helpers';

const model = loadModel();

describe('operations overlay', () => {
  it('the ODPT provider reports why it is unavailable instead of returning data', async () => {
    const r = await createOdptOverlayProvider().getSnapshot();
    expect(r).toMatchObject({ status: 'unavailable', reason: 'license-restricted' });
    const noKey = await createOdptOverlayProvider({ licenseAccepted: true }).getSnapshot();
    expect(noKey).toMatchObject({ status: 'unavailable', reason: 'missing-key' });
    if (noKey.status === 'unavailable') {
      expect(loadSources().some((s) => s.id === noKey.sourceId)).toBe(true);
    }
  });

  it('example data is labelled synthetic in the data itself and carries an artificial timestamp', async () => {
    const provider = createExampleOverlayProvider();
    expect(provider.live).toBe(false);
    const r = await provider.getSnapshot();
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.snapshot.isSynthetic).toBe(true);
    expect(r.snapshot.dataNature).toBe('synthetic');
    expect(r.snapshot.fetchedAt).toBe(EXAMPLE_TIMESTAMP);
    expect(new Date(r.snapshot.fetchedAt).getFullYear()).toBeLessThan(2001);
    expect(loadSources().find((s) => s.id === r.snapshot.sourceId)?.notes).toMatch(/SYNTHETIC/);
    for (const s of r.snapshot.lineStatuses) expect(s.messageJa).toMatch(/サンプル/);
    for (const d of r.snapshot.departures) expect(d.destinationJa).toMatch(/サンプル/);
    // no train positions anywhere in the interface
    expect(JSON.stringify(r.snapshot)).not.toMatch(/position|latitude|longitude|coordinates/i);
  });

  it('binds line statuses and departures to the right platform tracks', () => {
    const bound = bindOverlay(model, EXAMPLE_SNAPSHOT);
    expect(bound.unmatched).toEqual([]);
    const track = (n: string) => bound.tracks.find((t) => t.track.number === n && t.platformId.includes('jr-east'))!;
    expect(track('14').statuses.map((s) => s.railLineId)).toEqual(['sk:line:jr-east-yamanote']);
    expect(track('14').departures).toHaveLength(1);
    expect(track('13').statuses.map((s) => s.railLineId)).toEqual(['sk:line:jr-east-chuo-sobu-local']);
    // track 1 serves two lines, so it gets both statuses
    expect(track('1').statuses.map((s) => s.status).sort()).toEqual(['partial-suspension', 'unknown']);
    expect(worstStatus(track('1').statuses)).toBe('partial-suspension');
    expect(track('8').departures[0]).toMatchObject({ scheduledTime: '00:05', estimatedTime: '00:15' });
    // tracks with no data stay empty rather than inheriting a neighbour's status
    expect(track('9').statuses).toEqual([]);
    expect(worstStatus(track('9').statuses)).toBe('unknown');
  });

  it('reports entries that do not match the model instead of guessing a platform', () => {
    const odd: OperationSnapshot = {
      ...EXAMPLE_SNAPSHOT,
      lineStatuses: [{ railLineId: 'sk:line:does-not-exist', status: 'delayed', delayMinutes: 3, messageJa: null, messageEn: null, observedAt: null }],
      departures: [
        // Yamanote does not use track 13
        { platformId: 'sk:platform:jr-east-shinjuku-13-14', trackNumber: '13', railLineId: 'sk:line:jr-east-yamanote', scheduledTime: '00:01', estimatedTime: null, destinationJa: null, destinationEn: null, trainTypeJa: null },
      ],
    };
    const bound = bindOverlay(model, odd);
    expect(bound.unmatched.map((u) => u.kind)).toEqual(['line', 'departure']);
    expect(bound.tracks.every((t) => t.departures.length === 0)).toBe(true);
  });
});
