import {
  allocatePlaceIds,
  createMigration,
  indexById,
  names,
  pointFootprint,
  requireEntry,
} from './common.mjs';
import { SHINJUKU } from './manifest.mjs';

const SCHEMATIC = 'src:senkiro-lab-schematic';

export function migrateShinjuku(raw, sourceRecords) {
  const m = createMigration(SHINJUKU, { ...raw, lines: raw.railLines }, sourceRecords, new Map());
  const levelId = (rawId) => m.legacy(rawId, 'level');
  const stopId = (facility, index) => `sk:landing:${m.slug(facility.id, 'link')}-stop-${index + 1}`;
  const legacyPlaces = [
    ...raw.areas.map((item) => item.id),
    ...raw.entrances.map((item) => item.id),
    ...raw.verticals.flatMap((facility) =>
      facility.stops.map((_, index) => stopId(facility, index)),
    ),
  ];
  const placeIds = allocatePlaceIds(legacyPlaces, SHINJUKU.scope, m.legacy);
  const placeId = (rawId) => requireEntry(placeIds, rawId);
  const levels = raw.levels.map((item) => ({
    ...m.base(item, levelId(item.id), [SCHEMATIC]),
    complexId: m.complexId,
    stationId: m.stationId(item.stationId),
    operatorId: m.operatorId(item.operatorId),
    label: item.label,
    ordinal: item.ordinal,
    elevation: item.elevation,
    elevationNote: item.elevationNote,
  }));
  const levelById = indexById(levels);
  const areas = raw.areas.map((item) => ({
    ...m.base(item, placeId(item.id), [SCHEMATIC]),
    complexId: m.complexId,
    levelId: levelId(item.levelId),
    stationId: m.stationId(item.stationId),
    kind: item.kind,
    fareZone: item.fareZone,
    manager: null,
    footprint: item.footprint,
    anchor: item.anchor,
    existence: item.existence,
    geometryConfidence: item.geometryConfidence,
    asOf: item.asOf,
    ...(item.tracks
      ? {
          tracks: item.tracks.map((track) => ({
            number: track.number,
            side: track.side ?? null,
            services: track.services.map((s) => ({
              railLineId: m.lineId(s.railLineId),
              towards: names({ ja: s.towardsJa, en: s.towardsEn }),
            })),
            ...(track.platformDoors ? { platformDoors: m.sourcedFact(track.platformDoors) } : {}),
          })),
        }
      : {}),
    ...(item.terminus ? { terminus: m.sourcedFact(item.terminus) } : {}),
  }));
  const areaById = indexById(areas);
  const area = (rawId) => requireEntry(areaById, placeId(rawId));
  const places = [...areas];
  const links = [];
  const connect = (item, rawId, kind, from, to, fields = {}, extraSources = [], notes = []) => {
    links.push({
      ...m.base(item, m.legacy(rawId, 'link'), extraSources, notes),
      complexId: m.complexId,
      kind,
      fromPlaceId: from.id,
      toPlaceId: to.id,
      direction: 'both',
      connection: item.connection ?? (item.existence === 'verified' ? 'verified' : 'inferred'),
      stepFree: item.stepFree ?? null,
      hasSteps: item.hasSteps ?? null,
      ...fields,
    });
  };

  for (const item of raw.passages) {
    connect(item, item.id, 'passage', area(item.fromAreaId), area(item.toAreaId));
  }
  for (const gate of raw.gates) {
    let [from, to] = gate.sides.map((side) => area(side.areaId));
    if (gate.direction === 'exit-only' && !from.fareZone.startsWith('paid:')) {
      [from, to] = [to, from];
    }
    if (
      gate.direction === 'exit-only' &&
      (!from.fareZone.startsWith('paid:') || to.fareZone !== 'unpaid')
    ) {
      throw new Error(`Exit-only gate does not connect paid to unpaid: ${gate.id}`);
    }
    connect(gate, gate.id, 'gate', from, to, {
      gateKind: gate.gateKind,
      position: gate.position,
      direction: gate.direction === 'exit-only' ? 'forward' : gate.direction,
      hoursNote: gate.hoursNote,
    });
  }
  for (const item of raw.entrances) {
    const host = area(item.areaId);
    const entrance = {
      ...m.base(item, placeId(item.id), [SCHEMATIC]),
      complexId: m.complexId,
      levelId: levelId(item.levelId),
      stationId: m.stationId(item.stationId),
      kind: 'entrance',
      fareZone: 'unpaid',
      manager: null,
      footprint: pointFootprint(item.position),
      anchor: item.position,
      existence: item.existence,
      geometryConfidence: item.geometryConfidence,
      asOf: item.asOf,
      leadsTo: names({ ja: item.leadsToJa, en: item.leadsToEn }),
    };
    places.push(entrance);
    connect(item, `sk:passage:entrance-${m.slug(item.id, 'place')}`, 'passage', entrance, host);
  }
  for (const facility of raw.verticals) {
    const slug = m.slug(facility.id, 'link');
    const stops = facility.stops.map((stop, index) => {
      const host = area(stop.areaId);
      const landing = {
        ...m.base(facility, placeId(stopId(facility, index)), [SCHEMATIC]),
        complexId: m.complexId,
        levelId: levelId(stop.levelId),
        stationId: host.stationId,
        kind: 'landing',
        fareZone: host.fareZone,
        manager: null,
        footprint: pointFootprint(stop.position),
        anchor: stop.position,
        existence: facility.existence,
        geometryConfidence: facility.geometryConfidence,
        asOf: facility.asOf,
      };
      places.push(landing);
      connect(facility, `sk:passage:landing-${slug}-${index + 1}`, 'passage', host, landing);
      return landing;
    });
    const kind = facility.verticalKind;
    const direction = facility.escalatorDirection;
    for (let index = 1; index < stops.length; index += 1) {
      let from = stops[index - 1];
      let to = stops[index];
      const isOneWay = direction?.direction === 'up' || direction?.direction === 'down';
      const goingUp =
        requireEntry(levelById, to.levelId).ordinal > requireEntry(levelById, from.levelId).ordinal;
      if (isOneWay && goingUp !== (direction.direction === 'up')) {
        [from, to] = [to, from];
      }
      const segment = stops.length === 2 ? facility.id : `sk:vertical:${slug}-${index}`;
      const declaredSpan = facility.declaredNonAdjacent ? [from.levelId, to.levelId] : null;
      connect(
        facility,
        segment,
        kind,
        from,
        to,
        {
          direction: isOneWay ? 'forward' : kind === 'escalator' ? 'unknown' : 'both',
          stepFree: kind === 'elevator',
          hasSteps: kind === 'stairs' ? true : kind === 'elevator' ? false : null,
          hoursNote: [facility.hoursNote, direction?.schedule].filter(Boolean).join(' · ') || null,
          declaredSpan,
        },
        direction?.sourceIds,
        [facility.declaredNonAdjacent?.reason, direction?.note, facility.directionNote],
      );
    }
  }
  return m.finish({ levels, places, links });
}
