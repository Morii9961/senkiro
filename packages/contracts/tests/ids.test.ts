import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  ENTITY_ID_PREFIXES,
  isSkId,
  LEGACY_ENTITY_ALIASES,
  makeSkId,
  parseLegacyLabId,
  parseSkId,
  SK_ID_PATTERN,
  type SkId,
  SkIdError,
  safeParseSkId,
} from '../src/index.ts';

describe('SkId validation', () => {
  it('accepts every contract §3.1 example', () => {
    const examples = [
      'sk:operator:jp:jr-west',
      'sk:line:kansai:jr-west-kyoto',
      'sk:station:kansai:jr-west-osaka',
      'sk:station:kansai:hankyu-osaka-umeda',
      'sk:complex:kansai:osaka-umeda',
      'sk:complex:kansai:kyoto',
      'sk:place:umeda:jr-osaka-1f-midosuji-gate',
      'sk:station:kanto:jr-east-shinjuku',
      'sk:vehicle:kansai:jr-west-223-2000',
      'sk:source:jp:mlit-ksj-n02-24',
    ];
    for (const id of examples) {
      expect(isSkId(id), id).toBe(true);
      expect(SK_ID_PATTERN.test(id), id).toBe(true);
    }
  });

  it('covers exactly the 23 v1.0 entity prefixes in the official pattern', () => {
    expect(ENTITY_ID_PREFIXES).toHaveLength(23);
    for (const entity of ENTITY_ID_PREFIXES) {
      expect(SK_ID_PATTERN.test(`sk:${entity}:jp:x`)).toBe(true);
    }
  });

  it('rejects malformed IDs', () => {
    const bad: unknown[] = [
      'sk:station:jr-west-osaka', // legacy three-segment
      'sk:station:kansai:jr-west-osaka:extra',
      'sk:Station:kansai:osaka',
      'sk:station:Kansai:osaka',
      'sk:station:kansai:jr_west_osaka',
      'sk:station:kansai:',
      'sk:station::osaka',
      'sk:platform:umeda:jr-3-4', // not a v1.0 prefix
      'xx:station:kansai:osaka',
      ' sk:station:kansai:osaka',
      'sk:station:kansai:大阪',
      '',
      42,
      null,
      undefined,
    ];
    for (const value of bad) {
      expect(isSkId(value), String(value)).toBe(false);
      if (typeof value === 'string') {
        expect(SK_ID_PATTERN.test(value), value).toBe(false);
      }
    }
  });

  it('pins the expected entity kind', () => {
    expect(isSkId('sk:station:kansai:jr-west-osaka', 'station')).toBe(true);
    expect(isSkId('sk:station:kansai:jr-west-osaka', 'line')).toBe(false);
    const result = safeParseSkId('sk:line:kansai:jr-west-kyoto', 'station');
    expect(result.ok).toBe(false);
  });

  it('parses into entity / scope / slug', () => {
    expect(parseSkId('sk:complex:kansai:osaka-umeda', 'complex')).toEqual({
      id: 'sk:complex:kansai:osaka-umeda',
      entity: 'complex',
      scope: 'kansai',
      slug: 'osaka-umeda',
    });
  });

  it('parseSkId throws a typed SkIdError carrying INVALID_SK_ID', () => {
    expect(() => parseSkId('sk:station:osaka')).toThrow(SkIdError);
    try {
      parseSkId('sk:station:osaka');
    } catch (error) {
      expect(error).toBeInstanceOf(SkIdError);
      expect((error as SkIdError).code).toBe('INVALID_SK_ID');
    }
  });

  it('makeSkId builds valid IDs and refuses invalid segments', () => {
    const id = makeSkId('station', 'kansai', 'jr-west-osaka');
    expect(id).toBe('sk:station:kansai:jr-west-osaka');
    expectTypeOf(id).toEqualTypeOf<SkId<'station'>>();
    expect(() => makeSkId('station', 'Kansai', 'x')).toThrow(SkIdError);
    expect(() => makeSkId('station', 'kansai', 'a:b')).toThrow(SkIdError);
    expect(() => makeSkId('station', 'kansai', '')).toThrow(SkIdError);
    // @ts-expect-error — 'platform' is not a v1.0 entity prefix
    expect(() => makeSkId('platform', 'umeda', 'x')).toThrow(SkIdError);
  });

  it('rejects wrong entity kinds and legacy IDs at compile time', () => {
    const station: SkId<'station'> = 'sk:station:kansai:jr-west-osaka';
    // @ts-expect-error — a line ID is not a station ID
    const wrong: SkId<'station'> = 'sk:line:kansai:jr-west-kyoto';
    // @ts-expect-error — legacy three-segment IDs are not v1.0 SkIds
    const legacy: SkId<'station'> = 'sk:station:jr-west-osaka';
    expect([station, wrong, legacy]).toHaveLength(3);
  });
});

describe('parseLegacyLabId', () => {
  it('inserts the default scope into Lab A three-segment IDs', () => {
    expect(parseLegacyLabId('sk:station:tokyo-metro-otemachi', 'kanto')).toBe(
      'sk:station:kanto:tokyo-metro-otemachi',
    );
    expect(parseLegacyLabId('sk:line:jr-central-tokaido-shinkansen', 'jp')).toBe(
      'sk:line:jp:jr-central-tokaido-shinkansen',
    );
  });

  it('maps Lab B/C indoor kinds through the explicit alias table', () => {
    expect(parseLegacyLabId('sk:platform:jr-3-4', 'umeda')).toBe('sk:place:umeda:jr-3-4');
    expect(parseLegacyLabId('sk:area:busta-3f-deck', 'shinjuku')).toBe(
      'sk:place:shinjuku:busta-3f-deck',
    );
    expect(parseLegacyLabId('sk:vertical:tokyo-metro-escalator-east', 'shinjuku')).toBe(
      'sk:link:shinjuku:tokyo-metro-escalator-east',
    );
    expect(LEGACY_ENTITY_ALIASES.elevator).toBe('link');
  });

  it('refuses to guess ambiguous or unknown legacy kinds unless told', () => {
    expect(() => parseLegacyLabId('sk:passage:whity-north', 'umeda')).toThrow(SkIdError);
    expect(() => parseLegacyLabId('sk:physical_track:x', 'kanto')).toThrow(SkIdError);
    expect(parseLegacyLabId('sk:passage:whity-north', 'umeda', { entity: 'place' })).toBe(
      'sk:place:umeda:whity-north',
    );
  });

  it('is idempotent for IDs that are already v1.0', () => {
    const id = 'sk:station:kansai:jr-west-osaka';
    expect(parseLegacyLabId(id, 'kanto')).toBe(id);
    expect(() => parseLegacyLabId(id, 'kanto', { entity: 'line' })).toThrow(SkIdError);
  });

  it('does not silently normalise invalid slugs or scopes', () => {
    expect(() => parseLegacyLabId('sk:station:Shinjuku', 'kanto')).toThrow(SkIdError);
    expect(() => parseLegacyLabId('sk:station:shinjuku_west', 'kanto')).toThrow(SkIdError);
    expect(() => parseLegacyLabId('sk:station:shinjuku', 'Kanto')).toThrow(SkIdError);
    expect(() => parseLegacyLabId('station:shinjuku', 'kanto')).toThrow(SkIdError);
  });
});
