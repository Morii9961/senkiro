/**
 * `@senkiro/station-3d` — SENKIRO indoor station engine.
 *
 * - Pure TS core (no DOM): graph build, fare-boundary policy, dataset validation and
 *   lexicographic step-free routing over the contract's `StationGraph`.
 * - `<StationPlan2D />`: stateless split-panel SVG floor plan.
 * - `StationSceneController` + `<StationExplorer />`: imperative Three.js scene (instanced,
 *   render-on-demand, full `dispose`) behind a thin React bridge.
 */
export * from './graph/build.ts';
export * from './graph/policy.ts';
export * from './graph/validate.ts';
export * from './i18n.ts';
export * from './plan2d/layout.ts';
export * from './plan2d/StationPlan2D.tsx';
export * from './route/search.ts';
export * from './scene/StationSceneController.ts';
export * from './theme.ts';
export * from './ui/StationExplorer.tsx';
export * from './ui/UnknownValue.tsx';
