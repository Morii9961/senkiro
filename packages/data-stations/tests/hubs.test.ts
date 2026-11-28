import type {
  FareZone,
  SkId,
  StationHubDataset,
  StationLink,
  StationRouteMode,
} from '@senkiro/contracts';
import {
  buildIndoorGraph,
  findStationRoutesFrom,
  validateStationHubDataset,
} from '@senkiro/station-3d';
import { describe, expect, it } from 'vitest';
import { shinjukuHub, shinjukuHubDataset, umedaHub, umedaHubDataset } from '../src/index.ts';

const KSJ = 'sk:source:jp:mlit-ksj-n02-24';

const hubs = [
  {
    dataset: umedaHubDataset,
    wrapper: umedaHub,
    north: 'z-',
    complexId: 'sk:complex:kansai:osaka-umeda',
    center: [135.49725, 34.70158],
    ward: '大阪市北区',
    points: [
      ['007068,007069', '007068', 135.494912, 34.702479],
      ['007065', '007065', 135.497685, 34.70313],
      ['007048,007049', '007048', 135.498332, 34.705578],
      ['007071', '007071', 135.497253, 34.701503],
      ['007074', '007074', 135.499825, 34.70056],
      ['007085', '007085', 135.497103, 34.69837],
      ['007080', '007080', 135.495645, 34.69944],
    ],
  },
  {
    dataset: shinjukuHubDataset,
    wrapper: shinjukuHub,
    north: 'x-',
    complexId: 'sk:complex:kanto:shinjuku',
    center: [139.70061, 35.69011],
    ward: '東京都新宿区',
    points: [
      ['003701,003693', '003700', 139.70061, 35.68976],
      ['003700', '003700', 139.69858, 35.68883],
      ['003683', '003700', 139.69965, 35.69136],
      ['003700,003708', '003700', 139.698615, 35.68843],
      ['003715', '003700', 139.69935, 35.687625],
      ['003648', '003648', 139.70004, 35.69605],
      ['003672', '003700', 139.70068, 35.69246],
      ['003684,003689', '003689', 139.70353, 35.69149],
      ['003687', '003689', 139.70558, 35.69054],
      ['003669', '003669', 139.69931, 35.6925],
    ],
  },
];

type Node = SkId<'place'>;

function allowed(link: StationLink, a: FareZone, b: FareZone, mode: StationRouteMode): boolean {
  if (a === 'roadway' || b === 'roadway') {
    return false;
  }
  if (a !== b) {
    if (link.kind !== 'gate') {
      return false;
    }
    if (
      a.startsWith('paid:') &&
      b.startsWith('paid:') &&
      (link.gateKind !== 'transfer' || link.connection !== 'verified')
    ) {
      return false;
    }
  }
  return (
    mode === 'standard' ||
    !(
      link.kind === 'stairs' ||
      link.kind === 'escalator' ||
      link.hasSteps === true ||
      link.stepFree === false
    )
  );
}

/** Independent reachability oracle using the portable dataset, not the engine's compiled edges. */
function referenceGraph(dataset: StationHubDataset, mode: StationRouteMode) {
  const zones = new Map(dataset.places.map((place) => [place.id, place.fareZone]));
  const outgoing = new Map<Node, Node[]>();
  const links = new Map(dataset.links.map((link) => [link.id, link]));
  const add = (from: Node, to: Node) => {
    const next = outgoing.get(from) ?? [];
    next.push(to);
    outgoing.set(from, next);
  };
  for (const link of dataset.links) {
    const a = zones.get(link.fromPlaceId);
    const b = zones.get(link.toPlaceId);
    if (!a || !b || !allowed(link, a, b, mode)) {
      continue;
    }
    add(link.fromPlaceId, link.toPlaceId);
    if (link.direction !== 'forward') {
      add(link.toPlaceId, link.fromPlaceId);
    }
  }
  return {
    reachable(origin: Node) {
      const seen = new Set<Node>();
      if (zones.get(origin) !== 'roadway') {
        seen.add(origin);
      }
      for (const node of seen) {
        for (const next of outgoing.get(node) ?? []) {
          seen.add(next);
        }
      }
      return seen;
    },
    traversable(id: SkId<'link'>, from: Node, to: Node) {
      const a = zones.get(from);
      const b = zones.get(to);
      const link = links.get(id);
      return (
        !!a &&
        !!b &&
        !!link &&
        allowed(link, a, b, mode) &&
        ((from === link.fromPlaceId && to === link.toPlaceId) ||
          (link.direction !== 'forward' && from === link.toPlaceId && to === link.fromPlaceId))
      );
    },
  };
}

describe.each(hubs)(
  '$complexId',
  ({ dataset, wrapper, north, complexId, center, ward, points }) => {
    it('meets the public v1.0 dataset contract and preserves every official KSJ point', () => {
      expect(validateStationHubDataset(dataset)).toEqual([]);
      expect(wrapper).toEqual({ dataset, planNorth: north });
      expect(dataset.complex).toMatchObject({
        id: complexId,
        coordinates: center,
        wardOrCity: ward,
      });
      expect(dataset.sources.find(({ id }) => id === KSJ)).toMatchObject({
        title: '国土数値情報 鉄道データ（N02・令和6年度 / 2024年版）',
        publisher: '国土交通省（MLIT）',
        retrievedAt: '2026-11-21',
        sourceDate: '2024',
        commercialUse: 'yes',
        redistribution: 'yes',
        shareAlike: false,
      });
      expect(dataset.stations).toHaveLength(points.length);
      expect(dataset.stations.map((station) => station.id).sort()).toEqual(
        [...dataset.complex.stationIds].sort(),
      );
      for (const [ksj, ksjGroup, longitude, latitude] of points) {
        expect(dataset.stations.find((station) => station.externalIds.ksj === ksj)).toMatchObject({
          coordinates: [longitude, latitude],
          externalIds: { ksj, ksjGroup },
        });
      }
      for (const entity of [dataset.complex, ...dataset.stations]) {
        expect(entity.provenance.sourceIds).toContain(KSJ);
      }
    });

    it.each(['standard', 'step_free'] as const)(
      'checks all ordered node pairs in %s mode',
      (mode) => {
        const graph = buildIndoorGraph(dataset);
        const reference = referenceGraph(dataset, mode);
        const standard = mode === 'step_free' ? referenceGraph(dataset, 'standard') : reference;
        let found = 0;
        let unreachable = 0;
        for (const origin of dataset.places) {
          const destinations = reference.reachable(origin.id);
          const standardDestinations = standard.reachable(origin.id);
          const routeTo = findStationRoutesFrom(graph, {
            complexId: dataset.complex.id,
            fromPlaceId: origin.id,
            mode,
          });
          for (const target of dataset.places) {
            const result = routeTo(target.id);
            const label = `${mode} ${origin.id} → ${target.id}`;
            if (result.reachable !== destinations.has(target.id) || result.mode !== mode) {
              throw new Error(`Reachability mismatch: ${label}`);
            }
            if (!result.reachable) {
              const reason = standardDestinations.has(target.id)
                ? 'step-free-unavailable'
                : 'unreachable';
              if (result.reason !== reason || result.steps.length !== 0) {
                throw new Error(`Invalid failure result: ${label}`);
              }
              unreachable += 1;
              continue;
            }
            let at = origin.id;
            for (const step of result.steps) {
              if (
                step.fromPlaceId !== at ||
                !reference.traversable(step.linkId, step.fromPlaceId, step.toPlaceId)
              ) {
                throw new Error(
                  `Discontinuous or forbidden route segment ${step.linkId}: ${label}`,
                );
              }
              at = step.toPlaceId;
            }
            if (
              at !== target.id ||
              result.distanceMeters !== null ||
              result.durationMinutes !== null
            ) {
              throw new Error(`Invalid arrival or fabricated measurements: ${label}`);
            }
            found += 1;
          }
        }
        expect(found + unreachable).toBe(dataset.places.length ** 2);
        expect(found).toBeGreaterThan(0);
        if (complexId === 'sk:complex:kansai:osaka-umeda' && mode === 'standard') {
          expect(unreachable).toBe(0);
        } else {
          expect(unreachable).toBeGreaterThan(0);
        }
      },
      20_000,
    );
  },
);

it('preserves Shinjuku exit-only gate orientation, landings and non-railway levels', () => {
  const data = shinjukuHubDataset;
  const places = new Map(data.places.map((place) => [place.id, place]));
  const graph = buildIndoorGraph(data);
  const gates = data.links.filter((link) => link.kind === 'gate' && link.direction === 'forward');
  expect(gates).toHaveLength(2);
  for (const gate of gates) {
    expect(places.get(gate.fromPlaceId)?.fareZone.startsWith('paid:')).toBe(true);
    expect(places.get(gate.toPlaceId)?.fareZone).toBe('unpaid');
    expect(graph.outgoing.get(gate.toPlaceId)?.some((edge) => edge.link.id === gate.id)).toBe(
      false,
    );
  }
  const lift = data.links.filter((link) => link.id.startsWith('sk:link:shinjuku:jr-elevator-g-'));
  expect(lift).toHaveLength(2);
  for (const segment of lift) {
    expect(places.get(segment.fromPlaceId)?.kind).toBe('landing');
    expect(places.get(segment.toPlaceId)?.kind).toBe('landing');
  }
  for (const id of ['busta-shinjuku-4f', 'public-b1f']) {
    expect(
      data.levels.find((level) => level.id === `sk:level:shinjuku:${id}`)?.operatorId,
    ).toBeNull();
  }
});

it('keeps Umeda services sourced and disambiguates gates and elevators sharing a Lab slug', () => {
  const data = umedaHubDataset;
  const collidingLinks = data.links.filter(
    (link) =>
      link.id === 'sk:link:umeda:higashi-2-gate' || link.id === 'sk:link:umeda:higashi-2-elevator',
  );
  expect(collidingLinks.map((link) => link.kind).sort()).toEqual(['elevator', 'gate']);
  const platform = data.places.find((place) => place.id === 'sk:place:umeda:jr-1-2');
  expect(platform?.fareZone).toBe('paid:jr-west');
  expect(platform?.tracks?.map(({ number }) => number)).toEqual(['1', '2']);
  expect(platform?.tracks?.find(({ number }) => number === '2')?.services).toEqual([
    {
      railLineId: 'sk:line:kansai:jr-west-loop',
      towards: {
        ja: '京橋・鶴橋方面',
        ja_kana: null,
        en: 'Toward Kyobashi and Tsuruhashi',
        zh: '往京桥、鹤桥',
      },
    },
  ]);
});
