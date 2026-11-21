import { model as station } from '../data/manual/model'
export { station }
export const nodes = new Map(station.places.map(p=>[p.id,p]))
export const floors = new Map(station.levels.map(l=>[l.id,l]))
export const floorLabels = [...new Map(station.levels.map(l=>[l.ordinal,l.label])).entries()].sort((a,b)=>b[0]-a[0])
