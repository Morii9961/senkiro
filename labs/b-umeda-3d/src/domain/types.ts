export type DataNature = 'official' | 'licensed-third-party' | 'derived' | 'manual-verified' | 'synthetic' | 'unknown'
export type GeometryConfidence = 'verified' | 'schematic' | 'unknown'
export type Language = 'ja' | 'en'
export interface Entity {
  id: string
  names: { ja: string; en: string; ja_kana: string | null; zh: string | null }
  externalIds: Record<string, string>
  provenance: { sourceIds: string[]; dataNature: DataNature; lastVerifiedAt: string }
  geometry_confidence: GeometryConfidence
  validFrom: string | null
  validTo: string | null
}
export interface Operator extends Entity { kind: 'Operator' }
export interface RailLine extends Entity { operatorId: string }
export interface Station extends Entity { operatorId: string; lineIds: string[] }
export interface StationComplex extends Entity { stationIds: string[] }
export interface Interchange extends Entity { stationIds: string[]; outsideGates: true }
export interface Level extends Entity { ordinal: number; label: string; stationId: string | null }
export type Manager = 'railway' | 'commercial' | 'public-road' | 'unknown'
export type Point = [number, number]
export interface Place extends Entity {
  kind: 'Platform' | 'Concourse' | 'Entrance' | 'Landing'
  levelId: string
  zone: 'paid' | 'unpaid'
  stationId: string | null
  manager: Manager | null
  point: Point
  size: Point
}
export type Platform = Place & { kind: 'Platform' }
export type Entrance = Place & { kind: 'Entrance' }
export type Concourse = Place & { kind: 'Concourse' }
export interface Link extends Entity {
  kind: 'Passage' | 'Gate' | 'Stairs' | 'Elevator' | 'Escalator'
  from: string
  to: string
  direction: 'both' | 'forward' | 'unknown'
  declaredSpan: [string, string] | null
  stepFree: boolean | null
  connection: 'verified' | 'unverified'
}
export type Gate = Link & { kind: 'Gate' }
export type VerticalFacility = Link & { kind: 'Stairs' | 'Escalator' | 'Elevator' }
export interface ContextBlock extends Entity { kind: 'UnverifiedBlock' }
export interface Model {
  operators: Operator[]; lines: RailLine[]; stations: Station[]; complex: StationComplex
  interchange: Interchange | null; levels: Level[]; places: Place[]; links: Link[]; context: ContextBlock[]
}
export interface SourceRecord {
  id: string; title: string; publisher: string; url: string | null; retrievedAt: string
  sourceDate: string | null; license: string; licenseUrl: string | null
  commercialUse: 'yes' | 'no' | 'conditional' | 'unknown'
  redistribution: 'yes' | 'no' | 'conditional' | 'unknown'
  shareAlike: boolean | 'unknown'; attributionText: string; notes: string
}
export interface PlatformUpdate {
  lineId: string; platformId: string; status: 'normal' | 'delayed' | 'suspended' | 'unknown'
  delayMinutes: number | null; scheduledAt: string | null; observedAt: string
  sourceId: string; dataNature: DataNature
}
