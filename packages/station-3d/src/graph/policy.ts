/**
 * Fare-boundary policy shared by the validator and the router: one statement of which
 * links may ever carry a passenger.
 */
import { type FareZone, isPaidFareZone, type StationLink } from '@senkiro/contracts';

export type CrossingVerdict =
  /** Same fare zone, or a gate that legitimately separates two zones. */
  | 'open'
  /** One side is `'roadway'` (bus/taxi roadway): drawn, never walked. */
  | 'roadway'
  /** Two zones meet without a gate: a data error, never routed. */
  | 'ungated-boundary'
  /** Two different paid areas joined by something other than a verified transfer gate. */
  | 'unverified-transfer';

/**
 * Whether `link` may carry a passenger between places in `zoneA` and `zoneB`.
 *
 * Hard rules (contract §5.2): never through `'roadway'`; never between two operators' paid
 * areas unless the link is a transfer gate whose connection is verified.
 */
export function crossingVerdict(
  link: StationLink,
  zoneA: FareZone,
  zoneB: FareZone,
): CrossingVerdict {
  if (zoneA === 'roadway' || zoneB === 'roadway') {
    return 'roadway';
  }
  if (zoneA === zoneB) {
    return 'open';
  }
  if (link.kind !== 'gate') {
    return 'ungated-boundary';
  }
  if (isPaidFareZone(zoneA) && isPaidFareZone(zoneB)) {
    return link.gateKind === 'transfer' && link.connection === 'verified'
      ? 'open'
      : 'unverified-transfer';
  }
  return 'open';
}
