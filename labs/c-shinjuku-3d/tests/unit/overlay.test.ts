import { describe, expect, it } from 'vitest';
import { bindOverlay, worstStatus, type OperationSnapshot } from '../../src/domain/overlay';
import { createExampleOverlayProvider, EXAMPLE_SNAPSHOT, EXAMPLE_TIMESTAMP } from '../../src/providers/exampleOverlayProvider';
import { mapOdpt } from '../../src/providers/odptMapping';
import { createOdptOverlayProvider } from '../../src/providers/odptOverlayProvider';
import { loadModel, loadSources } from './helpers';

const model = loadModel();

describe('operations overlay', () => {
  const json = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('the ODPT provider reports why it is unavailable instead of returning data', async () => {
    // a static build: the proxy path answers with the HTML page
    const noProxy = await createOdptOverlayProvider(model, async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })).getSnapshot();
    expect(noProxy).toMatchObject({ status: 'unavailable', reason: 'missing-key' });
    if (noProxy.status === 'unavailable') expect(loadSources().some((s) => s.id === noProxy.sourceId)).toBe(true);
    // a production build does not even ask
    let asked = false;
    const prod = await createOdptOverlayProvider(model, async () => { asked = true; return new Response('{}'); }, false).getSnapshot();
    expect(prod).toMatchObject({ status: 'unavailable', reason: 'missing-key' });
    expect(asked).toBe(false);
    // the proxy runs but has no key
    expect(await createOdptOverlayProvider(model, json({ error: 'missing-key' }, 503)).getSnapshot()).toMatchObject({ status: 'unavailable', reason: 'missing-key' });
    // the upstream request failed
    expect(await createOdptOverlayProvider(model, json({ error: 'network-error' }, 502)).getSnapshot()).toMatchObject({ status: 'unavailable', reason: 'network-error' });
    // the network itself failed
    expect(await createOdptOverlayProvider(model, async () => { throw new Error('offline'); }).getSnapshot()).toMatchObject({ status: 'unavailable', reason: 'network-error' });
    // a response of the wrong shape is refused, not interpreted
    expect(await createOdptOverlayProvider(model, json({ fetchedAt: 'x', trains: { not: 'an array' }, stationTimetables: [] })).getSnapshot()).toMatchObject({ status: 'unavailable', reason: 'bad-response' });
  });

  describe('ODPT mapping (constructed fixture shaped like the ODPT v4 vocabulary — not a recorded response)', () => {
    const fixture = {
      fetchedAt: '2026-11-12T03:00:00.000Z', // 12:00 in Japan, a Thursday
      trains: [
        { 'odpt:railway': 'odpt.Railway:JR-East.Yamanote', 'odpt:delay': 0, 'dc:date': '2026-11-12T12:00:00+09:00' },
        { 'odpt:railway': 'odpt.Railway:JR-East.Yamanote', 'odpt:delay': 60 },
        { 'odpt:railway': 'odpt.Railway:JR-East.ChuoRapid', 'odpt:delay': 420 },
        { 'odpt:railway': 'odpt.Railway:JR-East.ChuoRapid', 'odpt:delay': 0 },
        { 'odpt:railway': 'odpt.Railway:JR-East.Tokaido', 'odpt:delay': 900 },
      ],
      stationTimetables: [
        {
          'odpt:railway': 'odpt.Railway:JR-East.Yamanote',
          'odpt:calendar': 'odpt.Calendar:Weekday',
          'odpt:stationTimetableObject': [
            { 'odpt:departureTime': '11:58', 'odpt:platformNumber': '14' },
            { 'odpt:departureTime': '12:03', 'odpt:platformNumber': '14', 'odpt:destinationStation': ['odpt.Station:JR-East.Yamanote.Shinagawa'] },
            { 'odpt:departureTime': '12:05' },
            { 'odpt:departureTime': '12:07', 'odpt:platformNumber': '99' },
          ],
        },
        { 'odpt:railway': 'odpt.Railway:JR-East.Yamanote', 'odpt:calendar': 'odpt.Calendar:SaturdayHoliday', 'odpt:stationTimetableObject': [{ 'odpt:departureTime': '12:04', 'odpt:platformNumber': '15' }] },
      ],
    };
    const now = new Date('2026-11-12T03:00:00.000Z');

    it('aggregates per-train delays into a line status and says that it did', () => {
      const snap = mapOdpt(model, fixture, now)!;
      expect(snap.isSynthetic).toBe(false);
      expect(snap.fetchedAt).toBe(fixture.fetchedAt);
      const yamanote = snap.lineStatuses.find((s) => s.railLineId === 'sk:line:jr-east-yamanote')!;
      expect(yamanote.status).toBe('normal');
      expect(yamanote.delayMinutes).toBeNull();
      const chuo = snap.lineStatuses.find((s) => s.railLineId === 'sk:line:jr-east-chuo-rapid')!;
      expect(chuo.status).toBe('delayed');
      expect(chuo.delayMinutes).toBe(7);
      expect(chuo.messageJa).toMatch(/集計/);
      // a railway the model does not have is not attached to anything
      expect(snap.lineStatuses).toHaveLength(2);
      expect(JSON.stringify(snap)).not.toMatch(/latitude|longitude|coordinates/i);
    });

    it('puts a departure on a track only when the feed names a platform the model has', () => {
      const snap = mapOdpt(model, fixture, now)!;
      // 11:58 is past, the row without a platform and platform 99 cannot be placed, Saturday rows do not apply
      expect(snap.departures).toEqual([expect.objectContaining({ trackNumber: '14', scheduledTime: '12:03', destinationJa: 'Shinagawa', railLineId: 'sk:line:jr-east-yamanote' })]);
      const bound = bindOverlay(model, snap);
      expect(bound.unmatched).toEqual([]);
      expect(bound.tracks.find((t) => t.track.number === '14')!.departures).toHaveLength(1);
    });

    it('the data it shows is registered as a source that is not redistributed', () => {
      const snap = mapOdpt(model, fixture, now)!;
      const src = loadSources().find((s) => s.id === snap.sourceId)!;
      expect(src.redistribution).toBe('no');
      expect(src.usedInData).toBe(false);
    });
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
