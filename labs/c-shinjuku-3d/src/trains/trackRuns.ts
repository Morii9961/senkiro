/**
 * Which way trains run on each track of the model.
 *
 * The station model records which edge of a platform a track lies along and
 * where its trains are bound. To animate a train one more thing is needed:
 * towards which end of the platform it leaves, and whether the track ends
 * here. That is written down below, track by track, from the direction text
 * the operators print (already in the model) and the model's own orientation
 * (x grows southwards, z grows westwards).
 *
 * A track that is missing here, or whose `departs` is null, gets no moving
 * train: a train is only shown standing at the platform.
 */
import type { Platform, StationModel } from '../domain/types';
import { trackKey } from '../timetable/registry';

export interface TrackRun {
  /** 'terminal': the track ends at this station; trains leave the way they came. */
  kind: 'through' | 'terminal';
  /**
   * The end of the platform a departing train leaves towards, along the
   * platform's long axis: +1 = towards larger x (south) or larger z (west),
   * -1 = the other way. null = not established.
   */
  departs: 1 | -1 | null;
  note: string;
}

const SOUTH = 1;
const NORTH = -1;
const WEST = 1;
const EAST = -1;

const run = (kind: TrackRun['kind'], departs: TrackRun['departs'], note: string): TrackRun => ({ kind, departs, note });

const JR_S = 'Bound for the next station to the south (代々木 / 渋谷 side); x grows southwards in the model.';
const JR_N = 'Bound for the next station to the north (大久保 / 新大久保 / 池袋 side).';
const JR_MIXED = 'The operator prints both directions for this track; the more frequent one, listed first, is used.';
const ODAKYU_END = 'Terminal track: the Odakyu drawing puts the gates at the north end of the platforms; trains leave southwards.';
const KEIO_END = 'Terminal track: the Keio drawing puts the gates at the north end of the platforms; trains leave southwards.';
const SEIBU_END = 'Terminal track: the Seibu drawing shows the concourse of 正面口 at the head of the three tracks, which is the south end in the model; trains leave northwards.';

const P = 'sk:platform:';
const table: Record<string, TrackRun> = {
  [`${P}jr-east-shinjuku-1-2#1`]: run('through', SOUTH, `${JR_S} ${JR_MIXED}`),
  [`${P}jr-east-shinjuku-1-2#2`]: run('through', SOUTH, `${JR_S} ${JR_MIXED}`),
  [`${P}jr-east-shinjuku-3-4#3`]: run('through', NORTH, `${JR_N} ${JR_MIXED}`),
  [`${P}jr-east-shinjuku-3-4#4`]: run('through', NORTH, JR_N),
  // 5 / 6: 成田エクスプレス leaves southwards and the 東武線直通特急 northwards; nothing printed settles a default.
  [`${P}jr-east-shinjuku-5-6#5`]: run('through', null, 'Limited expresses of both directions use this track; the direction of a trip is not established.'),
  [`${P}jr-east-shinjuku-5-6#6`]: run('through', null, 'Limited expresses of both directions use this track; the direction of a trip is not established.'),
  [`${P}jr-east-shinjuku-7-8#7`]: run('through', SOUTH, `御茶ノ水・東京方面. ${JR_S}`),
  [`${P}jr-east-shinjuku-7-8#8`]: run('through', SOUTH, `御茶ノ水・東京方面. ${JR_S}`),
  [`${P}jr-east-shinjuku-9-10#9`]: run('through', NORTH, `甲府・松本方面. ${JR_N}`),
  [`${P}jr-east-shinjuku-9-10#10`]: run('through', NORTH, `甲府・松本方面. ${JR_N}`),
  [`${P}jr-east-shinjuku-11-12#11`]: run('through', NORTH, `中野・立川・高尾方面. ${JR_N}`),
  [`${P}jr-east-shinjuku-11-12#12`]: run('through', NORTH, `中野・立川・高尾方面. ${JR_N}`),
  [`${P}jr-east-shinjuku-13-14#13`]: run('through', SOUTH, `水道橋・秋葉原・千葉方面. ${JR_S}`),
  [`${P}jr-east-shinjuku-13-14#14`]: run('through', SOUTH, `原宿・渋谷・品川方面. ${JR_S}`),
  [`${P}jr-east-shinjuku-15-16#15`]: run('through', NORTH, `池袋・田端・上野方面. ${JR_N}`),
  [`${P}jr-east-shinjuku-15-16#16`]: run('through', NORTH, `東中野・中野・三鷹方面. ${JR_N}`),
  [`${P}keio-shinjuku-1-2#1`]: run('terminal', SOUTH, KEIO_END),
  [`${P}keio-shinjuku-1-2#2`]: run('terminal', SOUTH, KEIO_END),
  [`${P}keio-shinjuku-3#3`]: run('terminal', SOUTH, KEIO_END),
  ...Object.fromEntries(
    [['2-3', '2'], ['2-3', '3'], ['4-5', '4'], ['4-5', '5'], ['6', '6'], ['7', '7'], ['8-9', '8'], ['8-9', '9'], ['10', '10']].map(([pf, n]) => [
      `${P}odakyu-shinjuku-${pf}#${n}`,
      run('terminal', SOUTH, ODAKYU_END),
    ]),
  ),
  [`${P}keio-new-line-shinjuku-4-5#4`]: run('through', WEST, '京王線方面 (next: 初台), to the west; z grows westwards in the model.'),
  [`${P}keio-new-line-shinjuku-4-5#5`]: run('through', EAST, '本八幡方面 (next: 新宿三丁目), to the east.'),
  [`${P}toei-oedo-shinjuku-6-7#6`]: run('through', SOUTH, '六本木方面 (next: 代々木): the Toei drawing has this arrow leave at the south-east end of the platform.'),
  [`${P}toei-oedo-shinjuku-6-7#7`]: run('through', NORTH, '光が丘方面 (next: 都庁前): the Toei drawing has this arrow leave at the north-west end of the platform.'),
  [`${P}tokyo-metro-shinjuku-1-2#1`]: run('through', WEST, '荻窪方面 (next: 西新宿), to the west.'),
  [`${P}tokyo-metro-shinjuku-1-2#2`]: run('through', EAST, '池袋方面 (next: 新宿三丁目), to the east.'),
  [`${P}seibu-shinjuku-1#1`]: run('terminal', NORTH, SEIBU_END),
  [`${P}seibu-shinjuku-2-3#2`]: run('terminal', NORTH, SEIBU_END),
  [`${P}seibu-shinjuku-2-3#3`]: run('terminal', NORTH, SEIBU_END),
};

/** Later data files (new stations) add their tracks here. */
export function registerTrackRuns(entries: Record<string, TrackRun>): void {
  Object.assign(table, entries);
}

export function trackRun(platformAreaId: string, trackNumber: string): TrackRun | null {
  return table[trackKey(platformAreaId, trackNumber)] ?? null;
}

export function allTrackRunKeys(): string[] {
  return Object.keys(table);
}

/** Every track of the model with its key — used by the tests to keep the table and the model in step. */
export function modelTrackKeys(model: StationModel): string[] {
  return model.areas.filter((a): a is Platform => a.kind === 'platform').flatMap((a) => a.tracks.map((t) => trackKey(a.id, t.number)));
}
