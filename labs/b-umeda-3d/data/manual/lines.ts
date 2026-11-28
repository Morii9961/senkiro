import type { DataNature } from '../../src/domain/types.ts'

export interface LineStyle {
  lineId: string
  color: { hex: string; sourceIds: string[]; dataNature: DataNature } | null
  stationNumberPrefix: string | null
  shortName: { ja: string; en: string; zh: string } | null
  kind: 'jr' | 'subway' | 'private' | 'other'
}

// Display swatches approximate the colors on the referenced operator diagrams.
function style(id: string, kind: LineStyle['kind'], code: string, hex: string, source: string): LineStyle {
  return {
    lineId: 'sk:line:' + id,
    kind,
    color: { hex, sourceIds: ['sk:source:' + source], dataNature: 'derived' },
    stationNumberPrefix: code,
    shortName: null,
  }
}

export const lineStyles: LineStyle[] = [
  style('midosuji', 'subway', 'M', '#c92136', 'metro-network-colors'),
  style('tanimachi', 'subway', 'T', '#602384', 'metro-network-colors'),
  style('yotsubashi', 'subway', 'Y', '#006bac', 'metro-network-colors'),
  style('hk-kyoto', 'private', 'HK', '#00834c', 'hankyu-sign-colors'),
  style('hk-takarazuka', 'private', 'HK', '#dc7700', 'hankyu-sign-colors'),
  style('hk-kobe', 'private', 'HK', '#006aa7', 'hankyu-sign-colors'),
  style('hs-main', 'private', 'HS', '#0075c2', 'hanshin-line-colors'),
  style('jr-tozai', 'jr', 'H', '#a92e82', 'jr-network-symbols'),
  style('loop', 'jr', 'O', '#d62638', 'jr-network-symbols'),
  style('kobe', 'jr', 'A', '#0071bb', 'jr-network-symbols'),
  style('kyoto', 'jr', 'A', '#0071bb', 'jr-network-symbols'),
  style('east', 'jr', 'F', '#507984', 'jr-network-symbols'),
  style('takarazuka', 'jr', 'G', '#e7ac00', 'jr-network-symbols'),
  style('yumesaki', 'jr', 'P', '#164a91', 'jr-network-symbols'),
  style('kansai-airport', 'jr', 'S', '#0877a8', 'jr-network-symbols'),
  style('hanwa', 'jr', 'R', '#e1691b', 'jr-network-symbols'),
  style('yamatoji', 'jr', 'Q', '#00834a', 'jr-network-symbols'),
  style('bantan', 'jr', 'J', '#ad3978', 'jr-network-symbols'),
  {
    lineId: 'sk:line:tokaido-express',
    kind: 'other',
    color: null,
    stationNumberPrefix: null,
    shortName: { ja: '東海道線', en: 'Tokaido Line', zh: '东海道线' },
  },
]
