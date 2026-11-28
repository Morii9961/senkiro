/**
 * `@senkiro/domain-core` — region-neutral domain kernel migrated from Lab A and generalised:
 *
 * - three strictly separated graphs: {@link TrackGraphIndex}, {@link ServiceGraphIndex},
 *   {@link FareRuleGraph};
 * - the 650 m cross-source alignment guard with explicit unaligned records;
 * - the schematic C0 elevation solver with vertical crossing deconfliction.
 *
 * Pure TypeScript with no DOM, React, Three.js or Node APIs, so it runs unchanged in the
 * browser, Web Workers, Node and Hermes.
 */
export * from './alignment.ts';
export * from './elevation-solver.ts';
export * from './fare-rule-graph.ts';
export * from './geo/projection.ts';
export * from './service-graph.ts';
export * from './track-graph.ts';
