import type {
  Interchange,
  LineClass,
  LonLat,
  RailLine,
  SkId,
  Station,
  StationComplex,
  TrackGraph,
  TrackSegment,
} from '@senkiro/contracts';
import {
  alignKsjStationsToTargets,
  extractLineTopologyFromKsj,
  KANSAI_BBOX,
  readKsjN02Archive,
  resolveKsjZipPath,
  splitJrWestTokaidoSanyoLine,
} from '@senkiro/data-pipeline';
import {
  type CanonicalStationTarget,
  haversineMeters,
  normalizeStationNameJa,
  type UnalignedRecord,
} from '@senkiro/domain-core';
import {
  KANSAI_COMPLEX_SPECS,
  KANSAI_DATA_VERIFIED_AT,
  KANSAI_LINE_SPECS,
  KANSAI_OPERATOR_SPECS,
  KANSAI_OPERATORS,
  KANSAI_PROVENANCE_KSJ,
  KANSAI_PROVENANCE_MANUAL,
  KANSAI_SOURCES,
  KANSAI_STATION_OVERRIDES,
  KANSAI_THROUGH_SERVICES,
} from '../src/kansai/catalog.ts';

export interface KansaiBuildOutput {
  trackGraph: TrackGraph;
  throughServices: typeof KANSAI_THROUGH_SERVICES;
  unalignedRecords: UnalignedRecord[];
}

function stableSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function computeCentroid(coords: readonly LonLat[]): LonLat {
  if (coords.length === 0) {
    return [135.5, 34.7];
  }
  let sumLon = 0;
  let sumLat = 0;
  for (const [lon, lat] of coords) {
    sumLon += lon;
    sumLat += lat;
  }
  return [
    Math.round((sumLon / coords.length) * 1e5) / 1e5,
    Math.round((sumLat / coords.length) * 1e5) / 1e5,
  ];
}

export function buildKansaiDataset(): KansaiBuildOutput {
  const opSpecByKsjName = new Map(KANSAI_OPERATOR_SPECS.map((op) => [op.ksjName, op]));
  const targetKsjOperators = new Set(KANSAI_OPERATOR_SPECS.map((op) => op.ksjName));

  const archive = readKsjN02Archive(resolveKsjZipPath(), {
    bbox: KANSAI_BBOX,
    operators: targetKsjOperators,
  });

  const lineSpecByKsjKey = new Map<string, (typeof KANSAI_LINE_SPECS)[number]>();
  for (const line of KANSAI_LINE_SPECS) {
    if (line.ksjLineName !== null) {
      const opSpec = KANSAI_OPERATOR_SPECS.find((op) => op.id === line.operatorId);
      if (opSpec !== undefined) {
        lineSpecByKsjKey.set(`${opSpec.ksjName}::${line.ksjLineName}`, line);
      }
    }
  }

  const targetKeys = new Set<string>(lineSpecByKsjKey.keys());
  targetKeys.add('西日本旅客鉄道::東海道線');
  targetKeys.add('西日本旅客鉄道::山陽線');

  const stationsByKey = new Map<string, typeof archive.stations>();
  for (const f of archive.stations) {
    const key = `${f.operatorName}::${f.lineName}`;
    const list = stationsByKey.get(key);
    if (list === undefined) {
      stationsByKey.set(key, [f]);
    } else {
      list.push(f);
    }
  }

  const sectionsByKey = new Map<string, typeof archive.sections>();
  for (const f of archive.sections) {
    const key = `${f.operatorName}::${f.lineName}`;
    const list = sectionsByKey.get(key);
    if (list === undefined) {
      sectionsByKey.set(key, [f]);
    } else {
      list.push(f);
    }
  }

  const stationsById = new Map<SkId<'station'>, Station>();
  const stationIdsByOperator = new Map<SkId<'operator'>, Station[]>();
  const usedStationSlugs = new Set<string>();

  const registerStation = (station: Station): void => {
    stationsById.set(station.id, station);
    const list = stationIdsByOperator.get(station.operatorId);
    if (list === undefined) {
      stationIdsByOperator.set(station.operatorId, [station]);
    } else {
      list.push(station);
    }
  };

  const resolveOrCreateStation = (
    operatorId: SkId<'operator'>,
    opSlugPrefix: string,
    rawName: string,
    normalizedName: string,
    codes: readonly string[],
    groupCodes: readonly string[],
    coord: LonLat,
  ): Station => {
    for (const ov of KANSAI_STATION_OVERRIDES) {
      if (ov.operatorId !== operatorId) {
        continue;
      }
      const nameMatches = ov.ksjNames.some((n) => normalizeStationNameJa(n) === normalizedName);
      if (!nameMatches) {
        continue;
      }
      if (ov.ksjCodes !== undefined && !ov.ksjCodes.some((c) => codes.includes(c))) {
        continue;
      }
      if (ov.nearCoord !== undefined && haversineMeters(coord, ov.nearCoord) > 650) {
        continue;
      }

      const existing = stationsById.get(ov.stationId);
      if (existing !== undefined) {
        const mergedKsj = new Set([
          ...(existing.externalIds.ksj?.split(',').filter(Boolean) ?? []),
          ...codes,
        ]);
        if (mergedKsj.size > 0) {
          existing.externalIds.ksj = [...mergedKsj].sort().join(',');
        }
        return existing;
      }

      const created: Station = {
        id: ov.stationId,
        externalIds: {
          ...(codes.length > 0 ? { ksj: [...codes].sort().join(',') } : {}),
          ...(groupCodes[0] !== undefined ? { ksjGroup: groupCodes[0] } : {}),
        },
        names: ov.names,
        provenance: KANSAI_PROVENANCE_KSJ,
        validFrom: null,
        validTo: null,
        operatorId,
        railLineIds: [],
        stationComplexId: null,
        stationCode: ov.stationCode ?? null,
        coordinates: ov.coordinatesOverride ?? coord,
        municipalityCode: null,
        wardOrCity: ov.wardOrCity ?? null,
        fareZoneTags: [],
      };
      usedStationSlugs.add(ov.stationId);
      registerStation(created);
      return created;
    }

    // Same-operator spatial merge within 650m for matching normalized Japanese names
    const pool = stationIdsByOperator.get(operatorId) ?? [];
    for (const candidate of pool) {
      if (
        normalizeStationNameJa(candidate.names.ja ?? '') === normalizedName &&
        haversineMeters(candidate.coordinates, coord) <= 650
      ) {
        const mergedKsj = new Set([
          ...(candidate.externalIds.ksj?.split(',').filter(Boolean) ?? []),
          ...codes,
        ]);
        if (mergedKsj.size > 0) {
          candidate.externalIds.ksj = [...mergedKsj].sort().join(',');
        }
        return candidate;
      }
    }

    const baseToken = stableSlug(
      groupCodes[0] ?? codes[0] ?? `${Math.round(coord[0] * 1e4)}-${Math.round(coord[1] * 1e4)}`,
    );
    let stationId: SkId<'station'> = `sk:station:kansai:${opSlugPrefix}-ksj-${baseToken}`;
    let counter = 2;
    while (usedStationSlugs.has(stationId)) {
      stationId = `sk:station:kansai:${opSlugPrefix}-ksj-${baseToken}-${counter}`;
      counter += 1;
    }
    usedStationSlugs.add(stationId);

    const created: Station = {
      id: stationId,
      externalIds: {
        ...(codes.length > 0 ? { ksj: [...codes].sort().join(',') } : {}),
        ...(groupCodes[0] !== undefined ? { ksjGroup: groupCodes[0] } : {}),
      },
      names: { ja: rawName, ja_kana: null, en: null, zh: null },
      provenance: KANSAI_PROVENANCE_KSJ,
      validFrom: null,
      validTo: null,
      operatorId,
      railLineIds: [],
      stationComplexId: null,
      stationCode: null,
      coordinates: coord,
      municipalityCode: null,
      wardOrCity: null,
      fareZoneTags: [],
    };
    registerStation(created);
    return created;
  };

  const tokaidoRawSegments: TrackSegment[] = [];
  const sanyoRawSegments: TrackSegment[] = [];
  const regularSegments: TrackSegment[] = [];

  for (const key of [...targetKeys].sort()) {
    const stFeats = stationsByKey.get(key) ?? [];
    const secFeats = sectionsByKey.get(key) ?? [];
    if (stFeats.length === 0) {
      continue;
    }
    const [opKsj = '', lineKsj = ''] = key.split('::');
    const opSpec = opSpecByKsjName.get(opKsj);
    if (opSpec === undefined) {
      continue;
    }

    const topo = extractLineTopologyFromKsj(stFeats, secFeats);
    const nodeKeyToStation = new Map<string, Station>();
    for (const node of topo.stations) {
      const station = resolveOrCreateStation(
        opSpec.id,
        opSpec.slugPrefix,
        node.stationName,
        node.normalizedName,
        node.stationCodes,
        node.groupCodes,
        node.coordinates,
      );
      nodeKeyToStation.set(node.key, station);
    }

    const lineSpec = lineSpecByKsjKey.get(key);
    const provisionalLineId: SkId<'line'> =
      lineSpec?.id ??
      (lineKsj === '東海道線' ? 'sk:line:kansai:jr-west-kyoto' : 'sk:line:kansai:jr-west-kobe');
    const lineClass: LineClass = lineSpec?.lineClass ?? 'trunk';
    const isShinkansen = lineClass === 'shinkansen';

    const seenPairs = new Set<string>();
    for (const edge of topo.segments) {
      const stA = nodeKeyToStation.get(edge.fromKey);
      const stB = nodeKeyToStation.get(edge.toKey);
      if (stA === undefined || stB === undefined || stA.id === stB.id) {
        continue;
      }
      const pairKey =
        stA.id < stB.id
          ? `${provisionalLineId}::${stA.id}::${stB.id}`
          : `${provisionalLineId}::${stB.id}::${stA.id}`;
      if (seenPairs.has(pairKey)) {
        continue;
      }
      seenPairs.add(pairKey);

      const segSlug = stableSlug(
        `${provisionalLineId.replace('sk:line:kansai:', '')}--${stA.id.replace('sk:station:kansai:', '')}--${stB.id.replace('sk:station:kansai:', '')}`,
      );
      const seg: TrackSegment = {
        id: `sk:segment:kansai:${segSlug}`,
        externalIds: { ksj: key },
        names: {
          ja: `${stA.names.ja ?? ''} — ${stB.names.ja ?? ''}`,
          ja_kana: null,
          en:
            stA.names.en !== null && stB.names.en !== null
              ? `${stA.names.en} – ${stB.names.en}`
              : null,
          zh:
            stA.names.zh !== null && stB.names.zh !== null
              ? `${stA.names.zh} — ${stB.names.zh}`
              : null,
        },
        provenance: KANSAI_PROVENANCE_KSJ,
        validFrom: null,
        validTo: null,
        fromStationId: stA.id,
        toStationId: stB.id,
        railLineIds: [provisionalLineId],
        operatorId: opSpec.id,
        geometry: edge.geometry,
        operatingKm: null,
        distanceNature: 'unknown',
        lineClass,
        isShinkansen,
        parallelConventionalLineId: null,
        fareZoneTags: ['tariff:keihanshin'],
      };

      if (key === '西日本旅客鉄道::東海道線') {
        tokaidoRawSegments.push(seg);
      } else if (key === '西日本旅客鉄道::山陽線') {
        sanyoRawSegments.push(seg);
      } else {
        regularSegments.push(seg);
      }
    }
  }

  // Deterministic split for JR West 東海道線 + 山陽線
  const splitJrSegments = splitJrWestTokaidoSanyoLine(tokaidoRawSegments, sanyoRawSegments, {
    maibaraStationId: 'sk:station:kansai:jr-west-maibara',
    kyotoStationId: 'sk:station:kansai:jr-west-kyoto',
    osakaStationId: 'sk:station:kansai:jr-west-osaka',
    kobeStationId: 'sk:station:kansai:jr-west-kobe',
    himejiStationId: 'sk:station:kansai:jr-west-himeji',
    biwakoLineId: 'sk:line:kansai:jr-west-biwako',
    kyotoLineId: 'sk:line:kansai:jr-west-kyoto',
    kobeLineId: 'sk:line:kansai:jr-west-kobe',
  }).map((seg) => {
    const newLineId = seg.railLineIds[0] ?? 'sk:line:kansai:jr-west-kobe';
    const lineSlug = newLineId.replace('sk:line:kansai:', '');
    const fromSlug = seg.fromStationId.replace('sk:station:kansai:', '');
    const toSlug = seg.toStationId.replace('sk:station:kansai:', '');
    return {
      ...seg,
      id: `sk:segment:kansai:${stableSlug(`${lineSlug}--${fromSlug}--${toSlug}`)}` as SkId<'segment'>,
    };
  });

  // Bridge Hankyu Kyoto Line between 大阪梅田 and 十三 (in KSJ, Kyoto Line starts at 十三)
  const hankyuBridgeSeg = regularSegments.find(
    (s) =>
      (s.railLineIds.includes('sk:line:kansai:hankyu-takarazuka') ||
        s.railLineIds.includes('sk:line:kansai:hankyu-kobe')) &&
      ((s.fromStationId === 'sk:station:kansai:hankyu-osaka-umeda' &&
        s.toStationId === 'sk:station:kansai:hankyu-juso') ||
        (s.toStationId === 'sk:station:kansai:hankyu-osaka-umeda' &&
          s.fromStationId === 'sk:station:kansai:hankyu-juso')),
  );
  const hankyuUmeda = stationsById.get('sk:station:kansai:hankyu-osaka-umeda');
  const hankyuJuso = stationsById.get('sk:station:kansai:hankyu-juso');
  if (hankyuUmeda !== undefined && hankyuJuso !== undefined) {
    regularSegments.push({
      id: 'sk:segment:kansai:hankyu-kyoto--hankyu-osaka-umeda--hankyu-juso',
      externalIds: { ksj: '阪急電鉄::京都線(梅田乗り入れ)' },
      names: {
        ja: '大阪梅田 — 十三',
        ja_kana: null,
        en: 'Osaka-umeda – Juso',
        zh: '大阪梅田 — 十三',
      },
      provenance: KANSAI_PROVENANCE_KSJ,
      validFrom: null,
      validTo: null,
      fromStationId: hankyuUmeda.id,
      toStationId: hankyuJuso.id,
      railLineIds: ['sk:line:kansai:hankyu-kyoto'],
      operatorId: 'sk:operator:jp:hankyu',
      geometry: hankyuBridgeSeg?.geometry ?? [hankyuUmeda.coordinates, hankyuJuso.coordinates],
      operatingKm: null,
      distanceNature: 'unknown',
      lineClass: 'private',
      isShinkansen: false,
      parallelConventionalLineId: null,
      fareZoneTags: ['tariff:keihanshin'],
    });
  }

  // Bridge JR West Kyoto Line / Kobe Line / Takarazuka / Tozai / Osaka Higashi connections if needed;
  // Combine all segments and deduplicate by segment ID
  const segmentsById = new Map<SkId<'segment'>, TrackSegment>();
  for (const seg of [...regularSegments, ...splitJrSegments]) {
    if (!segmentsById.has(seg.id)) {
      segmentsById.set(seg.id, seg);
    }
  }
  const allSegments = [...segmentsById.values()].sort((a, b) => a.id.localeCompare(b.id));

  // Prune any orphan stations that ended up with no segments (e.g. trimmed Sanyo stops west of Himeji)
  // while keeping any station explicitly referenced by complexes or overrides
  const referencedStationIds = new Set<SkId<'station'>>();
  for (const seg of allSegments) {
    referencedStationIds.add(seg.fromStationId);
    referencedStationIds.add(seg.toStationId);
  }
  for (const cx of KANSAI_COMPLEX_SPECS) {
    for (const sid of cx.stationIds) {
      referencedStationIds.add(sid);
    }
  }

  const activeStations = [...stationsById.values()]
    .filter((s) => referencedStationIds.has(s.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const activeStationMap = new Map(activeStations.map((s) => [s.id, s]));

  // Populate station.railLineIds and line.stationIds from segments
  const stationLineSets = new Map<SkId<'station'>, Set<SkId<'line'>>>();
  const lineStationSets = new Map<SkId<'line'>, Set<SkId<'station'>>>();
  for (const st of activeStations) {
    stationLineSets.set(st.id, new Set());
  }
  for (const line of KANSAI_LINE_SPECS) {
    lineStationSets.set(line.id, new Set());
  }

  for (const seg of allSegments) {
    for (const lineId of seg.railLineIds) {
      stationLineSets.get(seg.fromStationId)?.add(lineId);
      stationLineSets.get(seg.toStationId)?.add(lineId);
      lineStationSets.get(lineId)?.add(seg.fromStationId);
      lineStationSets.get(lineId)?.add(seg.toStationId);
    }
  }

  // Service annotation line jr-west-tokaido-express covers Osaka and Kyoto hubs
  for (const hubId of [
    'sk:station:kansai:jr-west-osaka' as const,
    'sk:station:kansai:jr-west-kyoto' as const,
  ]) {
    if (activeStationMap.has(hubId)) {
      stationLineSets.get(hubId)?.add('sk:line:kansai:jr-west-tokaido-express');
      lineStationSets.get('sk:line:kansai:jr-west-tokaido-express')?.add(hubId);
    }
  }

  for (const st of activeStations) {
    st.railLineIds = [...(stationLineSets.get(st.id) ?? [])].sort();
  }

  const lines: RailLine[] = KANSAI_LINE_SPECS.map((spec) => ({
    id: spec.id,
    externalIds: spec.ksjLineName === null ? {} : { ksj: spec.ksjLineName },
    names: spec.names,
    provenance: spec.ksjLineName === null ? KANSAI_PROVENANCE_MANUAL : KANSAI_PROVENANCE_KSJ,
    validFrom: null,
    validTo: null,
    operatorId: spec.operatorId,
    color: spec.color,
    stationCodePrefix: spec.stationCodePrefix,
    lineClass: spec.lineClass,
    stationIds: [...(lineStationSets.get(spec.id) ?? [])].sort(),
    coverageStatus: spec.id === 'sk:line:kansai:jr-west-tokaido-express' ? 'partial' : 'full',
  }));

  // Build StationComplexes and Interchanges
  const complexes: StationComplex[] = [];
  const interchanges: Interchange[] = [];
  for (const cxSpec of KANSAI_COMPLEX_SPECS) {
    const memberCoords: LonLat[] = [];
    for (const sid of cxSpec.stationIds) {
      const st = activeStationMap.get(sid);
      if (st === undefined) {
        throw new Error(`Missing complex member station ${sid} for ${cxSpec.id}`);
      }
      st.stationComplexId = cxSpec.id;
      memberCoords.push(st.coordinates);
    }
    complexes.push({
      id: cxSpec.id,
      externalIds: {},
      names: cxSpec.names,
      provenance: KANSAI_PROVENANCE_MANUAL,
      validFrom: null,
      validTo: null,
      stationIds: [...cxSpec.stationIds],
      coordinates: cxSpec.coordinates ?? computeCentroid(memberCoords),
      wardOrCity: cxSpec.wardOrCity,
      explicitlyExcluded: [...cxSpec.explicitlyExcluded],
    });

    for (const ic of cxSpec.interchanges) {
      const fromSlug = ic.fromStationId.replace('sk:station:kansai:', '');
      const toSlug = ic.toStationId.replace('sk:station:kansai:', '');
      interchanges.push({
        id: `sk:interchange:kansai:${fromSlug}--${toSlug}`,
        externalIds: {},
        names: {
          ja: `${activeStationMap.get(ic.fromStationId)?.names.ja ?? ''} ↔ ${activeStationMap.get(ic.toStationId)?.names.ja ?? ''}`,
          ja_kana: null,
          en: `${activeStationMap.get(ic.fromStationId)?.names.en ?? ''} ↔ ${activeStationMap.get(ic.toStationId)?.names.en ?? ''}`,
          zh: `${activeStationMap.get(ic.fromStationId)?.names.zh ?? ''} ↔ ${activeStationMap.get(ic.toStationId)?.names.zh ?? ''}`,
        },
        provenance: KANSAI_PROVENANCE_MANUAL,
        validFrom: null,
        validTo: null,
        fromStationId: ic.fromStationId,
        toStationId: ic.toStationId,
        stationComplexId: cxSpec.id,
        gateType: ic.gateType,
        walkingMinutes: null,
        stepFree: null,
        notes: ic.notes,
      });
    }
  }

  // Run @senkiro/domain-core 650m alignment across ALL Kansai-bbox KSJ station features
  // so out-of-scope lines (cable cars, edge lines, trimmed Sanyo west stops) are explicitly
  // retained in unalignedRecords rather than silently dropped.
  const targets: CanonicalStationTarget[] = activeStations.map((st) => ({
    stationId: st.id,
    operatorId: st.operatorId,
    railLineIds: st.railLineIds,
    canonicalJaName: st.names.ja ?? '',
    coordinates: st.coordinates,
  }));

  const operatorAliases: Record<string, SkId<'operator'>> = {};
  for (const op of KANSAI_OPERATOR_SPECS) {
    operatorAliases[op.ksjName] = op.id;
  }

  const lineAliases: Record<string, SkId<'line'>> = {};
  for (const [ksjKey, spec] of lineSpecByKsjKey.entries()) {
    const lineName = ksjKey.split('::')[1];
    if (lineName !== undefined && lineAliases[lineName] === undefined) {
      lineAliases[lineName] = spec.id;
    }
  }
  // Explicitly leave 東海道線 / 山陽線 unpinned in lineAliases because they split across 3 lines,
  // and let out-of-scope lines (like 鋼索線, 加古川線, 姫新線) fail line pinning or name match honestly.
  const alignment = alignKsjStationsToTargets(archive.stations, targets, {
    sourceId: 'sk:source:jp:mlit-ksj-n02-24',
    operatorAliases,
    lineAliases,
  });

  // Also record any KSJ features on non-target lines whose name happens to exist on a target line
  // (e.g. 加古川線 at 加古川) as explicit unaligned disclosure entries
  const unalignedMap = new Map<string, UnalignedRecord>();
  for (const rec of alignment.unaligned) {
    unalignedMap.set(`${rec.externalId}::${rec.lineRaw}`, rec);
  }
  for (const [idx, feat] of archive.stations.entries()) {
    const key = `${feat.operatorName}::${feat.lineName}`;
    if (!targetKeys.has(key)) {
      const extId = feat.stationCode.length > 0 ? `ksj:${feat.stationCode}` : `ksj-idx:${idx}`;
      const mapKey = `${extId}::${feat.lineName}`;
      if (!unalignedMap.has(mapKey)) {
        unalignedMap.set(mapKey, {
          sourceId: 'sk:source:jp:mlit-ksj-n02-24',
          externalId: extId,
          rawName: feat.stationName,
          operatorRaw: feat.operatorName,
          lineRaw: feat.lineName,
          coordinates: feat.midpoint,
          reasonCode: 'NOT_ON_LINE',
          reason: `Line "${feat.operatorName} ${feat.lineName}" is outside the frozen 63-line Kansai Phase 1 scope (explicitly retained, not dropped).`,
        });
      }
    }
  }

  const lineByIdMap = new Map(lines.map((l) => [l.id, l]));
  for (const seg of allSegments) {
    for (const lid of seg.railLineIds) {
      if (!lineByIdMap.has(lid)) {
        throw new Error(`Segment ${seg.id} references unknown line ${lid}`);
      }
    }
  }

  const trackGraph: TrackGraph = {
    operators: KANSAI_OPERATORS,
    lines,
    segments: allSegments,
    stations: activeStations,
    complexes,
    interchanges,
    sources: [...KANSAI_SOURCES],
  };

  process.stdout.write(
    `[kansai] built ${trackGraph.operators.length} operators, ${trackGraph.lines.length} lines, ${trackGraph.stations.length} stations, ${trackGraph.segments.length} segments, ${trackGraph.complexes.length} complexes, ${trackGraph.interchanges.length} interchanges, ${unalignedMap.size} unaligned (verified ${KANSAI_DATA_VERIFIED_AT})\n`,
  );

  return {
    trackGraph,
    throughServices: KANSAI_THROUGH_SERVICES,
    unalignedRecords: [...unalignedMap.values()],
  };
}
