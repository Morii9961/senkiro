/** Map feature → typed URL pick (kept out of the MapLibre chunk so it is unit-testable). */
import { type AppHub, isSkId, type SkId } from '@senkiro/contracts';

export type AtlasPick =
  | { kind: 'station'; id: SkId<'station'> }
  | { kind: 'complex'; id: SkId<'complex'>; hub: AppHub | null }
  | { kind: 'line'; id: SkId<'line'> };

const HUB_KEYS: readonly string[] = ['umeda', 'kyoto', 'shinjuku'];

/** Turns the top rendered feature into a typed pick; malformed tile IDs are ignored. */
export function pickFromFeature(
  layerId: string,
  properties: Record<string, unknown>,
): AtlasPick | null {
  const id = properties.id;
  if (layerId === 'sk-hub-badge' || layerId === 'sk-complex-ring') {
    const hub = properties.hub_key;
    return isSkId(id, 'complex')
      ? {
          kind: 'complex',
          id,
          hub: typeof hub === 'string' && HUB_KEYS.includes(hub) ? (hub as AppHub) : null,
        }
      : null;
  }
  if (layerId === 'sk-through') {
    const boundary = properties.boundary_station_id;
    return isSkId(boundary, 'station') ? { kind: 'station', id: boundary } : null;
  }
  if (layerId.startsWith('sk-station')) {
    return isSkId(id, 'station') ? { kind: 'station', id } : null;
  }
  const line = properties.primary_line_id;
  return isSkId(line, 'line') ? { kind: 'line', id: line } : null;
}
