import {
  allocatePlaceIds,
  axisSide,
  createMigration,
  indexById,
  names,
  requireEntry,
} from './common.mjs';
import { UMEDA } from './manifest.mjs';

const SCHEMATIC = {
  id: 'sk:source:umeda:senkiro-lab-schematic',
  title: 'SENKIRO Lab B schematic station layout',
  publisher: 'SENKIRO Lab',
  url: null,
  retrievedAt: '2026-11-21',
  sourceDate: null,
  license: 'AGPL-3.0-only',
  licenseUrl: null,
  commercialUse: 'yes',
  redistribution: 'yes',
  shareAlike: true,
  attributionText: 'SENKIRO Lab · Umeda Station 3D',
  notes:
    'Schematic footprints and model elevations, from lab/b-umeda-3d. Scale and heights are illustrative.',
};

function trackAssignments(place, services, lineId) {
  const { label, trackSides } = place.boarding;
  const numbers = label.split('・');
  const placeSlug = place.id.split(':')[2];
  const stem = placeSlug.replace(/-\d+(?:-\d+)*$/, '');
  const groupPrefix = `${stem}-${numbers.join('-')}-`;
  const longAxis = place.size[0] >= place.size[1] ? 'x' : 'z';
  const sideAxis = longAxis === 'x' ? 'z' : 'x';
  const tracks = new Map(
    numbers.map((number, index) => [
      number,
      {
        number,
        side: trackSides[index] ? axisSide(sideAxis, trackSides[index]) : null,
        services: [],
      },
    ]),
  );
  const add = (number, rawLineId, towards) => {
    const track = tracks.get(number) ?? { number, side: null, services: [] };
    const service = { railLineId: lineId(rawLineId), towards: names(towards) };
    if (!track.services.some((entry) => JSON.stringify(entry) === JSON.stringify(service))) {
      track.services.push(service);
    }
    tracks.set(number, track);
  };
  for (const service of services) {
    for (const dir of service.directions.length ? service.directions : [null]) {
      let number = String(service.track ?? label);
      if (service.track === null && numbers.length > 1 && dir) {
        const directionSlug = dir.id.split(':')[2];
        if (!directionSlug.startsWith(groupPrefix)) {
          // Lab B distinguishes single-track and paired assignments in its authored direction IDs.
          number = numbers.find((n) => directionSlug.startsWith(`${stem}-${n}-`)) ?? label;
        }
      }
      add(number, service.lineId, dir?.towards);
    }
  }
  for (const rawLineId of place.serviceLineIds ?? []) {
    if (!services.some((service) => service.lineId === rawLineId)) {
      add(label, rawLineId);
    }
  }
  return [...tracks.values()];
}

export function migrateUmeda(raw, serviceRows, exitRows, lineStyles, sourceRecords) {
  const m = createMigration(
    UMEDA,
    raw,
    [...sourceRecords, SCHEMATIC],
    new Map(lineStyles.map((row) => [row.lineId, row])),
  );
  const source = SCHEMATIC.id;
  const levelId = (rawId) => m.legacy(rawId, 'level');
  const placeIds = allocatePlaceIds(
    raw.places.map((item) => item.id),
    UMEDA.scope,
    m.legacy,
  );
  const placeId = (rawId) => requireEntry(placeIds, rawId);
  const levels = raw.levels.map((item) => ({
    ...m.base(item, levelId(item.id), [source]),
    complexId: m.complexId,
    stationId: m.stationId(item.stationId),
    operatorId: item.stationId
      ? m.operatorId(requireEntry(m.stationsById, item.stationId).operatorId)
      : null,
    label: item.label,
    ordinal: item.ordinal,
    elevation: item.ordinal * 5,
    elevationNote: 'Schematic vertical spacing from the Lab B single-stack view.',
  }));
  const exits = new Map(exitRows.map((row) => [row.placeId, row]));
  const places = raw.places.map((item) => {
    const [x, z] = item.point;
    const [width, depth] = item.size;
    const station = item.stationId === null ? null : requireEntry(m.stationsById, item.stationId);
    if (item.zone === 'paid' && station === null) {
      throw new Error(`Paid place has no station owner: ${item.id}`);
    }
    const fareZone =
      item.zone === 'paid' ? `paid:${m.slug(station.operatorId, 'operator')}` : item.zone;
    const kind = item.kind.toLowerCase();
    const services = serviceRows.filter((row) => row.platformId === item.id);
    const exit = exits.get(item.id);
    const extraSources = [
      source,
      ...(exit?.provenance.sourceIds ?? []),
      ...services.flatMap((s) => s.provenance.sourceIds),
    ];
    const base = m.base(item, placeId(item.id), extraSources);
    const tracks = item.boarding ? trackAssignments(item, services, m.lineId) : undefined;
    const terminus = item.boarding?.terminalEnd
      ? m.sourcedFact({
          end: axisSide(width >= depth ? 'x' : 'z', item.boarding.terminalEnd),
          sourceIds: item.provenance.sourceIds,
          note: 'End follows the Lab B schematic platform orientation.',
        })
      : undefined;
    return {
      ...base,
      names: exit ? names({ ...base.names, ...exit.exitLabel }) : base.names,
      complexId: m.complexId,
      levelId: levelId(item.levelId),
      stationId: m.stationId(item.stationId),
      kind,
      fareZone,
      manager: item.manager,
      anchor: { x, z },
      footprint: [{ x0: x - width / 2, z0: z - depth / 2, x1: x + width / 2, z1: z + depth / 2 }],
      existence: 'verified',
      geometryConfidence: item.geometry_confidence,
      asOf: null,
      ...(tracks ? { tracks } : {}),
      ...(terminus ? { terminus } : {}),
      ...(exit?.surfaceNote ? { leadsTo: names(exit.surfaceNote) } : {}),
    };
  });

  const byId = indexById(places);
  const linkIds = new Set();
  const links = raw.links.map((item) => {
    const kind = item.kind.toLowerCase();
    const from = requireEntry(byId, placeId(item.from));
    const to = requireEntry(byId, placeId(item.to));
    const normalized = m.legacy(item.id, 'link');
    // A Lab gate and lift can share their slug (the Higashi-Umeda gate/lift pair).
    const id = raw.links.some(
      (other) => other.id !== item.id && m.legacy(other.id, 'link') === normalized,
    )
      ? m.legacy(`sk:link:${m.slug(item.id, 'link')}-${kind}`, 'link')
      : normalized;
    if (linkIds.has(id)) {
      throw new Error(`Duplicate Umeda link after ID allocation: ${id}`);
    }
    linkIds.add(id);
    return {
      ...m.base(item, id),
      complexId: m.complexId,
      kind,
      fromPlaceId: from.id,
      toPlaceId: to.id,
      direction: item.direction,
      connection: item.connection,
      stepFree: item.stepFree,
      hasSteps: kind === 'stairs' ? true : item.stepFree === true ? false : null,
      declaredSpan: item.declaredSpan?.map(levelId) ?? null,
      ...(kind === 'gate' ? { gateKind: 'ticket' } : {}),
    };
  });

  return m.finish({ levels, places, links });
}
