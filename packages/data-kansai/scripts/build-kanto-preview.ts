import { execSync } from 'node:child_process';
import {
  type Interchange,
  type LocalizedNames,
  type LonLat,
  type Operator,
  type Provenance,
  parseLegacyLabId,
  type RailLine,
  type SkId,
  type SourceRecord,
  type Station,
  type StationComplex,
  type ThroughService,
  type TrackGraph,
  type TrackSegment,
  type TrackVerticalAttribute,
  type TrackVerticalLayer,
} from '@senkiro/contracts';
import { shinjukuHubDataset } from '@senkiro/data-stations/shinjuku';
import type { UnalignedRecord } from '@senkiro/domain-core';

interface LegacyAtlas {
  sources: Array<{
    id: string;
    title: string;
    publisher: string;
    url: string | null;
    retrievedAt: string;
    sourceDate?: string | null;
    license: string;
    licenseUrl?: string | null;
    commercialUse: 'yes' | 'no' | 'conditional' | 'unknown';
    redistribution: 'yes' | 'no' | 'conditional' | 'unknown';
    shareAlike: boolean | 'unknown';
    attributionText: string;
    notes: string;
  }>;
  operators: Array<{
    id: string;
    externalIds: Record<string, string>;
    names: { ja?: string | null; ja_kana?: string | null; en?: string | null; zh?: string | null };
    provenance: Provenance;
    validFrom?: string | null;
    validTo?: string | null;
    category: Operator['category'];
    brandColor: string;
    coverageStatus: Operator['coverageStatus'];
    coverageNotes: string;
  }>;
  railLines: Array<{
    id: string;
    externalIds: Record<string, string>;
    names: { ja?: string | null; ja_kana?: string | null; en?: string | null; zh?: string | null };
    provenance: Provenance;
    validFrom?: string | null;
    validTo?: string | null;
    operatorId: string;
    color: string;
    stationCodePrefix: string | null;
    lineClass: RailLine['lineClass'];
    stationIds: string[];
    coverageStatus: RailLine['coverageStatus'];
    inTokyoSuburbanArea?: boolean;
    inFareSlice?: boolean;
  }>;
  stations: Array<{
    id: string;
    externalIds: Record<string, string>;
    names: { ja?: string | null; ja_kana?: string | null; en?: string | null; zh?: string | null };
    provenance: Provenance;
    validFrom?: string | null;
    validTo?: string | null;
    operatorId: string;
    railLineIds: string[];
    stationComplexId: string | null;
    stationCode: string | null;
    coordinates: LonLat;
    wardOrCity: string | null;
    inTokyoSuburbanArea?: boolean;
    inFareSlice?: boolean;
  }>;
  stationComplexes: Array<{
    id: string;
    externalIds: Record<string, string>;
    names: { ja?: string | null; ja_kana?: string | null; en?: string | null; zh?: string | null };
    provenance: Provenance;
    validFrom?: string | null;
    validTo?: string | null;
    stationIds: string[];
    coordinates: LonLat;
    wardOrCity: string | null;
  }>;
  trackSegments: Array<{
    id: string;
    externalIds: Record<string, string>;
    names: { ja?: string | null; ja_kana?: string | null; en?: string | null; zh?: string | null };
    provenance: Provenance;
    validFrom?: string | null;
    validTo?: string | null;
    fromStationId: string;
    toStationId: string;
    railLineIds: string[];
    operatorId: string;
    geometry: LonLat[];
    operatingKm: number | null;
    distanceNature: TrackSegment['distanceNature'];
    lineClass: TrackSegment['lineClass'];
    isShinkansen: boolean;
    parallelConventionalLineId: string | null;
    inTokyoSuburbanArea?: boolean;
  }>;
  interchanges: Array<{
    id: string;
    externalIds: Record<string, string>;
    names: { ja?: string | null; ja_kana?: string | null; en?: string | null; zh?: string | null };
    provenance: Provenance;
    validFrom?: string | null;
    validTo?: string | null;
    fromStationId: string;
    toStationId: string;
    stationComplexId: string;
    gateType: Interchange['gateType'];
    walkingMinutes: number | null;
    notes: string | null;
  }>;
  throughServices: Array<{
    id: string;
    externalIds: Record<string, string>;
    names: { ja?: string | null; ja_kana?: string | null; en?: string | null; zh?: string | null };
    provenance: Provenance;
    validFrom?: string | null;
    validTo?: string | null;
    boundaryStationId: string;
    fromRailLineId: string;
    toRailLineId: string;
    operatorIds: string[];
    serviceDescription: string;
    notes: string | null;
  }>;
  unalignedRecords: Array<{
    sourceId: string;
    externalId: string;
    rawName: string;
    operatorRaw: string;
    lineRaw: string;
    coordinates: LonLat | null;
    reason: string;
  }>;
}

interface LegacyVerticalJson {
  source: LegacyAtlas['sources'][number];
  records: Array<{
    trackSegmentId: string;
    verticalClass: TrackVerticalAttribute['verticalClass'];
    verticalOrder: number | null;
    elevationM: number | null;
    provenance: Provenance;
  }>;
}

const SOURCE_ID_MAP: Readonly<Record<string, string>> = {
  'src-ksj-n02-2024': 'sk:source:jp:mlit-ksj-n02-24',
  'src-odpt-toei-gtfs': 'sk:source:kanto:odpt-toei-gtfs',
  'src-gsi-tiles': 'sk:source:jp:gsi-pale-tiles',
  'src-jr-east-kippu-1101': 'sk:source:kanto:jr-east-kippu-1101',
  'src-jr-east-kippu-1103': 'sk:source:kanto:jr-east-kippu-1103',
  'src-jr-east-ryokaku-2026': 'sk:source:kanto:jr-east-ryokaku-2026',
  'src-jr-central-rules': 'sk:source:kanto:jr-central-rules',
  'src-manual-verified-tokyo-ref': 'sk:source:kanto:manual-verified-tokyo-ref',
  'src-synthetic-fare-tariff': 'sk:source:kanto:synthetic-fare-tariff',
  'src-osm-overpass-vertical': 'sk:source:jp:osm-rail-vertical',
};

function mapSourceId(raw: string): string {
  return SOURCE_ID_MAP[raw] ?? raw;
}

function mapProvenance(prov: Provenance): Provenance {
  return {
    ...prov,
    sourceIds: prov.sourceIds.map(mapSourceId),
  };
}

function toLocalizedNames(raw: {
  ja?: string | null;
  ja_kana?: string | null;
  en?: string | null;
  zh?: string | null;
}): LocalizedNames {
  return {
    ja: raw.ja ?? null,
    ja_kana: raw.ja_kana ?? null,
    en: raw.en ?? null,
    zh: raw.zh ?? null,
  };
}

function fareTags(inTokyoSuburban?: boolean, inFareSlice?: boolean): string[] {
  const tags: string[] = [];
  if (inTokyoSuburban === true) {
    tags.push('suburban:tokyo');
  }
  if (inFareSlice === true) {
    tags.push('slice:jr-east-kanto');
  }
  return tags;
}

function mapStationId(legacyId: string): SkId<'station'> {
  if (legacyId === 'sk:station:seibu-seibu-shinjuku') {
    return 'sk:station:kanto:seibu-shinjuku';
  }
  if (legacyId === 'sk:station:toei-shinjuku') {
    return 'sk:station:kanto:toei-oedo-shinjuku';
  }
  return parseLegacyLabId(legacyId, 'kanto', { entity: 'station' }) as SkId<'station'>;
}

export interface KantoPreviewBuildOutput {
  trackGraph: TrackGraph;
  throughServices: ThroughService[];
  unalignedRecords: UnalignedRecord[];
  verticalLayer: TrackVerticalLayer;
}

export function buildKantoPreviewDataset(): KantoPreviewBuildOutput {
  const rawAtlas = JSON.parse(
    execSync('git show lab/a-tokyo-atlas-fare:labs/a-tokyo-atlas-fare/data/processed/atlas.json', {
      maxBuffer: 50 * 1024 * 1024,
    }).toString('utf8'),
  ) as LegacyAtlas;

  const rawVertical = JSON.parse(
    execSync(
      'git show lab/a-tokyo-atlas-fare:labs/a-tokyo-atlas-fare/data/processed/osm-vertical.json',
      { maxBuffer: 50 * 1024 * 1024 },
    ).toString('utf8'),
  ) as LegacyVerticalJson;

  const operators: Operator[] = rawAtlas.operators.map((op) => ({
    id: parseLegacyLabId(op.id, 'jp', { entity: 'operator' }) as SkId<'operator'>,
    externalIds: op.externalIds,
    names: toLocalizedNames(op.names),
    provenance: mapProvenance(op.provenance),
    validFrom: op.validFrom ?? null,
    validTo: op.validTo ?? null,
    category: op.category,
    brandColor: op.brandColor,
    coverageStatus: op.coverageStatus,
    coverageNotes: op.coverageNotes,
  }));

  const lines: RailLine[] = rawAtlas.railLines.map((ln) => {
    const mappedStations = ln.stationIds.map((sid) => {
      if (sid === 'sk:station:toei-shinjuku' && ln.id === 'sk:line:toei-shinjuku') {
        return 'sk:station:kanto:keio-new-line-shinjuku' as SkId<'station'>;
      }
      return mapStationId(sid);
    });
    return {
      id: parseLegacyLabId(ln.id, 'kanto', { entity: 'line' }) as SkId<'line'>,
      externalIds: ln.externalIds,
      names: toLocalizedNames(ln.names),
      provenance: mapProvenance(ln.provenance),
      validFrom: ln.validFrom ?? null,
      validTo: ln.validTo ?? null,
      operatorId: parseLegacyLabId(ln.operatorId, 'jp', { entity: 'operator' }) as SkId<'operator'>,
      color: ln.color,
      stationCodePrefix: ln.stationCodePrefix,
      lineClass: ln.lineClass,
      stationIds: mappedStations,
      coverageStatus: ln.coverageStatus,
    };
  });

  const shinjuku10Set = new Set<SkId<'station'>>(shinjukuHubDataset.complex.stationIds);
  const supersededComplexIds = new Set<SkId<'complex'>>([
    'sk:complex:kanto:shinjuku-sanchome',
    'sk:complex:kanto:shinjuku-nishiguchi',
    'sk:complex:kanto:seibu-shinjuku',
  ]);

  const stations: Station[] = [];
  for (const st of rawAtlas.stations) {
    if (st.id === 'sk:station:toei-shinjuku') {
      // Split Lab A's toei-shinjuku into Oedo Shinjuku (Toei) and Keio New Line / Toei Shinjuku (Keio)
      stations.push({
        id: 'sk:station:kanto:toei-oedo-shinjuku',
        externalIds: st.externalIds,
        names: {
          ja: '都営大江戸線 新宿駅',
          ja_kana: 'しんじゅく',
          en: 'Toei Oedo Line Shinjuku Station',
          zh: '都营大江户线新宿站',
        },
        provenance: mapProvenance(st.provenance),
        validFrom: st.validFrom ?? null,
        validTo: st.validTo ?? null,
        operatorId: 'sk:operator:jp:toei',
        railLineIds: ['sk:line:kanto:toei-oedo'],
        stationComplexId: 'sk:complex:kanto:shinjuku',
        stationCode: 'E27',
        coordinates: [139.69935, 35.687625],
        municipalityCode: null,
        wardOrCity: '東京都新宿区',
        fareZoneTags: fareTags(st.inTokyoSuburbanArea, st.inFareSlice),
      });
      stations.push({
        id: 'sk:station:kanto:keio-new-line-shinjuku',
        externalIds: st.externalIds,
        names: {
          ja: '京王新線・都営新宿線 新宿駅',
          ja_kana: 'しんじゅく',
          en: 'Keio New Line / Toei Shinjuku Line Shinjuku Station',
          zh: '京王新线·都营新宿线新宿站',
        },
        provenance: mapProvenance(st.provenance),
        validFrom: st.validFrom ?? null,
        validTo: st.validTo ?? null,
        operatorId: 'sk:operator:jp:keio',
        railLineIds: ['sk:line:kanto:toei-shinjuku'],
        stationComplexId: 'sk:complex:kanto:shinjuku',
        stationCode: 'S01',
        coordinates: [139.698615, 35.68843],
        municipalityCode: null,
        wardOrCity: '東京都新宿区',
        fareZoneTags: fareTags(st.inTokyoSuburbanArea, st.inFareSlice),
      });
      continue;
    }

    const mappedId = mapStationId(st.id);
    const mappedComplex =
      st.stationComplexId === null
        ? null
        : (parseLegacyLabId(st.stationComplexId, 'kanto', {
            entity: 'complex',
          }) as SkId<'complex'>);
    const finalComplexId = shinjuku10Set.has(mappedId)
      ? ('sk:complex:kanto:shinjuku' as SkId<'complex'>)
      : mappedComplex !== null && supersededComplexIds.has(mappedComplex)
        ? null
        : mappedComplex;

    const localized = toLocalizedNames(st.names);
    if (mappedId === 'sk:station:kanto:seibu-shinjuku') {
      localized.zh = '西武新宿站';
    }

    stations.push({
      id: mappedId,
      externalIds: st.externalIds,
      names: localized,
      provenance: mapProvenance(st.provenance),
      validFrom: st.validFrom ?? null,
      validTo: st.validTo ?? null,
      operatorId: parseLegacyLabId(st.operatorId, 'jp', { entity: 'operator' }) as SkId<'operator'>,
      railLineIds: st.railLineIds.map(
        (lid) => parseLegacyLabId(lid, 'kanto', { entity: 'line' }) as SkId<'line'>,
      ),
      stationComplexId: finalComplexId,
      stationCode: st.stationCode,
      coordinates: st.coordinates,
      municipalityCode: null,
      wardOrCity: st.wardOrCity,
      fareZoneTags: fareTags(st.inTokyoSuburbanArea, st.inFareSlice),
    });
  }

  const legacySegmentIdToV1Id = new Map<string, SkId<'segment'>>();
  const segments: TrackSegment[] = rawAtlas.trackSegments.map((seg) => {
    const mappedLineIds = seg.railLineIds.map(
      (lid) => parseLegacyLabId(lid, 'kanto', { entity: 'line' }) as SkId<'line'>,
    );
    const isToeiShinjuku = mappedLineIds.includes('sk:line:kanto:toei-shinjuku');
    const resolveSegEndpoint = (sid: string): SkId<'station'> => {
      if (sid === 'sk:station:toei-shinjuku' && isToeiShinjuku) {
        return 'sk:station:kanto:keio-new-line-shinjuku';
      }
      return mapStationId(sid);
    };

    const newId = parseLegacyLabId(seg.id, 'kanto', { entity: 'segment' }) as SkId<'segment'>;
    legacySegmentIdToV1Id.set(seg.id, newId);

    return {
      id: newId,
      externalIds: seg.externalIds,
      names: toLocalizedNames(seg.names),
      provenance: mapProvenance(seg.provenance),
      validFrom: seg.validFrom ?? null,
      validTo: seg.validTo ?? null,
      fromStationId: resolveSegEndpoint(seg.fromStationId),
      toStationId: resolveSegEndpoint(seg.toStationId),
      railLineIds: mappedLineIds,
      operatorId: parseLegacyLabId(seg.operatorId, 'jp', {
        entity: 'operator',
      }) as SkId<'operator'>,
      geometry: seg.geometry,
      operatingKm: seg.operatingKm,
      distanceNature: seg.distanceNature,
      lineClass: seg.lineClass,
      isShinkansen: seg.isShinkansen,
      parallelConventionalLineId:
        seg.parallelConventionalLineId === null
          ? null
          : (parseLegacyLabId(seg.parallelConventionalLineId, 'kanto', {
              entity: 'line',
            }) as SkId<'line'>),
      fareZoneTags: fareTags(seg.inTokyoSuburbanArea, false),
    };
  });

  const complexes: StationComplex[] = [];
  for (const cx of rawAtlas.stationComplexes) {
    const newId = parseLegacyLabId(cx.id, 'kanto', { entity: 'complex' }) as SkId<'complex'>;
    if (supersededComplexIds.has(newId)) {
      continue;
    }
    if (newId === 'sk:complex:kanto:shinjuku') {
      complexes.push({
        id: 'sk:complex:kanto:shinjuku',
        externalIds: cx.externalIds,
        names: { ja: '新宿駅', ja_kana: 'しんじゅくえき', en: 'Shinjuku Station', zh: '新宿站' },
        provenance: mapProvenance(cx.provenance),
        validFrom: cx.validFrom ?? null,
        validTo: cx.validTo ?? null,
        stationIds: [...shinjukuHubDataset.complex.stationIds],
        coordinates: shinjukuHubDataset.complex.coordinates,
        wardOrCity: shinjukuHubDataset.complex.wardOrCity,
        explicitlyExcluded: [...shinjukuHubDataset.complex.explicitlyExcluded],
      });
      continue;
    }
    complexes.push({
      id: newId,
      externalIds: cx.externalIds,
      names: toLocalizedNames(cx.names),
      provenance: mapProvenance(cx.provenance),
      validFrom: cx.validFrom ?? null,
      validTo: cx.validTo ?? null,
      stationIds: cx.stationIds.map(mapStationId),
      coordinates: cx.coordinates,
      wardOrCity: cx.wardOrCity,
      explicitlyExcluded: [],
    });
  }

  const interchanges: Interchange[] = rawAtlas.interchanges.map((ic) => {
    const rawCxId = parseLegacyLabId(ic.stationComplexId, 'kanto', {
      entity: 'complex',
    }) as SkId<'complex'>;
    const finalCxId = supersededComplexIds.has(rawCxId)
      ? ('sk:complex:kanto:shinjuku' as SkId<'complex'>)
      : rawCxId;
    return {
      id: parseLegacyLabId(ic.id, 'kanto', { entity: 'interchange' }) as SkId<'interchange'>,
      externalIds: ic.externalIds,
      names: toLocalizedNames(ic.names),
      provenance: mapProvenance(ic.provenance),
      validFrom: ic.validFrom ?? null,
      validTo: ic.validTo ?? null,
      fromStationId: mapStationId(ic.fromStationId),
      toStationId: mapStationId(ic.toStationId),
      stationComplexId: finalCxId,
      gateType: ic.gateType,
      walkingMinutes: ic.walkingMinutes,
      stepFree: null,
      notes: ic.notes,
    };
  });

  // Add explicit Shinjuku interchanges for Keio New Line / Toei Shinjuku split
  interchanges.push(
    {
      id: 'sk:interchange:kanto:jr-east-shinjuku--keio-new-line-shinjuku',
      externalIds: {},
      names: {
        ja: '新宿（JR） ↔ 京王新線・都営新宿線 新宿',
        ja_kana: null,
        en: 'JR Shinjuku ↔ Keio New Line / Toei Shinjuku',
        zh: 'JR新宿 ↔ 京王新线·都营新宿线新宿',
      },
      provenance: {
        sourceIds: ['sk:source:kanto:manual-verified-tokyo-ref'],
        dataNature: 'manual-verified',
        lastVerifiedAt: '2026-11-28',
      },
      validFrom: '2024-04-01',
      validTo: null,
      fromStationId: 'sk:station:kanto:jr-east-shinjuku',
      toStationId: 'sk:station:kanto:keio-new-line-shinjuku',
      stationComplexId: 'sk:complex:kanto:shinjuku',
      gateType: 'out_of_gate',
      walkingMinutes: null,
      stepFree: null,
      notes: '京王新線・都営新宿線連絡地下通路経由。',
    },
    {
      id: 'sk:interchange:kanto:toei-oedo-shinjuku--keio-new-line-shinjuku',
      externalIds: {},
      names: {
        ja: '都営大江戸線 新宿 ↔ 京王新線・都営新宿線 新宿',
        ja_kana: null,
        en: 'Toei Oedo Shinjuku ↔ Keio New Line / Toei Shinjuku',
        zh: '都营大江户线新宿 ↔ 京王新线·都营新宿线新宿',
      },
      provenance: {
        sourceIds: ['sk:source:kanto:manual-verified-tokyo-ref'],
        dataNature: 'manual-verified',
        lastVerifiedAt: '2026-11-28',
      },
      validFrom: '2024-04-01',
      validTo: null,
      fromStationId: 'sk:station:kanto:toei-oedo-shinjuku',
      toStationId: 'sk:station:kanto:keio-new-line-shinjuku',
      stationComplexId: 'sk:complex:kanto:shinjuku',
      gateType: 'in_gate',
      walkingMinutes: null,
      stepFree: null,
      notes: '都営線改札内連絡通路（京王新線連絡口）。',
    },
  );

  const throughServices: ThroughService[] = rawAtlas.throughServices.map((ts) => ({
    id: parseLegacyLabId(ts.id, 'kanto', { entity: 'through' }) as SkId<'through'>,
    externalIds: ts.externalIds,
    names: toLocalizedNames(ts.names),
    provenance: mapProvenance(ts.provenance),
    validFrom: ts.validFrom ?? null,
    validTo: ts.validTo ?? null,
    boundaryStationId: mapStationId(ts.boundaryStationId),
    fromRailLineId: parseLegacyLabId(ts.fromRailLineId, 'kanto', {
      entity: 'line',
    }) as SkId<'line'>,
    toRailLineId: parseLegacyLabId(ts.toRailLineId, 'kanto', { entity: 'line' }) as SkId<'line'>,
    operatorIds: ts.operatorIds.map(
      (oid) => parseLegacyLabId(oid, 'jp', { entity: 'operator' }) as SkId<'operator'>,
    ),
    serviceDescription: ts.serviceDescription,
    notes: ts.notes,
  }));

  const unalignedRecords: UnalignedRecord[] = rawAtlas.unalignedRecords.map((rec) => ({
    sourceId: mapSourceId(rec.sourceId),
    externalId: rec.externalId,
    rawName: rec.rawName,
    operatorRaw: rec.operatorRaw,
    lineRaw: rec.lineRaw,
    coordinates: rec.coordinates,
    reasonCode: 'NOT_ON_LINE',
    reason: rec.reason,
  }));

  // Only register non-shareAlike sources in kantoTrackGraph.sources
  const sources: SourceRecord[] = rawAtlas.sources
    .filter((s) => s.shareAlike === false)
    .map((s) => ({
      id: mapSourceId(s.id),
      title: s.title,
      publisher: s.publisher,
      url: s.url,
      retrievedAt: s.retrievedAt,
      sourceDate: s.sourceDate ?? null,
      license: s.license,
      licenseUrl: s.licenseUrl ?? null,
      commercialUse: s.commercialUse,
      redistribution: s.redistribution,
      shareAlike: false,
      attributionText: s.attributionText,
      notes: s.notes,
    }));

  // Isolated ODbL vertical layer
  const odblSource: SourceRecord = {
    id: mapSourceId(rawVertical.source.id),
    title: rawVertical.source.title,
    publisher: rawVertical.source.publisher,
    url: rawVertical.source.url,
    retrievedAt: rawVertical.source.retrievedAt,
    sourceDate: rawVertical.source.sourceDate ?? null,
    license: rawVertical.source.license,
    licenseUrl: rawVertical.source.licenseUrl ?? null,
    commercialUse: rawVertical.source.commercialUse,
    redistribution: rawVertical.source.redistribution,
    shareAlike: true,
    attributionText: rawVertical.source.attributionText,
    notes: rawVertical.source.notes,
  };

  const verticalAttributes: TrackVerticalAttribute[] = [];
  for (const rec of rawVertical.records) {
    const mappedSegId = legacySegmentIdToV1Id.get(rec.trackSegmentId);
    if (mappedSegId === undefined) {
      continue;
    }
    verticalAttributes.push({
      trackSegmentId: mappedSegId,
      verticalClass: rec.verticalClass,
      verticalOrder: rec.verticalOrder,
      elevationM: rec.elevationM,
      provenance: mapProvenance(rec.provenance),
    });
  }

  const trackGraph: TrackGraph = {
    operators,
    lines,
    segments,
    stations,
    complexes,
    interchanges,
    sources,
  };

  const verticalLayer: TrackVerticalLayer = {
    attributes: verticalAttributes,
    sources: [odblSource],
  };

  process.stdout.write(
    `[kanto-preview] migrated ${operators.length} operators, ${lines.length} lines, ${stations.length} stations, ${segments.length} segments, ${complexes.length} complexes, ${verticalAttributes.length} ODbL vertical records\n`,
  );

  return {
    trackGraph,
    throughServices,
    unalignedRecords,
    verticalLayer,
  };
}
