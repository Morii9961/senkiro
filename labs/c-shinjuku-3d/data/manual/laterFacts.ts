/**
 * Details read on 2026-11-16, after the stations themselves had been entered,
 * from sources other than the operators' floor maps: which platform faces have
 * platform doors, which end of a terminus the tracks stop at, and the three
 * escalators that a source says run one way only. They are kept in one place
 * and merged into the model by `applyLaterFacts` (data/manual/index.ts).
 *
 * Every entry names its sources (see data/manual/sources.ts). Wikipedia, a
 * station-information site and two news articles are used here, not only
 * operator material; how deeply each was read is written in its SourceRecord.
 * Nothing here moves a coordinate.
 */
import type { Area, Platform, PlatformTrack, VerticalFacility } from '../../src/domain/types';

const WP = 'src:wikipedia-ja-shinjuku-station';
const WP_SEIBU = 'src:wikipedia-ja-seibu-shinjuku';
const WP_SANCHOME = 'src:wikipedia-ja-shinjuku-sanchome';
const WP_NISHIGUCHI = 'src:wikipedia-ja-shinjuku-nishiguchi';
const ECOMO = 'src:ecomo-rakuraku-stations';
const TETSUDO = 'src:tetsudo-com-column-1526';
const TN_KEIO = 'src:trafficnews-keio-shinjuku-2024';
const TN_SEIBU = 'src:trafficnews-seibu-shinjuku-2018';
const WADATTSU_KEIO = 'src:wadattsu-keio-shinjuku';
const KEIO_MAP = 'src:keio-station-map';
const WADATTSU_OTHER = 'src:wadattsu-shinjuku-other';

type Doors = NonNullable<PlatformTrack['platformDoors']>;
type Terminus = NonNullable<Platform['terminus']>;
type EscalatorRun = NonNullable<VerticalFacility['escalatorDirection']>;

const installed = (since: string | null, sourceIds: string[], note: string): Doors => ({ status: 'installed', since, sourceIds, note });
const none = (sourceIds: string[], note: string): Doors => ({ status: 'none', since: null, sourceIds, note });
const planned = (since: string | null, sourceIds: string[], note: string): Doors => ({ status: 'planned', since, sourceIds, note });

const JR_NONE = '2026年3月時点で新宿駅（JR）にホームドアはない（改札内コンコース工事のため）。';
const JR_FY2028 = `${JR_NONE}2028年度末までに設置予定（山手線・中央・総武線各駅停車・埼京線・湘南新宿ライン）。`;
/**
 * JR 13・16番線: the Wikipedia timeline gives 2026-11-25 as the (scheduled) first day of use. On 2026-11-16 the
 * project owner decided to enter it as installed, because this prototype will not be published before that date.
 * The date is still the scheduled one; nobody has seen the doors in use.
 */
const JR_1316 = 'スリットフレームホームドア。2026年11月25日使用開始（Wikipediaの年表では予定）。公開がこの日以降になるため、2026-11-16 に「あり」として記載。';
const OD_NONE = '可動式ホーム柵は地上4・5番線と地下8・9番線のみ。このホームは未設置。';

/** Platform doors per platform and face (track number as printed). Faces not listed are unknown. */
export const PLATFORM_DOORS: Record<string, Record<string, Doors>> = {
  'sk:platform:jr-east-shinjuku-1-2': { '1': none([TETSUDO], JR_FY2028), '2': none([TETSUDO], JR_FY2028) },
  'sk:platform:jr-east-shinjuku-3-4': { '3': none([TETSUDO], JR_FY2028), '4': none([TETSUDO], JR_FY2028) },
  'sk:platform:jr-east-shinjuku-13-14': {
    '13': installed('2026-11-25', [WP, TETSUDO], JR_1316),
    '14': none([TETSUDO], JR_FY2028),
  },
  'sk:platform:jr-east-shinjuku-15-16': {
    '15': none([TETSUDO], JR_FY2028),
    '16': installed('2026-11-25', [WP, TETSUDO], JR_1316),
  },
  'sk:platform:odakyu-shinjuku-2-3': { '2': none([ECOMO], OD_NONE), '3': none([ECOMO], OD_NONE) },
  'sk:platform:odakyu-shinjuku-4-5': {
    '4': installed('2012-09-30', [ECOMO, WP], '可動式ホーム柵。'),
    '5': installed('2012-09-30', [ECOMO, WP], '可動式ホーム柵。'),
  },
  'sk:platform:odakyu-shinjuku-6': { '6': none([ECOMO], OD_NONE) },
  'sk:platform:odakyu-shinjuku-7': { '7': none([ECOMO], OD_NONE) },
  'sk:platform:odakyu-shinjuku-8-9': {
    '8': installed('2022-01-30', [ECOMO, WP], '可動式ホーム柵。'),
    '9': installed('2022-01-30', [ECOMO, WP], '可動式ホーム柵。'),
  },
  'sk:platform:odakyu-shinjuku-10': { '10': none([ECOMO], OD_NONE) },
  'sk:platform:keio-shinjuku-1-2': {
    '1': installed('2013-10', [ECOMO, WP], '可動式ホーム柵（らくらくおでかけネット: H25.10 供用開始）。'),
    '2': installed('2014-03', [ECOMO, WP], '可動式ホーム柵（らくらくおでかけネット: H26.3 供用開始）。'),
  },
  'sk:platform:keio-shinjuku-3': { '3': installed(null, [ECOMO, WP], '可動式ホーム柵。Wikipediaでは2012年度に使用開始。') },
  'sk:platform:keio-new-line-shinjuku-4-5': {
    '4': installed(null, [ECOMO], '可動式ホーム柵。使用開始日は読んだ資料に書かれていない。'),
    '5': installed(null, [ECOMO], '可動式ホーム柵。使用開始日は読んだ資料に書かれていない。'),
  },
  'sk:platform:tokyo-metro-shinjuku-1-2': {
    '1': installed('2006-10', [ECOMO, WP], '可動式ホーム柵。'),
    '2': installed('2006-10', [ECOMO, WP], '可動式ホーム柵。'),
  },
  'sk:platform:toei-oedo-shinjuku-6-7': {
    '6': installed(null, [ECOMO], '可動式ホーム柵。使用開始日は読んだ資料に書かれていない。'),
    '7': installed(null, [ECOMO], '可動式ホーム柵。使用開始日は読んだ資料に書かれていない。'),
  },
  'sk:platform:seibu-shinjuku-1': { '1': installed('2020-08-05', [ECOMO, WP_SEIBU], '可動式ホーム柵。') },
  'sk:platform:seibu-shinjuku-2-3': {
    '2': installed('2020-03-11', [ECOMO, WP_SEIBU], '可動式ホーム柵。'),
    '3': installed('2020-10-14', [ECOMO, WP_SEIBU], '可動式ホーム柵。'),
  },
  'sk:platform:tokyo-metro-shinjuku-sanchome-1-2': {
    '1': installed(null, [ECOMO], '可動式ホーム柵。使用開始日は読んだ資料に書かれていない。'),
    '2': installed(null, [ECOMO], '可動式ホーム柵。使用開始日は読んだ資料に書かれていない。'),
  },
  'sk:platform:tokyo-metro-shinjuku-sanchome-3-4': {
    '3': installed('2008-06', [ECOMO], '可動式ホーム柵（らくらくおでかけネット: H20.6 設置）。'),
    '4': installed('2008-06', [ECOMO], '可動式ホーム柵（らくらくおでかけネット: H20.6 設置）。'),
  },
  'sk:platform:toei-shinjuku-sanchome-1-2': {
    '1': installed('2019-08-10', [ECOMO, WP_SANCHOME], '可動式ホーム柵。'),
    '2': installed('2019-08-10', [ECOMO, WP_SANCHOME], '可動式ホーム柵。'),
  },
  'sk:platform:toei-shinjuku-nishiguchi-1-2': {
    '1': installed('2012-10', [ECOMO, WP_NISHIGUCHI], '可動式ホーム柵。'),
    '2': installed('2012-10', [ECOMO, WP_NISHIGUCHI], '可動式ホーム柵。'),
  },
};

const OD_HEAD: Terminus = { end: 'x-', sourceIds: [WP], note: '小田急新宿駅は地上・地下とも北端が頭端（列車は南側から発着）。' };
const KEIO_HEAD: Terminus = {
  end: 'x-',
  sourceIds: [TN_KEIO],
  note: 'ホームは京王八王子方（南）にしか延ばせず、車止め方向へ延ばす計画は改札側（北）。車止めは北端。',
};
const SEIBU_HEAD: Terminus = {
  end: 'x+',
  sourceIds: [TN_SEIBU, WP_SEIBU],
  note: '頭端式2面3線。西武新宿駅は新宿駅の北約400mにあり、行き止まりの線路を400m延ばせば新宿駅に届く——車止めは南端。',
};

/** Termini: the end of each platform where the tracks stop. */
export const TERMINI: Record<string, Terminus> = {
  'sk:platform:odakyu-shinjuku-2-3': OD_HEAD,
  'sk:platform:odakyu-shinjuku-4-5': OD_HEAD,
  'sk:platform:odakyu-shinjuku-6': OD_HEAD,
  'sk:platform:odakyu-shinjuku-7': OD_HEAD,
  'sk:platform:odakyu-shinjuku-8-9': OD_HEAD,
  'sk:platform:odakyu-shinjuku-10': OD_HEAD,
  'sk:platform:keio-shinjuku-1-2': KEIO_HEAD,
  'sk:platform:keio-shinjuku-3': KEIO_HEAD,
  'sk:platform:seibu-shinjuku-1': SEIBU_HEAD,
  'sk:platform:seibu-shinjuku-2-3': SEIBU_HEAD,
};

/** Escalators that a source says run one way only. */
export const ESCALATOR_DIRECTIONS: Record<string, EscalatorRun> = {
  'sk:vertical:jr-escalator-2f-south-to-platform-13-14': {
    direction: 'up',
    sourceIds: [WP],
    note: '南口跨線橋：13〜16番線へのエスカレーターはホームからの上り方向のみ（エレベーターあり）。',
  },
  'sk:vertical:jr-escalator-2f-south-to-platform-15-16': {
    direction: 'up',
    sourceIds: [WP],
    note: '南口跨線橋：13〜16番線へのエスカレーターはホームからの上り方向のみ（エレベーターあり）。',
  },
  'sk:vertical:odakyu-escalator-2f-to-platform-2-3': {
    direction: 'up',
    sourceIds: [WP],
    note: '2・3番ホームから南口改札への上りのみ（幅の狭いタイプ）。',
  },
  'sk:vertical:keio-escalator-concourse-to-platform-1-2': {
    direction: 'scheduled',
    schedule: '始発〜10:00 上り、10:00〜 下り。休日は終日下り',
    sourceIds: [KEIO_MAP, WADATTSU_KEIO],
    note: '京王の構内図に時間帯別の向きが印刷されている（例「平日10:00まで昇り／10:00から降り」）。わだっつ鉄道ちゃんねるも同じ（休日は終日下り）。',
  },
  'sk:vertical:keio-escalator-concourse-to-platform-3': {
    direction: 'scheduled',
    schedule: '始発〜10:00 上り、10:00〜 下り。休日は終日下り',
    sourceIds: [KEIO_MAP, WADATTSU_KEIO],
    note: '京王の構内図に時間帯別の向きが印刷されている（例「平日10:00まで昇り／10:00から降り」）。わだっつ鉄道ちゃんねるも同じ（休日は終日下り）。',
  },
  'sk:vertical:keio-escalator-lumine-landing-to-platform-1-2': {
    direction: 'scheduled',
    schedule: '17:00まで上り、17:00から下り',
    sourceIds: [KEIO_MAP, WADATTSU_KEIO, WP],
    note: '京王の構内図「※17:00まで昇り 17:00から降り」。Wikipedia、わだっつ鉄道ちゃんねるも同じ。',
  },
  'sk:vertical:keio-escalator-lumine-landing-to-platform-3': {
    direction: 'scheduled',
    schedule: '17:00まで上り、17:00から下り',
    sourceIds: [KEIO_MAP, WADATTSU_KEIO, WP],
    note: '京王の構内図「※17:00まで昇り 17:00から降り」。Wikipedia、わだっつ鉄道ちゃんねるも同じ。',
  },
  'sk:vertical:nishiguchi-escalator-car-5': {
    direction: 'down',
    sourceIds: [WADATTSU_OTHER],
    note: '5号車の階段に併設のエスカレーターは終日下り運転（改札階 B3F → ホーム B4F）。',
  },
  'sk:vertical:jr-escalator-2f-south-to-platform-3-4': {
    direction: 'scheduled',
    schedule: '始発〜9:00頃は下り（改札階→ホーム）、それ以外は上り',
    sourceIds: [WADATTSU_OTHER],
    note: '3・4番線の2号車付近、東南改札・南改札方面のエスカレーター。始電〜9:00頃は下り運転、ほかの時間は上りエスカレーターとして案内されている。この組の他のエスカレーターについては書かれていない。',
  },
  'sk:vertical:tokyo-metro-escalator-east-gates-to-platform': {
    direction: 'up',
    sourceIds: [WP],
    note: '東側のエスカレーターは改札階方向のみ。',
  },
};

export function applyLaterFacts(areas: Area[], verticals: VerticalFacility[]): { areas: Area[]; verticals: VerticalFacility[] } {
  const withSources = <T extends { provenance: { sourceIds: string[] } }>(el: T, ids: string[]): T => ({
    ...el,
    provenance: { ...el.provenance, sourceIds: [...new Set([...el.provenance.sourceIds, ...ids])] },
  });
  const outAreas = areas.map((a): Area => {
    if (a.kind !== 'platform') return a;
    const doors = PLATFORM_DOORS[a.id];
    const terminus = TERMINI[a.id];
    if (!doors && !terminus) return a;
    const tracks = a.tracks.map((t) => (doors?.[t.number] ? { ...t, platformDoors: doors[t.number] } : t));
    const ids = [...Object.values(doors ?? {}).flatMap((d) => d.sourceIds), ...(terminus?.sourceIds ?? [])];
    return withSources({ ...a, tracks, ...(terminus ? { terminus } : {}) }, ids);
  });
  const outVerticals = verticals.map((v) => {
    const run = ESCALATOR_DIRECTIONS[v.id];
    return run ? withSources({ ...v, escalatorDirection: run, directionNote: run.note }, run.sourceIds) : v;
  });
  return { areas: outAreas, verticals: outVerticals };
}
