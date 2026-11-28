import { SkIdError } from './errors.ts';

/** Every entity kind allowed in a v1.0 `SkId` (contract §3.1). */
export const ENTITY_ID_PREFIXES = [
  'operator',
  'line',
  'segment',
  'station',
  'complex',
  'interchange',
  'level',
  'place',
  'gate',
  'link',
  'service',
  'trip',
  'stoptime',
  'through',
  'rule',
  'product',
  'quote',
  'pass',
  'vehicle',
  'ride',
  'ticket',
  'municipality',
  'source',
] as const;

export type EntityIdPrefix = (typeof ENTITY_ID_PREFIXES)[number];

/**
 * Stable four-segment entity ID: `sk:<entity>:<scope>:<slug>`.
 *
 * The template literal type rejects wrong entity kinds and legacy three-segment IDs at
 * compile time; the character rules for `<scope>` / `<slug>` are enforced at runtime by
 * {@link isSkId} / {@link parseSkId} / {@link makeSkId}.
 */
export type SkId<T extends EntityIdPrefix = EntityIdPrefix> = `sk:${T}:${string}:${string}`;

/** Allowed characters for `<scope>` and `<slug>` (contract §3.1). */
export const SK_ID_SEGMENT_PATTERN = /^[a-z0-9-]+$/;

/** Official v1.0 validation pattern (contract §3.2). */
export const SK_ID_PATTERN = new RegExp(
  `^sk:(${ENTITY_ID_PREFIXES.join('|')}):[a-z0-9-]+:[a-z0-9-]+$`,
);

export interface ParsedSkId<T extends EntityIdPrefix = EntityIdPrefix> {
  id: SkId<T>;
  entity: T;
  scope: string;
  slug: string;
}

export type SafeParseSkIdResult<T extends EntityIdPrefix = EntityIdPrefix> =
  | { ok: true; value: ParsedSkId<T> }
  | { ok: false; error: string };

const ENTITY_SET: ReadonlySet<string> = new Set(ENTITY_ID_PREFIXES);

export function isEntityIdPrefix(value: unknown): value is EntityIdPrefix {
  return typeof value === 'string' && ENTITY_SET.has(value);
}

function describe(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : `<${typeof value}>`;
}

/** Non-throwing parse; `expectedEntity` additionally pins the entity kind. */
export function safeParseSkId<T extends EntityIdPrefix = EntityIdPrefix>(
  raw: unknown,
  expectedEntity?: T,
): SafeParseSkIdResult<T> {
  if (typeof raw !== 'string') {
    return { ok: false, error: `SkId must be a string, got ${describe(raw)}` };
  }
  const parts = raw.split(':');
  if (parts.length !== 4 || parts[0] !== 'sk') {
    return {
      ok: false,
      error: `SkId ${describe(raw)} must have exactly four segments "sk:<entity>:<scope>:<slug>"`,
    };
  }
  const [, entity = '', scope = '', slug = ''] = parts;
  if (!isEntityIdPrefix(entity)) {
    return { ok: false, error: `SkId ${describe(raw)} has unknown entity "${entity}"` };
  }
  if (expectedEntity !== undefined && entity !== expectedEntity) {
    return {
      ok: false,
      error: `SkId ${describe(raw)} has entity "${entity}", expected "${expectedEntity}"`,
    };
  }
  if (!SK_ID_SEGMENT_PATTERN.test(scope)) {
    return { ok: false, error: `SkId ${describe(raw)} has invalid scope "${scope}"` };
  }
  if (!SK_ID_SEGMENT_PATTERN.test(slug)) {
    return { ok: false, error: `SkId ${describe(raw)} has invalid slug "${slug}"` };
  }
  return {
    ok: true,
    value: { id: raw as SkId<T>, entity: entity as T, scope, slug },
  };
}

/** Throwing parse. Use at trust boundaries (JSON, SQLite rows, URL params). */
export function parseSkId<T extends EntityIdPrefix = EntityIdPrefix>(
  raw: unknown,
  expectedEntity?: T,
): ParsedSkId<T> {
  const result = safeParseSkId(raw, expectedEntity);
  if (!result.ok) {
    throw new SkIdError(result.error);
  }
  return result.value;
}

/** Type guard: `value` is a valid v1.0 `SkId` (optionally of the given entity kind). */
export function isSkId<T extends EntityIdPrefix = EntityIdPrefix>(
  value: unknown,
  expectedEntity?: T,
): value is SkId<T> {
  return safeParseSkId(value, expectedEntity).ok;
}

/** Build a v1.0 `SkId`, throwing {@link SkIdError} when any segment is invalid. */
export function makeSkId<T extends EntityIdPrefix>(
  entity: T,
  scope: string,
  slug: string,
): SkId<T> {
  if (!isEntityIdPrefix(entity)) {
    throw new SkIdError(`Unknown entity "${String(entity)}"`);
  }
  if (!SK_ID_SEGMENT_PATTERN.test(scope)) {
    throw new SkIdError(`Invalid scope "${scope}" (allowed: ${SK_ID_SEGMENT_PATTERN.source})`);
  }
  if (!SK_ID_SEGMENT_PATTERN.test(slug)) {
    throw new SkIdError(`Invalid slug "${slug}" (allowed: ${SK_ID_SEGMENT_PATTERN.source})`);
  }
  return `sk:${entity}:${scope}:${slug}`;
}

/**
 * Lab A/B/C entity kinds that are not v1.0 prefixes but map unambiguously onto one.
 * Lab B/C indoor nodes (`platform`, `concourse`, `area` …) are v1.0 `place`s; their
 * vertical connectors are v1.0 `link`s.
 *
 * Deliberately absent (ambiguous or not an entity): `passage` (a place *or* a link in the
 * labs), `physical_track`, `direction`, `context`, `update`, `block`. Callers migrating
 * those must pass `options.entity` explicitly; the helper never guesses.
 */
export const LEGACY_ENTITY_ALIASES: Readonly<Record<string, EntityIdPrefix>> = {
  platform: 'place',
  concourse: 'place',
  landing: 'place',
  entrance: 'place',
  area: 'place',
  vertical: 'link',
  elevator: 'link',
  escalator: 'link',
  stairs: 'link',
};

export interface ParseLegacyLabIdOptions {
  /** Force the v1.0 entity kind (required for ambiguous legacy kinds such as `passage`). */
  entity?: EntityIdPrefix;
}

/**
 * Migrate a Lab A/B/C three-segment ID (`sk:<type>:<slug>`) to v1.0 four-segment form by
 * inserting `defaultScope`. Already-valid v1.0 IDs are returned unchanged (idempotent).
 *
 * No silent normalisation: slugs are not lower-cased or re-punctuated, because rewriting
 * could merge two distinct lab entities. Invalid input throws {@link SkIdError}.
 */
export function parseLegacyLabId(
  rawId: string,
  defaultScope: string,
  options: ParseLegacyLabIdOptions = {},
): SkId {
  if (typeof rawId !== 'string') {
    throw new SkIdError(`Legacy ID must be a string, got ${describe(rawId)}`);
  }
  const current = safeParseSkId(rawId);
  if (current.ok) {
    if (options.entity !== undefined && current.value.entity !== options.entity) {
      throw new SkIdError(
        `ID ${describe(rawId)} is already v1.0 with entity "${current.value.entity}", not "${options.entity}"`,
      );
    }
    return current.value.id;
  }
  const parts = rawId.split(':');
  if (parts.length !== 3 || parts[0] !== 'sk') {
    throw new SkIdError(
      `Legacy ID ${describe(rawId)} must be "sk:<type>:<slug>" (or an already-valid v1.0 SkId)`,
    );
  }
  const [, legacyType = '', slug = ''] = parts;
  const entity: EntityIdPrefix | undefined =
    options.entity ??
    (isEntityIdPrefix(legacyType) ? legacyType : LEGACY_ENTITY_ALIASES[legacyType]);
  if (entity === undefined) {
    throw new SkIdError(
      `Legacy entity type "${legacyType}" in ${describe(rawId)} has no unambiguous v1.0 mapping; pass options.entity`,
    );
  }
  return makeSkId(entity, defaultScope, slug);
}
