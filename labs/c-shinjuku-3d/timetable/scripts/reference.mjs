// Hand-maintained reference tables of the Greater Shinjuku timetable database.
// Every row cites a source_id from SOURCES below. Station IDs are the SENKIRO V3
// data contract and MUST NOT be renamed (see docs/FABLE_INTEGRATION.md).

export const RETRIEVED_AT = '2026-11-14';
export const AS_OF_DATE = '2026-11-14';

// ---------------------------------------------------------------- sources
// redistribution: yes | no | conditional | unknown  (docs/00-shared-contract.md §3)
export const SOURCES = [
  {
    source_id: 'src:odpt-toei-train-timetable', title: '東京都交通局 列車時刻表 / Train timetable of Toei (odpt:TrainTimetable)',
    publisher: '東京都交通局 via 公共交通オープンデータセンター', url: 'https://api-public.odpt.org/api/v4/odpt:TrainTimetable?odpt:railway=odpt.Railway:Toei.Shinjuku (and Toei.Oedo)',
    catalog_url: 'https://ckan.odpt.org/dataset/r_train_timetable-toei', retrieved_at: RETRIEVED_AT,
    license: 'CC BY 4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/', commercial_use: 'yes', redistribution: 'yes', share_alike: 'false',
    attribution_text: '出典：東京都交通局・公共交通オープンデータ協議会 (CC BY 4.0) を加工して作成', data_nature: 'official',
    timetable_name: '都営地下鉄 新宿線・大江戸線 列車時刻表 (令和7年3月15日ダイヤ改正)', published_date: '2025-03-17', revision_date: '2025-03-15',
    effective_from: '2025-03-15', effective_until: null,
    notes: 'dct:issued 2025-03-15 (SaturdayHoliday) / 2025-03-17 (Weekday); dc:date 2025-03-17T12:00+09:00 except 584K weekday (dc:date 2026-06-15). No Toei subway timetable revision after 2025-03-15 was found as of 2026-11-14 (see src:toei-press-20250214). valid_until unknown.',
  },
  {
    source_id: 'src:odpt-toei-station-timetable', title: '東京都交通局 駅時刻表 / Station timetable of Toei (odpt:StationTimetable)',
    publisher: '東京都交通局 via 公共交通オープンデータセンター', url: 'https://api-public.odpt.org/api/v4/odpt:StationTimetable?odpt:station=odpt.Station:Toei.*',
    catalog_url: 'https://ckan.odpt.org/dataset/r_station_timetable-toei', retrieved_at: RETRIEVED_AT,
    license: 'CC BY 4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/', commercial_use: 'yes', redistribution: 'yes', share_alike: 'false',
    attribution_text: '出典：東京都交通局・公共交通オープンデータ協議会 (CC BY 4.0) を加工して作成', data_nature: 'official',
    timetable_name: '都営地下鉄 駅時刻表 S01/S02/E27/E01 (令和7年3月15日ダイヤ改正)', published_date: '2025-03-17', revision_date: '2025-03-15',
    effective_from: '2025-03-15', effective_until: null,
    notes: 'Used to cross-check departures and to read isOrigin / isLast flags. Carries no platform numbers.',
  },
  {
    source_id: 'src:odpt-toei-station', title: '東京都交通局 駅情報 (odpt:Station)', publisher: '東京都交通局 via 公共交通オープンデータセンター',
    url: 'https://api-public.odpt.org/api/v4/odpt:Station?odpt:operator=odpt.Operator:Toei', catalog_url: 'https://ckan.odpt.org/dataset/r_station-toei',
    retrieved_at: RETRIEVED_AT, license: 'CC BY 4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/', commercial_use: 'yes', redistribution: 'yes', share_alike: 'false',
    attribution_text: '出典：東京都交通局・公共交通オープンデータ協議会 (CC BY 4.0)', data_nature: 'official',
    timetable_name: null, published_date: null, revision_date: null, effective_from: null, effective_until: null,
    notes: 'Station codes S-01, S-02, E-27, E-01 and station names (ja/en) for Toei stations and destinations.',
  },
  {
    source_id: 'src:cao-holidays', title: '国民の祝日・休日 (syukujitsu.csv)', publisher: '内閣府',
    url: 'https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv', catalog_url: 'https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html', retrieved_at: RETRIEVED_AT,
    license: '政府標準利用規約（第2.0版）/ CC BY 4.0 互換', license_url: 'https://www.cao.go.jp/notice/rules.html', commercial_use: 'yes', redistribution: 'yes', share_alike: 'false',
    attribution_text: '出典：内閣府「国民の祝日について」', data_nature: 'official', timetable_name: null, published_date: null, revision_date: null,
    effective_from: null, effective_until: null, notes: 'Only used to resolve dates to day types. Licence statement taken from the Cabinet Office site notice; re-check before release.',
  },
  {
    source_id: 'src:legacy-shinjuku-csv', title: '新宿駅_全列車時刻表.csv (friend-shared legacy file)', publisher: 'unknown',
    url: null, catalog_url: null, retrieved_at: '2026-11-12', license: 'unknown', license_url: null, commercial_use: 'unknown', redistribution: 'unknown', share_alike: 'unknown',
    attribution_text: null, data_nature: 'unknown', timetable_name: 'unknown', published_date: null, revision_date: null, effective_from: null, effective_until: null,
    notes: 'SHA-256 075a0a51e52f7fa6d020be1487d0bab76b170e3be3d780720d238c3a1af94e57. 8,567 records, 11 fields. Origin, edition date and licence unknown; destination spellings such as "中野(東京都)" / "本八幡(都営線)" suggest it was copied from a third-party timetable service. Kept only in gitignored data/raw and data/shinjuku/local.',
  },
  {
    source_id: 'src:odpt-tokyometro', title: '東京メトロ 駅時刻表・列車時刻表 (ODPT)', publisher: '東京地下鉄 via 公共交通オープンデータセンター',
    url: 'https://api.odpt.org/api/v4/odpt:StationTimetable (consumer key required)', catalog_url: 'https://ckan.odpt.org/dataset/r_station_timetable-tokyometro', retrieved_at: null,
    license: '公共交通オープンデータ基本ライセンス', license_url: 'https://developer.odpt.org/terms/data_basic_license.html', commercial_use: 'yes', redistribution: 'no', share_alike: 'false',
    attribution_text: null, data_nature: 'official', timetable_name: null, published_date: null, revision_date: null, effective_from: null, effective_until: null,
    notes: 'NOT RETRIEVED: needs a developer account key (none in .env.local). Art. 8-4-1 forbids republishing raw or restorable derived data, so even when fetched it may only live in gitignored local output. Fetcher: timetable/scripts/fetch-odpt-tokyometro.mjs.',
  },
  ...['jreast', 'odakyu', 'keio', 'seibu'].map((op) => ({
    source_id: `src:odpt-challenge-${op}`, title: `${op} 駅時刻表 (ODPT, 公共交通オープンデータチャレンジ2026限定)`, publisher: `${op} via 公共交通オープンデータセンター`,
    url: null, catalog_url: `https://ckan.odpt.org/dataset/${op}__r_station_timetable`, retrieved_at: null,
    license: '公共交通オープンデータチャレンジ限定ライセンス', license_url: 'https://developer.odpt.org/terms', commercial_use: 'no', redistribution: 'no', share_alike: 'false',
    attribution_text: null, data_nature: 'official', timetable_name: null, published_date: null, revision_date: null, effective_from: null, effective_until: null,
    notes: 'NOT USED: usable only during the challenge and only for an entry to it ("チャレンジへの作品応募を前提"). SENKIRO is not registered as an entry.',
  })),
  {
    source_id: 'src:jreast-timetable-web', title: 'JR東日本 駅の時刻表 新宿駅 (2026年11月版)', publisher: '東日本旅客鉄道',
    url: 'https://timetables.jreast.co.jp/timetable/list0866.html', catalog_url: null, retrieved_at: RETRIEVED_AT,
    license: 'All rights reserved (JR東日本ウェブサイトのご利用にあたって §2)', license_url: 'https://www.jreast.co.jp/site/rules.html', commercial_use: 'no', redistribution: 'no', share_alike: 'false',
    attribution_text: null, data_nature: 'official', timetable_name: 'JR東日本 駅の時刻表 (monthly edition 2611)', published_date: null, revision_date: '2026-03-14', effective_from: null, effective_until: null,
    notes: 'Site terms refuse 複製・転用・転載・電磁的加工・二次的使用. Not harvested. Consulted by reading only, for the dating spot check in docs/LEGACY_CSV_AUDIT.md; nothing copied into the dataset.',
  },
  {
    source_id: 'src:toei-press-20250214', title: '都営地下鉄三田線・新宿線・大江戸線のダイヤ改正について (令和7年2月14日)', publisher: '東京都交通局',
    url: 'https://www.kotsu.metro.tokyo.jp/pickup_information/news/pdf/2025/sub_p_2025021411894_h_01.pdf', catalog_url: null, retrieved_at: RETRIEVED_AT,
    license: 'All rights reserved', license_url: null, commercial_use: 'unknown', redistribution: 'no', share_alike: 'false', attribution_text: null, data_nature: 'official',
    timetable_name: null, published_date: '2025-02-14', revision_date: '2025-03-15', effective_from: '2025-03-15', effective_until: null,
    notes: 'Cited for the revision date only. Found via web search; the Toei site blocks automated clients, so the PDF text was not read directly.',
  },
  {
    source_id: 'src:toei-overview-fleet', title: '交通局の概要 都営地下鉄 (営業線の概要・車両 令和7年4月1日現在)', publisher: '東京都交通局',
    url: 'https://www.kotsu.metro.tokyo.jp/about/service/subway.html', catalog_url: null, retrieved_at: RETRIEVED_AT,
    license: 'All rights reserved', license_url: null, commercial_use: 'unknown', redistribution: 'no', share_alike: 'false', attribution_text: null, data_nature: 'official',
    timetable_name: null, published_date: '2025-04-01', revision_date: null, effective_from: '2025-04-01', effective_until: null,
    notes: 'Fleet facts (12-000形 8両×29編成, 12-600形 8両×30編成) as quoted in a web-search excerpt; the page itself could not be opened (bot protection). Re-check by hand.',
  },
  {
    source_id: 'src:tetsudo-ch-10-300-10car', title: '東京都交通局 10-300形 が2022年度末までに10両化達成! 都営新宿線がすべて10両に', publisher: '鉄道チャンネル',
    url: 'https://tetsudo-ch.com/11988118.html', catalog_url: null, retrieved_at: RETRIEVED_AT, license: 'All rights reserved', license_url: null,
    commercial_use: 'unknown', redistribution: 'no', share_alike: 'false', attribution_text: null, data_nature: 'unknown', timetable_name: null,
    published_date: null, revision_date: null, effective_from: '2023-03-31', effective_until: null,
    notes: 'Secondary source: all Toei Shinjuku Line sets 10 cars from end of FY2022; Keio 9000系 and 5000系 run through. Not an operator statement.',
  },
  {
    source_id: 'src:jreast-chuo-green-2025', title: '中央線グリーン車いよいよサービス開始 2025年春ダイヤ改正', publisher: '鉄道チャンネル (reporting JR East)',
    url: 'https://tetsudo-ch.com/12991630.html', catalog_url: null, retrieved_at: RETRIEVED_AT, license: 'All rights reserved', license_url: null,
    commercial_use: 'unknown', redistribution: 'no', share_alike: 'false', attribution_text: null, data_nature: 'unknown', timetable_name: null,
    published_date: null, revision_date: '2025-03-15', effective_from: '2025-03-15', effective_until: null,
    notes: 'E233系 with two bilevel Green cars (cars 4 and 5) → 12 cars; a few 10-car sets without Green cars reported to remain (trafficnews.jp/post/525875). Secondary source.',
  },
  {
    source_id: 'src:tokyometro-news-2026-224976', title: '銀座線・丸ノ内線 ダイヤ改正 (2026年9月19日)', publisher: '東京地下鉄',
    url: 'https://www.tokyometro.jp/news/2026/224976.html', catalog_url: null, retrieved_at: RETRIEVED_AT, license: 'All rights reserved', license_url: null,
    commercial_use: 'unknown', redistribution: 'no', share_alike: 'false', attribution_text: null, data_nature: 'official', timetable_name: null,
    published_date: '2026-08-06', revision_date: '2026-09-19', effective_from: '2026-09-19', effective_until: null,
    notes: 'Marunouchi Line revised 2026-09-19 (daytime Ikebukuro–Nakano-sakaue every 4 min; +28 weekday / +56 Sat-Hol trains). Seen via web search; tokyometro.jp refuses automated clients (HTTP 403).',
  },
  {
    source_id: 'src:jreast-press-20251212', title: '2026年3月ダイヤ改正について (2025年12月12日)', publisher: '東日本旅客鉄道',
    url: 'https://www.jreast.co.jp/press/2025/20251212_ho02.pdf', catalog_url: null, retrieved_at: RETRIEVED_AT, license: 'All rights reserved', license_url: null,
    commercial_use: 'no', redistribution: 'no', share_alike: 'false', attribution_text: null, data_nature: 'official', timetable_name: null,
    published_date: '2025-12-12', revision_date: '2026-03-14', effective_from: '2026-03-14', effective_until: null, notes: 'Revision date only (seen via web search).',
  },
  {
    source_id: 'src:odakyu-2026-revision', title: '小田急 2026年3月14日ダイヤ改正 (報道)', publisher: 'トラベル Watch (reporting Odakyu, 2025-12-12 release)',
    url: 'https://travel.watch.impress.co.jp/docs/news/2092798.html', catalog_url: null, retrieved_at: RETRIEVED_AT, license: 'All rights reserved', license_url: null,
    commercial_use: 'unknown', redistribution: 'no', share_alike: 'false', attribution_text: null, data_nature: 'unknown', timetable_name: null,
    published_date: '2025-12-12', revision_date: '2026-03-14', effective_from: '2026-03-14', effective_until: null, notes: 'Romancecar additions (えのしま1号, さがみ93号, はこね61号). Secondary source.',
  },
  {
    source_id: 'src:seibu-20250123', title: '2025年3月15日 ダイヤ改正 (西武鉄道ニュースリリース)', publisher: '西武鉄道',
    url: 'https://www.seiburailway.jp/newsroom/news/20250123_daiyakaisei/', catalog_url: null, retrieved_at: RETRIEVED_AT, license: 'All rights reserved', license_url: null,
    commercial_use: 'unknown', redistribution: 'no', share_alike: 'false', attribution_text: null, data_nature: 'official', timetable_name: null,
    published_date: '2025-01-23', revision_date: '2025-03-15', effective_from: '2025-03-15', effective_until: null,
    notes: 'Latest Seibu Shinjuku Line revision found. Temporary Red Arrow stop at 田無 on Sat/Hol 2026-09-19 – 2027-01-03 reported (stop pattern, not Seibu-Shinjuku times).',
  },
  {
    source_id: 'src:senkiro-3d-model', title: 'SENKIRO Lab C station model platform IDs (lab-c V2)', publisher: 'SENKIRO Lab',
    url: 'labs/c-shinjuku-3d/data/processed/station.json (branch claude/shinjuku-3d-indoor-nav-3f3cce)', catalog_url: null, retrieved_at: RETRIEVED_AT,
    license: 'project internal', license_url: null, commercial_use: 'unknown', redistribution: 'yes', share_alike: 'false', attribution_text: null, data_nature: 'derived',
    timetable_name: null, published_date: null, revision_date: null, effective_from: null, effective_until: null,
    notes: 'Only the sk:platform:* island IDs are referenced (model_platform_ref), so the 3D scene can place an event on the right island.',
  },
];

// ---------------------------------------------------------------- operators
export const OPERATORS = [
  { operator_id: 'jr-east', name_ja: '東日本旅客鉄道', name_en: 'East Japan Railway Company', name_zh: 'JR东日本', odpt_operator: 'odpt.Operator:JR-East', legacy_name: 'JR東日本' },
  { operator_id: 'odakyu', name_ja: '小田急電鉄', name_en: 'Odakyu Electric Railway', name_zh: '小田急电铁', odpt_operator: 'odpt.Operator:Odakyu', legacy_name: '小田急電鉄' },
  { operator_id: 'keio', name_ja: '京王電鉄', name_en: 'Keio Corporation', name_zh: '京王电铁', odpt_operator: 'odpt.Operator:Keio', legacy_name: '京王電鉄' },
  { operator_id: 'tokyo-metro', name_ja: '東京地下鉄', name_en: 'Tokyo Metro', name_zh: '东京地铁', odpt_operator: 'odpt.Operator:TokyoMetro', legacy_name: '東京メトロ' },
  { operator_id: 'toei', name_ja: '東京都交通局', name_en: 'Bureau of Transportation, Tokyo Metropolitan Government (Toei)', name_zh: '东京都交通局（都营）', odpt_operator: 'odpt.Operator:Toei', legacy_name: '東京都交通局' },
  { operator_id: 'seibu', name_ja: '西武鉄道', name_en: 'Seibu Railway', name_zh: '西武铁道', odpt_operator: 'odpt.Operator:Seibu', legacy_name: '西武鉄道' },
];

// ---------------------------------------------------------------- lines
export const LINES = [
  { line_id: 'jr-east:yamanote', operator_id: 'jr-east', name_ja: '山手線', name_en: 'Yamanote Line', name_zh: '山手线', line_code: 'JY', odpt_railway: 'odpt.Railway:JR-East.Yamanote', legacy_names: ['山手線'] },
  { line_id: 'jr-east:chuo-rapid', operator_id: 'jr-east', name_ja: '中央線(快速)', name_en: 'Chuo Line (Rapid)', name_zh: '中央线（快速）', line_code: 'JC', odpt_railway: 'odpt.Railway:JR-East.ChuoRapid', legacy_names: ['中央線(快速)[東京～高尾]'], remarks: 'Legacy grouping also carries Chuo Main Line limited expresses (あずさ/かいじ/富士回遊 etc.) departing from the same tracks.' },
  { line_id: 'jr-east:chuo-sobu-local', operator_id: 'jr-east', name_ja: '中央・総武線(各駅停車)', name_en: 'Chuo-Sobu Line (Local)', name_zh: '中央·总武线（各站停车）', line_code: 'JB', odpt_railway: 'odpt.Railway:JR-East.ChuoSobuLocal', legacy_names: ['中央総武線(各停)'] },
  { line_id: 'jr-east:saikyo-kawagoe', operator_id: 'jr-east', name_ja: '埼京線・川越線', name_en: 'Saikyo / Kawagoe Line', name_zh: '埼京线·川越线', line_code: 'JA', odpt_railway: 'odpt.Railway:JR-East.SaikyoKawagoe', legacy_names: ['埼京川越線[羽沢横浜国大～川越]'] },
  { line_id: 'jr-east:shonan-shinjuku', operator_id: 'jr-east', name_ja: '湘南新宿ライン', name_en: 'Shonan-Shinjuku Line', name_zh: '湘南新宿线', line_code: 'JS', odpt_railway: 'odpt.Railway:JR-East.ShonanShinjuku', legacy_names: ['湘南新宿ライン'], remarks: 'Legacy grouping also carries 成田エクスプレス and other limited expresses using these tracks.' },
  { line_id: 'odakyu:odawara', operator_id: 'odakyu', name_ja: '小田急小田原線', name_en: 'Odakyu Odawara Line', name_zh: '小田急小田原线', line_code: 'OH', odpt_railway: 'odpt.Railway:Odakyu.Odawara', legacy_names: ['小田急小田原線'] },
  { line_id: 'keio:keio', operator_id: 'keio', name_ja: '京王線', name_en: 'Keio Line', name_zh: '京王线', line_code: 'KO', odpt_railway: 'odpt.Railway:Keio.Keio', legacy_names: ['京王線'] },
  { line_id: 'keio:keio-new', operator_id: 'keio', name_ja: '京王新線', name_en: 'Keio New Line', name_zh: '京王新线', line_code: 'KO', odpt_railway: 'odpt.Railway:Keio.KeioNew', legacy_names: ['京王新線'] },
  { line_id: 'tokyo-metro:marunouchi', operator_id: 'tokyo-metro', name_ja: '丸ノ内線', name_en: 'Marunouchi Line', name_zh: '丸之内线', line_code: 'M', odpt_railway: 'odpt.Railway:TokyoMetro.Marunouchi', legacy_names: ['東京メトロ丸ノ内線'] },
  { line_id: 'tokyo-metro:fukutoshin', operator_id: 'tokyo-metro', name_ja: '副都心線', name_en: 'Fukutoshin Line', name_zh: '副都心线', line_code: 'F', odpt_railway: 'odpt.Railway:TokyoMetro.Fukutoshin', legacy_names: [] },
  { line_id: 'toei:shinjuku', operator_id: 'toei', name_ja: '都営新宿線', name_en: 'Toei Shinjuku Line', name_zh: '都营新宿线', line_code: 'S', odpt_railway: 'odpt.Railway:Toei.Shinjuku', legacy_names: ['都営新宿線'] },
  { line_id: 'toei:oedo', operator_id: 'toei', name_ja: '都営大江戸線', name_en: 'Toei Oedo Line', name_zh: '都营大江户线', line_code: 'E', odpt_railway: 'odpt.Railway:Toei.Oedo', legacy_names: ['都営大江戸線'] },
  { line_id: 'seibu:shinjuku', operator_id: 'seibu', name_ja: '西武新宿線', name_en: 'Seibu Shinjuku Line', name_zh: '西武新宿线', line_code: 'SS', odpt_railway: 'odpt.Railway:Seibu.Shinjuku', legacy_names: ['西武新宿線'] },
];

// ---------------------------------------------------------------- stations
// station_code: the operator's published station number where one exists.
export const STATIONS = [
  { station_id: 'jr-east:shinjuku', operator_id: 'jr-east', station_complex_id: 'complex:shinjuku', name_ja: '新宿', name_en: 'Shinjuku', name_zh: '新宿', line_ids: ['jr-east:yamanote', 'jr-east:chuo-rapid', 'jr-east:chuo-sobu-local', 'jr-east:saikyo-kawagoe', 'jr-east:shonan-shinjuku'], station_code: 'JY17 / JC05 / JB10 / JA11 / JS20', original_station_code: 'odpt.Station:JR-East.*.Shinjuku', jr_timetable_station_no: '0866', model_station_ref: 'sk:station:jr-east-shinjuku', source_id: 'src:jreast-timetable-web', remarks: 'Station numbers as displayed by JR East; not taken from an open dataset — verify before display.' },
  { station_id: 'odakyu:shinjuku', operator_id: 'odakyu', station_complex_id: 'complex:shinjuku', name_ja: '新宿', name_en: 'Shinjuku', name_zh: '新宿', line_ids: ['odakyu:odawara'], station_code: 'OH01', original_station_code: 'odpt.Station:Odakyu.Odawara.Shinjuku', model_station_ref: 'sk:station:odakyu-shinjuku', source_id: 'src:legacy-shinjuku-csv', remarks: 'Ground and underground platform levels are distinguished in the 3D model, not in the timetable source.' },
  { station_id: 'keio:shinjuku', operator_id: 'keio', station_complex_id: 'complex:shinjuku', name_ja: '新宿', name_en: 'Shinjuku', name_zh: '新宿', line_ids: ['keio:keio'], station_code: 'KO01', original_station_code: 'odpt.Station:Keio.Keio.Shinjuku', model_station_ref: 'sk:station:keio-shinjuku', source_id: 'src:legacy-shinjuku-csv', remarks: null },
  { station_id: 'keio:shinjuku-newline', operator_id: 'keio', station_complex_id: 'complex:shinjuku', name_ja: '新線新宿', name_en: 'Shinjuku (Keio New Line)', name_zh: '新线新宿', line_ids: ['keio:keio-new'], station_code: 'KO01', original_station_code: 'odpt.Station:Keio.KeioNew.Shinjuku', model_station_ref: 'sk:station:keio-new-line-shinjuku', source_id: 'src:legacy-shinjuku-csv', remarks: 'Shares its two tracks with toei:shinjuku:S01 (physical_group keio-new-shinjuku-4-5). Separate station entity per contract.' },
  { station_id: 'tokyo-metro:shinjuku:M08', operator_id: 'tokyo-metro', station_complex_id: 'complex:shinjuku', name_ja: '新宿', name_en: 'Shinjuku', name_zh: '新宿', line_ids: ['tokyo-metro:marunouchi'], station_code: 'M08', original_station_code: 'odpt.Station:TokyoMetro.Marunouchi.Shinjuku', model_station_ref: 'sk:station:tokyo-metro-shinjuku', source_id: 'src:legacy-shinjuku-csv', remarks: null },
  { station_id: 'toei:shinjuku:S01', operator_id: 'toei', station_complex_id: 'complex:shinjuku', name_ja: '新宿', name_en: 'Shinjuku', name_zh: '新宿', line_ids: ['toei:shinjuku'], station_code: 'S01', original_station_code: 'odpt.Station:Toei.Shinjuku.Shinjuku', model_station_ref: 'sk:station:keio-new-line-shinjuku', source_id: 'src:odpt-toei-station', remarks: 'Toei S-01 is the Keio New Line Shinjuku platforms; Toei data covers trains on the Toei side of the boundary only.' },
  { station_id: 'toei:shinjuku:E27', operator_id: 'toei', station_complex_id: 'complex:shinjuku', name_ja: '新宿', name_en: 'Shinjuku', name_zh: '新宿', line_ids: ['toei:oedo'], station_code: 'E27', original_station_code: 'odpt.Station:Toei.Oedo.Shinjuku', model_station_ref: 'sk:station:toei-oedo-shinjuku', source_id: 'src:odpt-toei-station', remarks: 'Not the same station as E01 新宿西口. Adjacent stations: E26 代々木 / E28 都庁前.' },
  { station_id: 'seibu:seibu-shinjuku', operator_id: 'seibu', station_complex_id: 'complex:seibu-shinjuku', name_ja: '西武新宿', name_en: 'Seibu-Shinjuku', name_zh: '西武新宿', line_ids: ['seibu:shinjuku'], station_code: 'SS01', original_station_code: 'odpt.Station:Seibu.Shinjuku.SeibuShinjuku', model_station_ref: 'sk:station:seibu-shinjuku', source_id: 'src:legacy-shinjuku-csv', remarks: 'Separate station from JR/Odakyu/Keio Shinjuku; transfers are on foot outside the gates.' },
  { station_id: 'tokyo-metro:shinjuku-sanchome:M09', operator_id: 'tokyo-metro', station_complex_id: 'complex:shinjuku-sanchome', name_ja: '新宿三丁目', name_en: 'Shinjuku-sanchome', name_zh: '新宿三丁目', line_ids: ['tokyo-metro:marunouchi'], station_code: 'M09', original_station_code: 'odpt.Station:TokyoMetro.Marunouchi.ShinjukuSanchome', model_station_ref: null, source_id: 'src:odpt-tokyometro', remarks: 'No timetable obtainable under a usable licence yet (see coverage gaps).' },
  { station_id: 'tokyo-metro:shinjuku-sanchome:F13', operator_id: 'tokyo-metro', station_complex_id: 'complex:shinjuku-sanchome', name_ja: '新宿三丁目', name_en: 'Shinjuku-sanchome', name_zh: '新宿三丁目', line_ids: ['tokyo-metro:fukutoshin'], station_code: 'F13', original_station_code: 'odpt.Station:TokyoMetro.Fukutoshin.ShinjukuSanchome', model_station_ref: null, source_id: 'src:odpt-tokyometro', remarks: 'Through trains are run with Tokyu, Tobu, Seibu, Yokohama Minatomirai and Sotetsu vehicles; no timetable obtainable yet.' },
  { station_id: 'toei:shinjuku-sanchome:S02', operator_id: 'toei', station_complex_id: 'complex:shinjuku-sanchome', name_ja: '新宿三丁目', name_en: 'Shinjuku-sanchome', name_zh: '新宿三丁目', line_ids: ['toei:shinjuku'], station_code: 'S02', original_station_code: 'odpt.Station:Toei.Shinjuku.ShinjukuSanchome', model_station_ref: null, source_id: 'src:odpt-toei-station', remarks: null },
  { station_id: 'toei:shinjuku-nishiguchi:E01', operator_id: 'toei', station_complex_id: 'complex:shinjuku-nishiguchi', name_ja: '新宿西口', name_en: 'Shinjuku-nishiguchi', name_zh: '新宿西口', line_ids: ['toei:oedo'], station_code: 'E01', original_station_code: 'odpt.Station:Toei.Oedo.ShinjukuNishiguchi', model_station_ref: null, source_id: 'src:odpt-toei-station', remarks: 'Not the same station as E27 新宿. Adjacent stations: E28 都庁前 / E02 東新宿. E27 and E01 are NOT consecutive stops; trains between them pass 都庁前 (and, round the loop, the whole ring).' },
];

// ---------------------------------------------------------------- directions
export const DIRECTIONS = [
  { direction_id: 'jr-east:yamanote:for-ikebukuro-ueno', line_id: 'jr-east:yamanote', label_ja: '池袋・上野方面', odpt_direction: null, legacy_label: '池袋・上野' },
  { direction_id: 'jr-east:yamanote:for-shibuya-shinagawa', line_id: 'jr-east:yamanote', label_ja: '渋谷・品川方面', odpt_direction: null, legacy_label: '渋谷・品川' },
  { direction_id: 'jr-east:chuo-rapid:for-tokyo', line_id: 'jr-east:chuo-rapid', label_ja: '東京方面', odpt_direction: null, legacy_label: '東京' },
  { direction_id: 'jr-east:chuo-rapid:for-takao-ome', line_id: 'jr-east:chuo-rapid', label_ja: '高尾・青梅方面', odpt_direction: null, legacy_label: '高尾・青梅' },
  { direction_id: 'jr-east:chuo-sobu-local:for-nakano-mitaka', line_id: 'jr-east:chuo-sobu-local', label_ja: '三鷹・中野方面', odpt_direction: null, legacy_label: '三鷹・中野' },
  { direction_id: 'jr-east:chuo-sobu-local:for-tsudanuma-chiba', line_id: 'jr-east:chuo-sobu-local', label_ja: '千葉・津田沼方面', odpt_direction: null, legacy_label: '千葉・津田沼' },
  { direction_id: 'jr-east:saikyo-kawagoe:for-omiya-kawagoe', line_id: 'jr-east:saikyo-kawagoe', label_ja: '大宮・川越方面', odpt_direction: null, legacy_label: '大宮・川越' },
  { direction_id: 'jr-east:saikyo-kawagoe:for-shinkiba-ebina', line_id: 'jr-east:saikyo-kawagoe', label_ja: '新木場・海老名方面', odpt_direction: null, legacy_label: '新木場・海老名' },
  { direction_id: 'jr-east:shonan-shinjuku:for-omiya-takasaki-utsunomiya', line_id: 'jr-east:shonan-shinjuku', label_ja: '大宮・高崎・宇都宮方面', odpt_direction: null, legacy_label: '大宮・高崎・宇都宮' },
  { direction_id: 'jr-east:shonan-shinjuku:for-yokohama-ofuna', line_id: 'jr-east:shonan-shinjuku', label_ja: '横浜・大船方面', odpt_direction: null, legacy_label: '横浜・大船' },
  { direction_id: 'odakyu:odawara:outbound', line_id: 'odakyu:odawara', label_ja: '本厚木・小田原方面', odpt_direction: null, legacy_label: '本厚木・小田原' },
  { direction_id: 'keio:keio:outbound', line_id: 'keio:keio', label_ja: '京王八王子・高尾山口・橋本方面', odpt_direction: null, legacy_label: '京王八王子・高尾山口・橋本' },
  { direction_id: 'keio:keio-new:outbound', line_id: 'keio:keio-new', label_ja: '笹塚・橋本方面', odpt_direction: null, legacy_label: '笹塚・橋本' },
  { direction_id: 'tokyo-metro:marunouchi:for-ikebukuro', line_id: 'tokyo-metro:marunouchi', label_ja: '池袋・茗荷谷方面', odpt_direction: null, legacy_label: '池袋・茗荷谷' },
  { direction_id: 'tokyo-metro:marunouchi:for-ogikubo-honancho', line_id: 'tokyo-metro:marunouchi', label_ja: '荻窪・方南町方面', odpt_direction: null, legacy_label: '荻窪・方南町' },
  { direction_id: 'tokyo-metro:fukutoshin:for-ikebukuro', line_id: 'tokyo-metro:fukutoshin', label_ja: '池袋・和光市方面', odpt_direction: null, legacy_label: null },
  { direction_id: 'tokyo-metro:fukutoshin:for-shibuya', line_id: 'tokyo-metro:fukutoshin', label_ja: '渋谷・横浜方面', odpt_direction: null, legacy_label: null },
  { direction_id: 'toei:shinjuku:eastbound', line_id: 'toei:shinjuku', label_ja: '本八幡方面 (東行)', odpt_direction: 'odpt.RailDirection:Eastbound', legacy_label: '本八幡・大島' },
  { direction_id: 'toei:shinjuku:westbound', line_id: 'toei:shinjuku', label_ja: '新宿・京王線方面 (西行)', odpt_direction: 'odpt.RailDirection:Westbound', legacy_label: null },
  { direction_id: 'toei:oedo:inner-loop', line_id: 'toei:oedo', label_ja: '内回り', odpt_direction: 'odpt.RailDirection:InnerLoop', legacy_label: null },
  { direction_id: 'toei:oedo:outer-loop', line_id: 'toei:oedo', label_ja: '外回り', odpt_direction: 'odpt.RailDirection:OuterLoop', legacy_label: null },
  { direction_id: 'seibu:shinjuku:outbound', line_id: 'seibu:shinjuku', label_ja: '本川越・拝島方面', odpt_direction: null, legacy_label: '本川越・拝島' },
];

// ---------------------------------------------------------------- platforms
// One row per track / platform face, namespaced by station_id. Never shared
// across operators. model_platform_ref points at the island in the 3D model.
const P = (station_id, label, model, extra = {}) => ({
  platform_id: `${station_id}:track-${label.replace('・', '-')}`, station_id, track_label: label,
  model_platform_ref: model, physical_group: extra.group ?? null, level_text: null,
  source_id: extra.source ?? 'src:legacy-shinjuku-csv', verification_status: extra.status ?? 'legacy_unverified', remarks: extra.remarks ?? null,
});
const jr = (n) => P('jr-east:shinjuku', String(n), `sk:platform:jr-east-shinjuku-${n % 2 ? n : n - 1}-${n % 2 ? n + 1 : n}`);
export const PLATFORMS = [
  ...Array.from({ length: 16 }, (_, i) => jr(i + 1)),
  ...['2・3', '2', '3'].map((l) => P('odakyu:shinjuku', l, 'sk:platform:odakyu-shinjuku-2-3', { remarks: l === '2・3' ? 'Label as given by the source ("2・3"): one train shown against two platform faces.' : null })),
  ...['4', '5'].map((l) => P('odakyu:shinjuku', l, 'sk:platform:odakyu-shinjuku-4-5')),
  P('odakyu:shinjuku', '6', 'sk:platform:odakyu-shinjuku-6'), P('odakyu:shinjuku', '7', 'sk:platform:odakyu-shinjuku-7'),
  ...['8', '9'].map((l) => P('odakyu:shinjuku', l, 'sk:platform:odakyu-shinjuku-8-9')), P('odakyu:shinjuku', '10', 'sk:platform:odakyu-shinjuku-10'),
  ...['1', '2'].map((l) => P('keio:shinjuku', l, 'sk:platform:keio-shinjuku-1-2')), P('keio:shinjuku', '3', 'sk:platform:keio-shinjuku-3'),
  ...['4', '5'].map((l) => P('keio:shinjuku-newline', l, 'sk:platform:keio-new-line-shinjuku-4-5', { group: 'keio-new-shinjuku-4-5' })),
  ...['4', '5'].map((l) => P('toei:shinjuku:S01', l, 'sk:platform:keio-new-line-shinjuku-4-5', { group: 'keio-new-shinjuku-4-5', remarks: 'Same physical tracks as keio:shinjuku-newline. Toei open data gives no platform at S01 except at train origins.' })),
  ...['1', '2'].map((l) => P('tokyo-metro:shinjuku:M08', l, 'sk:platform:tokyo-metro-shinjuku-1-2')),
  ...['6', '7'].map((l) => P('toei:shinjuku:E27', l, 'sk:platform:toei-oedo-shinjuku-6-7')),
  P('seibu:seibu-shinjuku', '1', 'sk:platform:seibu-shinjuku-1'), ...['2', '3'].map((l) => P('seibu:seibu-shinjuku', l, 'sk:platform:seibu-shinjuku-2-3')),
];

// ---------------------------------------------------------------- calendars
export const CALENDARS = [
  { service_calendar_id: 'cal:toei:weekday', operator_id: 'toei', service_date_type: 'weekday', source_calendar: 'odpt.Calendar:Weekday', rule: 'Mon–Fri that are not national holidays', special_dates_status: 'unverified', source_id: 'src:odpt-toei-train-timetable', remarks: 'Year-end/New-Year special operation (e.g. 12/30–1/3) is announced separately by Toei and is NOT modelled; resolver flags those dates.' },
  { service_calendar_id: 'cal:toei:saturday-holiday', operator_id: 'toei', service_date_type: 'saturday_holiday', source_calendar: 'odpt.Calendar:SaturdayHoliday', rule: 'Sat, Sun and national holidays (内閣府 list)', special_dates_status: 'unverified', source_id: 'src:odpt-toei-train-timetable', remarks: null },
  ...['jr-east', 'odakyu', 'keio', 'tokyo-metro', 'seibu'].flatMap((op) => [
    { service_calendar_id: `cal:${op}:weekday:legacy`, operator_id: op, service_date_type: 'weekday', source_calendar: '平日', rule: 'Mon–Fri that are not national holidays (assumed; legacy file gives only the label 平日)', special_dates_status: 'unknown', source_id: 'src:legacy-shinjuku-csv', remarks: 'Validity period of the legacy file is unknown.' },
    { service_calendar_id: `cal:${op}:saturday-holiday:legacy`, operator_id: op, service_date_type: 'saturday_holiday', source_calendar: '土休日', rule: 'Sat, Sun and national holidays (assumed; legacy file gives only the label 土休日)', special_dates_status: 'unknown', source_id: 'src:legacy-shinjuku-csv', remarks: 'Saturday vs Sunday/holiday split is NOT made because the source does not make it.' },
  ]),
  { service_calendar_id: 'cal:toei:weekday:legacy', operator_id: 'toei', service_date_type: 'weekday', source_calendar: '平日', rule: 'as legacy', special_dates_status: 'unknown', source_id: 'src:legacy-shinjuku-csv', remarks: 'Legacy layer only.' },
  { service_calendar_id: 'cal:toei:saturday-holiday:legacy', operator_id: 'toei', service_date_type: 'saturday_holiday', source_calendar: '土休日', rule: 'as legacy', special_dates_status: 'unknown', source_id: 'src:legacy-shinjuku-csv', remarks: 'Legacy layer only.' },
];

// ---------------------------------------------------------------- vehicle catalog
// One row per (series, formation length) configuration — never one-to-one.
export const VEHICLE_CATALOG = [
  { vehicle_id: 'toei-10-300-10', operator_id: 'toei', vehicle_series: '10-300', formation_length: 10, service_lines: ['toei:shinjuku', 'keio:keio', 'keio:keio-new'], valid_from: '2023-03-31', valid_until: null, model_asset_id: null, source_id: 'src:tetsudo-ch-10-300-10car', verification_status: 'representative', remarks: 'All Toei Shinjuku Line sets 10 cars from end of FY2022 (secondary source).' },
  { vehicle_id: 'keio-9000-10', operator_id: 'keio', vehicle_series: '9000', formation_length: 10, service_lines: ['keio:keio', 'keio:keio-new', 'toei:shinjuku'], valid_from: null, valid_until: null, model_asset_id: null, source_id: 'src:tetsudo-ch-10-300-10car', verification_status: 'representative', remarks: 'Runs through to Toei Shinjuku Line (secondary source). Keio also runs 8-car 9000 sets that do not enter the Toei line — not catalogued here.' },
  { vehicle_id: 'keio-5000-10', operator_id: 'keio', vehicle_series: '5000', formation_length: 10, service_lines: ['keio:keio', 'keio:keio-new', 'toei:shinjuku'], valid_from: null, valid_until: null, model_asset_id: null, source_id: 'src:tetsudo-ch-10-300-10car', verification_status: 'representative', remarks: 'Also used for 京王ライナー. Through running to Toei per secondary source.' },
  { vehicle_id: 'toei-12-000-8', operator_id: 'toei', vehicle_series: '12-000', formation_length: 8, service_lines: ['toei:oedo'], valid_from: '2025-04-01', valid_until: null, model_asset_id: null, source_id: 'src:toei-overview-fleet', verification_status: 'representative', remarks: '8 cars × 29 sets as of 2025-04-01 (excerpt of the Toei overview page).' },
  { vehicle_id: 'toei-12-600-8', operator_id: 'toei', vehicle_series: '12-600', formation_length: 8, service_lines: ['toei:oedo'], valid_from: '2025-04-01', valid_until: null, model_asset_id: null, source_id: 'src:toei-overview-fleet', verification_status: 'representative', remarks: '8 cars × 30 sets as of 2025-04-01 (excerpt of the Toei overview page).' },
  { vehicle_id: 'jr-east-e233-0-12', operator_id: 'jr-east', vehicle_series: 'E233-0', formation_length: 12, service_lines: ['jr-east:chuo-rapid'], valid_from: '2025-03-15', valid_until: null, model_asset_id: null, source_id: 'src:jreast-chuo-green-2025', verification_status: 'representative', remarks: 'With two bilevel Green cars (cars 4–5 from the Tokyo end). Secondary source.' },
  { vehicle_id: 'jr-east-e233-0-10', operator_id: 'jr-east', vehicle_series: 'E233-0', formation_length: 10, service_lines: ['jr-east:chuo-rapid'], valid_from: '2025-03-15', valid_until: null, model_asset_id: null, source_id: 'src:jreast-chuo-green-2025', verification_status: 'representative', remarks: 'A few sets without Green cars reported to remain after 2025-03-15; which trains they work is not published. Secondary source.' },
];

// Destination names for ODPT station ids outside the Toei station list.
export const EXTRA_STATION_NAMES = {
  'odpt.Station:Keio.KeioNew.Sasazuka': { ja: '笹塚', en: 'Sasazuka' },
  'odpt.Station:Keio.Sagamihara.Hashimoto': { ja: '橋本', en: 'Hashimoto' },
  'odpt.Station:Keio.Sagamihara.KeioTamaCenter': { ja: '京王多摩センター', en: 'Keio-tama-center' },
  'odpt.Station:Keio.Sagamihara.Wakabadai': { ja: '若葉台', en: 'Wakabadai' },
  'odpt.Station:Keio.Keio.KeioHachioji': { ja: '京王八王子', en: 'Keio-hachioji' },
  'odpt.Station:Keio.Takao.Takaosanguchi': { ja: '高尾山口', en: 'Takaosanguchi' },
  'odpt.Station:Keio.Takao.Takao': { ja: '高尾', en: 'Takao' },
  'odpt.Station:Keio.Keio.Chofu': { ja: '調布', en: 'Chofu' },
  'odpt.Station:Keio.Keio.Sakurajosui': { ja: '桜上水', en: 'Sakurajosui' },
};

// Chinese display names (optional mapping; Japanese stays the canonical text).
export const DEST_ZH = {
  本八幡: '本八幡', 大島: '大岛', 瑞江: '瑞江', 岩本町: '岩本町', 笹塚: '笹冢', 橋本: '桥本', 京王多摩センター: '京王多摩中心', 若葉台: '若叶台', 新宿: '新宿',
  都庁前: '都厅前', 光が丘: '光之丘', 清澄白河: '清澄白河', 汐留: '汐留', 新御徒町: '新御徒町', 六本木: '六本木', 大門: '大门', 両国: '两国',
};

export const SERVICE_CLASS = {
  // operator text → unified class (local | rapid | express | limited_express | liner | other)
  各駅停車: 'local', 普通: 'local', 快速: 'rapid', 通勤快速: 'rapid', 特別快速: 'rapid', 中央特快: 'rapid', 青梅特快: 'rapid', 通勤特別快速: 'rapid',
  区間急行: 'express', 急行: 'express', 準急: 'express', 快速急行: 'express', 通勤急行: 'express',
  特急: 'limited_express', ライナー: 'liner',
};
