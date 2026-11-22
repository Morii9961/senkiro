import type { Step } from '../domain/graph'
import type { Model, Place } from '../domain/types'

export function siteFilter(model: Model, id: string | null): (place: Place) => boolean {
  if (!id) return () => true
  const site = model.context.find((entry) => entry.id === id)
  const stationId = site ? site.stationId : model.stations.find((station) => station.id === id)?.id
  return (place) => stationId
    ? place.stationId === stationId
    : id === 'sk:context:whity' && place.id.startsWith('sk:concourse:whity-')
}

export function scenePlaceFilter(
  model: Model,
  { siteId, floor }: { siteId: string | null; floor: number | null },
  current: Step | undefined,
): (place: Place) => boolean {
  const inSite = siteFilter(model, siteId)
  if (floor !== null) {
    const ids = new Set(model.levels.filter((level) => level.ordinal === floor).map((level) => level.id))
    return (place) => inSite(place) && ids.has(place.levelId)
  }
  if (current) {
    return (place) => inSite(place) &&
      (place.levelId === current.from.levelId || place.levelId === current.to.levelId)
  }
  return inSite
}
