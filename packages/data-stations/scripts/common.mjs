import { makeSkId, parseLegacyLabId, parseSkId } from '@senkiro/contracts';
import { KSJ } from './manifest.mjs';

export const NEUTRAL_COLOR = '#718096';
export const NON_RAIL_OPERATORS = new Set([
  'sk:operator:busta-shinjuku',
  'sk:operator:public-space',
]);

const CATEGORIES = {
  'jr-west': 'jr',
  'jr-east': 'jr',
  'osaka-metro': 'metro',
  'tokyo-metro': 'metro',
  toei: 'toei',
};

export function indexById(items) {
  return new Map(items.map((item) => [item.id, item]));
}

export function requireEntry(map, id) {
  const value = map.get(id);
  if (value === undefined) {
    throw new Error(`No migrated reference for ${id}`);
  }
  return value;
}

export function names(value = {}) {
  return {
    ja: value.ja ?? null,
    ja_kana: value.ja_kana ?? null,
    en: value.en ?? null,
    zh: value.zh ?? null,
  };
}

export function pointFootprint({ x, z }, half = 0.28) {
  return [{ x0: x - half, x1: x + half, z0: z - half, z1: z + half }];
}

export function axisSide(axis, sign) {
  return `${axis}${sign < 0 ? '-' : '+'}`;
}

export function createMigration(config, raw, sourceRecords, lineStyles) {
  const { scope, region } = config;
  const legacy = (rawId, entity) => parseLegacyLabId(rawId, scope, { entity });
  const slug = (rawId, entity) => parseSkId(legacy(rawId, entity), entity).slug;
  const sourceId = (rawId) =>
    rawId.startsWith('src:') ? makeSkId('source', scope, rawId.slice(4)) : legacy(rawId, 'source');
  const operatorId = (rawId) =>
    rawId && !NON_RAIL_OPERATORS.has(rawId)
      ? makeSkId('operator', 'jp', slug(rawId, 'operator'))
      : null;
  const stationsById = indexById(raw.stations);
  const lineIds = new Map();
  for (const line of raw.lines) {
    const oldSlug = slug(line.id, 'line');
    let lineSlug = oldSlug;
    if (scope === 'umeda') {
      const owner = slug(line.operatorId, 'operator');
      lineSlug = `${owner}-${oldSlug.replace(/^(jr|hk|hs)-/, '')}`;
    }
    lineIds.set(line.id, makeSkId('line', region, lineSlug));
  }
  const stationId = (rawId) =>
    rawId === null ? null : makeSkId('station', region, config.stations[slug(rawId, 'station')][0]);
  const lineId = (rawId) => requireEntry(lineIds, rawId);
  const complexId = makeSkId('complex', region, slug(raw.complex.id, 'complex'));
  const base = (item, id, extraSources = [], moreNotes = []) => {
    const { provenance } = item;
    const sourceIds = [...new Set([...provenance.sourceIds, ...extraSources].map(sourceId))];
    const note = [...new Set([provenance.note, item.notes, ...moreNotes].filter(Boolean))].join(
      ' ',
    );
    return {
      id,
      externalIds: item.externalIds ?? {},
      names: names(item.names),
      provenance: {
        sourceIds,
        dataNature: provenance.dataNature,
        lastVerifiedAt: provenance.lastVerifiedAt ?? null,
        ...(note ? { note } : {}),
      },
      validFrom: item.validFrom ?? null,
      validTo: item.validTo ?? null,
    };
  };
  const sourcedFact = (fact) => ({
    ...fact,
    sourceIds: [...new Set(fact.sourceIds.map(sourceId))],
  });
  const ksj = (entity) => {
    entity.provenance.sourceIds.push(KSJ.id);
    return entity;
  };

  const stations = raw.stations.map((item) => {
    const [, ksjId, ksjGroup, coordinates] = config.stations[slug(item.id, 'station')];
    const entity = ksj(base(item, stationId(item.id)));
    return {
      ...entity,
      externalIds: { ...entity.externalIds, ksj: ksjId, ksjGroup },
      operatorId: operatorId(item.operatorId),
      railLineIds: (item.railLineIds ?? item.lineIds).map(lineId),
      stationComplexId: complexId,
      stationCode: item.externalIds?.stationCode ?? null,
      coordinates,
      municipalityCode: null,
      wardOrCity: null,
      fareZoneTags: [],
    };
  });
  const complex = {
    ...ksj(base(raw.complex, complexId)),
    stationIds: raw.complex.stationIds.map(stationId),
    coordinates: config.complexCoordinates,
    wardOrCity: config.wardOrCity,
    explicitlyExcluded: raw.complex.explicitlyExcluded ?? [],
  };

  const lines = raw.lines.map((line) => {
    const owner = slug(line.operatorId, 'operator');
    const style = lineStyles.get(line.id);
    const id = lineId(line.id);
    const lineClass = ['osaka-metro', 'tokyo-metro', 'toei'].includes(owner)
      ? 'metro'
      : CATEGORIES[owner] === 'jr'
        ? 'unknown'
        : 'private';
    return {
      ...base(line, id, style?.color?.sourceIds, [line.displayColorNote]),
      operatorId: operatorId(line.operatorId),
      color: style?.color?.hex ?? line.displayColor ?? NEUTRAL_COLOR,
      stationCodePrefix: style?.stationNumberPrefix ?? line.stationNumberPrefix ?? null,
      lineClass,
      stationIds: stations
        .filter((station) => station.railLineIds.includes(id))
        .map((station) => station.id),
      coverageStatus: 'partial',
    };
  });

  const operators = raw.operators
    .filter((op) => !NON_RAIL_OPERATORS.has(op.id))
    .map((op) => ({
      ...base(op, operatorId(op.id)),
      category: CATEGORIES[slug(op.id, 'operator')] ?? 'private',
      brandColor: NEUTRAL_COLOR,
      coverageStatus: 'partial',
      coverageNotes: 'Hub only. Neutral display colour, with line colours recorded separately.',
    }));

  const registry = new Map(
    sourceRecords
      .filter((source) => !source.id.startsWith('demo:'))
      .map((source) => [sourceId(source.id), source]),
  );
  const officialLabels = {
    official_floor_map: { ja: '構内図', en: 'Floor map', zh: '构内图' },
    official_timetable: { ja: '時刻表', en: 'Timetable', zh: '时刻表' },
    operator_info: { ja: '駅情報', en: 'Station information', zh: '车站信息' },
    accessibility_info: { ja: 'バリアフリー情報', en: 'Accessibility', zh: '无障碍信息' },
  };
  const externalLinks = config.official.map(([oldSource, oldStation, kind]) => {
    const id = makeSkId('source', scope, oldSource);
    const source = requireEntry(registry, id);
    const station = requireEntry(stationsById, `sk:station:${oldStation}`);
    const description = officialLabels[kind];
    const label = Object.fromEntries(
      Object.keys(description).map((lang) => [
        lang,
        `${station.names[lang] ?? station.names.ja} · ${description[lang]}`,
      ]),
    );
    return {
      kind,
      label: names(label),
      url: source.url,
      operatorId: operatorId(station.operatorId),
      stationId: stationId(station.id),
      sourceId: id,
    };
  });

  const finish = ({ levels, places, links }) => {
    const needed = new Set(externalLinks.map((item) => item.sourceId));
    for (const item of [
      complex,
      ...operators,
      ...lines,
      ...stations,
      ...levels,
      ...places,
      ...links,
    ]) {
      for (const id of item.provenance.sourceIds) {
        needed.add(id);
      }
    }
    for (const place of places) {
      for (const id of place.terminus?.sourceIds ?? []) {
        needed.add(id);
      }
      for (const track of place.tracks ?? []) {
        for (const id of track.platformDoors?.sourceIds ?? []) {
          needed.add(id);
        }
      }
    }
    needed.delete(KSJ.id);
    const sources = [...needed].sort().map((id) => {
      const raw = requireEntry(registry, id);
      if (/\bODbL\b/i.test(raw.license)) {
        throw new Error(`ODbL source ${id} must stay in a separate data layer`);
      }
      const url = raw.url?.startsWith('https://') ? raw.url : null;
      return {
        id,
        title: raw.title,
        publisher: raw.publisher,
        url,
        retrievedAt: raw.retrievedAt,
        sourceDate: raw.sourceDate ?? null,
        license: raw.license,
        licenseUrl: raw.licenseUrl ?? null,
        commercialUse: raw.commercialUse,
        redistribution: raw.redistribution,
        shareAlike: raw.shareAlike,
        attributionText: raw.attributionText,
        notes: [raw.notes, url ? null : raw.url].filter(Boolean).join(' '),
      };
    });
    return {
      complex,
      operators,
      lines,
      stations,
      levels,
      places,
      links,
      externalLinks,
      sources: [...sources, KSJ],
      disclaimer: names({
        ja: '駅構内は模式図です。形状・階高・距離は実測値ではありません。通行や段差の最新情報は各事業者で確認してください。',
        en: 'Schematic station model. Geometry, level heights and distances are not surveyed. Check current access and step-free information with the operators.',
        zh: '站内示意模型，形状、楼层高度和距离均为非实测数据。最新的通行和无台阶信息请向运营方确认。',
      }),
    };
  };

  return {
    legacy,
    slug,
    base,
    sourcedFact,
    operatorId,
    stationId,
    lineId,
    complexId,
    stationsById,
    finish,
  };
}

/** Resolve references by the complete legacy ID before collapsing aliases to 'place'. */
export function allocatePlaceIds(rawIds, scope, legacy) {
  const groups = new Map();
  for (const rawId of rawIds) {
    const id = legacy(rawId, 'place');
    const group = groups.get(id) ?? [];
    if (group.includes(rawId)) {
      throw new Error(`Duplicate legacy place ID ${rawId}`);
    }
    group.push(rawId);
    groups.set(id, group);
  }
  const reserved = new Set(groups.keys());
  const result = new Map();
  for (const [id, group] of groups) {
    for (const rawId of group) {
      if (group.length === 1) {
        result.set(rawId, id);
        continue;
      }
      const rawKind = rawId.split(':')[1];
      const preferred = `${parseSkId(id, 'place').slug}-${rawKind}`;
      let candidate = makeSkId('place', scope, preferred);
      let suffix = 2;
      while (reserved.has(candidate)) {
        candidate = makeSkId('place', scope, `${preferred}-${suffix}`);
        suffix += 1;
      }
      reserved.add(candidate);
      result.set(rawId, candidate);
    }
  }
  return result;
}
