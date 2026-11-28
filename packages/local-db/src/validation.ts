import {
  assertValidCommemorativeTicket,
  type CommemorativeTicketDraft,
  parseSkId,
  type RideRecord,
  type RideSegment,
  VISIT_KINDS,
  type VisitedStation,
} from '@senkiro/contracts';

export function validateRide(
  ride: RideRecord,
  segments: readonly RideSegment[],
  visits: readonly VisitedStation[],
): void {
  parseSkId(ride.id, 'ride');
  parseSkId(ride.originStationId, 'station');
  parseSkId(ride.destinationStationId, 'station');
  if (ride.lineId !== null) {
    parseSkId(ride.lineId, 'line');
  }
  if (ride.vehicleSeriesId !== null) {
    parseSkId(ride.vehicleSeriesId, 'vehicle');
  }
  const day = new Date(`${ride.travelDate}T00:00:00Z`);
  if (Number.isNaN(day.valueOf()) || day.toISOString().slice(0, 10) !== ride.travelDate) {
    throw new Error('travelDate must be a valid YYYY-MM-DD calendar date.');
  }
  if (
    ride.farePaidYen !== null &&
    (!Number.isSafeInteger(ride.farePaidYen) || ride.farePaidYen < 0)
  ) {
    throw new Error('farePaidYen must be a non-negative whole-yen amount or null.');
  }
  const expected = new Set(ride.segmentIds);
  const covered = new Set(segments.map(({ segmentId }) => segmentId));
  if (
    expected.size !== covered.size ||
    segments.some(({ rideId, segmentId }) => rideId !== ride.id || !expected.has(segmentId))
  ) {
    throw new Error('Ride segments must belong to this ride and match its segment IDs.');
  }
  for (const segment of segments) {
    parseSkId(segment.segmentId, 'segment');
    if (
      segment.operatingKm !== null &&
      (!Number.isFinite(segment.operatingKm) || segment.operatingKm < 0)
    ) {
      throw new Error('operatingKm must be a non-negative finite distance or null.');
    }
  }
  for (const visit of visits) {
    parseSkId(visit.stationId, 'station');
    if (visit.rideId !== ride.id || !VISIT_KINDS.includes(visit.visitKind)) {
      throw new Error('The station visit must belong to this ride and use a valid visit kind.');
    }
  }
}

export function validateTicket(ticket: CommemorativeTicketDraft) {
  assertValidCommemorativeTicket(ticket);
  if (ticket.rideId !== null) {
    parseSkId(ticket.rideId, 'ride');
  }
  return ticket;
}
