import type { Entity, Level, Link, Manager, Model, Place, Point } from '../../src/domain/types.ts'
import { checked } from './sources.ts'

// Editorial coordinates in arbitrary units. Only adjacency, order and fare boundaries encode railway facts.
export function entity(kind: string, slug: string, ja: string, en: string, refs = ['jr-map']): Entity {
  return { id: 'sk:'+kind+':'+slug, names: { ja, en, ja_kana: null, zh: null }, externalIds: {},
    provenance: { sourceIds: refs.map(key=>'sk:source:'+key), dataNature: 'manual-verified', lastVerifiedAt: checked },
    geometry_confidence: 'schematic', validFrom: null, validTo: null }
}
const jr = { ...entity('operator','jr-west','JR西日本','JR West'), kind:'Operator' as const }
export const osaka = { ...entity('station','jr-osaka','大阪','Osaka'), operatorId:jr.id, lineIds:[] as string[] }
export const model: Model = { operators:[jr], stations:[osaka], lines:[], levels:[], places:[], links:[], context:[],
  complex:{ ...entity('complex','osaka-umeda','大阪・梅田','Osaka / Umeda',['city-b']), stationIds:[osaka.id] }, interchange:null }
export function level(slug: string, label: string, ordinal: number, stationId: string | null, refs = ['jr-map']) {
  const value: Level = {...entity('level',slug,label,label,refs), label, ordinal, stationId}
  model.levels.push(value)
  return value
}
export function place(kind: Place['kind'], slug: string, ja: string, en: string, floor: Level, point: Point, size: Point,
  zone: Place['zone']='paid', manager: Manager | null=null, refs = ['jr-map']) {
  const value: Place = { ...entity(kind.toLowerCase(),slug,ja,en,refs), kind, levelId:floor.id, stationId:floor.stationId, point,size,zone,manager }
  model.places.push(value)
  return value
}
export function link(kind: Link['kind'], slug: string, from: Place, to: Place, ja: string, en: string,
  refs = ['jr-map'], options: Partial<Pick<Link,'stepFree'|'declaredSpan'|'direction'>> = {}) {
  const value: Link = { ...entity(kind.toLowerCase(),slug,ja,en,refs), kind, from:from.id, to:to.id,
    declaredSpan:null, stepFree:kind==='Stairs'||kind==='Escalator'?false:kind==='Elevator'?true:null,
    direction:kind==='Escalator'?'unknown':'both', connection:'verified', ...options }
  model.links.push(value)
  return value
}
export const jr1 = level('jr-1f','1F',0,osaka.id), jr2 = level('jr-2f','2F',1,osaka.id)
export const west = place('Concourse','jr-west-inside','西口 改札内','West gate hall',jr1,[-20,0],[7,29])
export const westOutside = place('Concourse','jr-west-outside','西口 改札外','West gate exterior',jr1,[-26,0],[5,9],'unpaid','railway')
link('Gate','jr-west',west,westOutside,'西口','West gate')
export const platforms: Place[] = []
export function addPlatform(pair: string, z: number, westLift: string) {
  const island = place('Platform','jr-'+pair,'大阪 '+pair.replace('-','・')+'番のりば','Osaka platforms '+pair.replace('-',' / '),jr2,[0,z],[49,2.8])
  const landing = place('Landing','jr-west-'+westLift.toLowerCase(),'西口側 乗降場','West lift landing',jr1,[-20,z],[1,1])
  const top = place('Landing','jr-upper-'+westLift.toLowerCase(),'ホーム側 乗降場','Platform lift landing',jr2,[-20,z],[1,1])
  link('Passage','west-'+pair,west,landing,'西口 改札内通路','West paid passage')
  link('Elevator','west-'+pair,landing,top,'エレベーター '+westLift,'Lift '+westLift)
  link('Passage','platform-'+pair,top,island,'ホーム通路','Platform passage')
  platforms.push(island)
  return island
}
export const firstPlatform = addPlatform('3-4',7.5,'W')
