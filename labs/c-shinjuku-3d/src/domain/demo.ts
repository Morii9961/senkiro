/**
 * Named routes used by the UI's "demo" buttons and by the tests.
 * Ids are plain strings so this file has no dependency on data/manual.
 */
import type { RouteMode } from './route';

export interface DemoRoute {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  mode: RouteMode;
  /** What the route is expected to show; checked by tests/unit/route.test.ts. */
  expectedLevelLabels: string[];
}

export const NODE = {
  eastExit: 'sk:entrance:jr-east-exit',
  eastGate: 'sk:gate:jr-east-gate',
  southGate: 'sk:gate:jr-south-gate',
  southExit: 'sk:entrance:jr-south-exit',
  platform13_14: 'sk:platform:jr-east-shinjuku-13-14',
  platform5_6: 'sk:platform:jr-east-shinjuku-5-6',
  keioPlatforms: 'sk:platform:keio-shinjuku-1-2',
} as const;

export const DEMO_ROUTES: DemoRoute[] = [
  {
    // Street-level East Exit → down to B1F → East Gate → up to the Yamanote Line island.
    id: 'east-exit-to-yamanote',
    fromNodeId: NODE.eastExit,
    toNodeId: NODE.platform13_14,
    mode: 'default',
    expectedLevelLabels: ['1F', 'B1F', '1F'],
  },
  {
    // The step-free way to the set-apart platforms 5–6, printed as a note on
    // the JR B1F map: B1F ⇔ Ⓖ ⇔ 2F ⇔ ⒶⒸ ⇔ ⒷⒹ ⇔ Ⓔ ⇔ 5,6番線.
    id: 'east-gate-to-5-6-step-free',
    fromNodeId: NODE.eastGate,
    toNodeId: NODE.platform5_6,
    mode: 'elevator-only',
    expectedLevelLabels: ['B1F', '1F', '2F', '1F', '2F', '1F'],
  },
  {
    // Across operators: JR South Exit → JR paid area → Keio transfer gate → Keio platforms.
    id: 'south-exit-to-keio',
    fromNodeId: NODE.southExit,
    toNodeId: NODE.keioPlatforms,
    mode: 'default',
    expectedLevelLabels: ['2F', '1F', 'B1F', 'B1F', 'B1F', 'B2F'],
  },
];

export const DEFAULT_DEMO_ROUTE = DEMO_ROUTES[0]!;
