import type { ExitInfo, PlatformService } from './index.ts'
import type { Entity, Model } from './types.ts'

export function validatePassengerData(
  model: Model, services: PlatformService[], exits: ExitInfo[], sources: Set<string>,
) {
  const places = new Map(model.places.map((place) => [place.id, place]))
  const directions = new Set<string>()
  const serviceKeys = new Set<string>()
  const exitPlaces = new Set<string>()

  function checkSources(ids: string[], key: string) {
    if (!ids.length || ids.some((id) => !sources.has(id))) {
      throw new Error('Missing or unregistered passenger data source: ' + key)
    }
  }

  function checkProvenance(provenance: Entity['provenance'], key: string) {
    if (provenance.dataNature !== 'manual-verified' && provenance.dataNature !== 'official') {
      throw new Error('Invalid passenger data nature: ' + key)
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(provenance.lastVerifiedAt)) {
      throw new Error('Invalid passenger data verification date: ' + key)
    }
    checkSources(provenance.sourceIds, key)
  }

  function checkText(text: { ja: string; en: string | null } | null, key: string) {
    if (text && (!text.ja.trim() || (text.en !== null && !text.en.trim()))) {
      throw new Error('Empty passenger data text: ' + key)
    }
  }

  for (const entry of services) {
    const place = places.get(entry.platformId)
    const key = entry.platformId + '/' + entry.lineId
    if (place?.kind !== 'Platform') throw new Error('Unknown service platform: ' + key)
    if (!place.serviceLineIds?.includes(entry.lineId)) throw new Error('Unserved line: ' + key)
    if (serviceKeys.has(key)) throw new Error('Duplicate service: ' + key)
    serviceKeys.add(key)
    checkProvenance(entry.provenance, key)
    if (entry.track) {
      const boarding = place.boarding
      if (!boarding || entry.track.terminalEnd !== boarding.terminalEnd ||
        entry.track.sides.length !== boarding.trackSides.length ||
        new Set(entry.track.sides).size !== entry.track.sides.length ||
        entry.track.sides.some((side) => !boarding.trackSides.includes(side))) {
        throw new Error('Track disagrees with platform boarding: ' + key)
      }
    }
    for (const direction of entry.directions ?? []) {
      if (!/^sk:direction:[a-z0-9-]+$/.test(direction.id) || directions.has(direction.id)) {
        throw new Error('Invalid or duplicate platform direction: ' + direction.id)
      }
      directions.add(direction.id)
      checkSources(direction.sourceIds, direction.id)
      checkText(direction.towards, direction.id)
      checkText(direction.terminusStationName, direction.id)
      checkText(direction.neighborStationName, direction.id)
    }
  }

  for (const exit of exits) {
    const { placeId } = exit
    if (places.get(placeId)?.kind !== 'Entrance') throw new Error('Unknown entrance: ' + placeId)
    if (exitPlaces.has(placeId)) throw new Error('Duplicate exit: ' + placeId)
    exitPlaces.add(placeId)
    checkProvenance(exit.provenance, placeId)
    checkText(exit.exitLabel, placeId)
    checkText(exit.surfaceNote, placeId)
  }
}
