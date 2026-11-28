/**
 * `@senkiro/contracts` — authoritative implementation of
 * `docs/01-domain-contract-v1.0.md` (SENKIRO Domain Contract v1.0).
 *
 * Zero heavy runtime dependencies (only `zod`), no Node-only APIs: usable from the web app,
 * Web Workers, Node and Expo/Hermes alike.
 */

/** Version of `docs/01-domain-contract-v1.0.md` implemented by this package. */
export const DOMAIN_CONTRACT_VERSION = '1.0' as const;

export * from './app-search-params.ts';
export * from './base.ts';
export * from './errors.ts';
export * from './fare.ts';
export * from './guards.ts';
export * from './ids.ts';
export * from './journey.ts';
export * from './locale.ts';
export * from './service.ts';
export * from './station.ts';
export * from './track.ts';
