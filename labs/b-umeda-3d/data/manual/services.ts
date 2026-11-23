import type { PlatformDirection, PlatformService } from '../../src/domain/index.ts'

const multilingual = (ja: string, en: string | null) => ({ ja, en })
type Name = ReturnType<typeof multilingual>

function direction(
  id: string,
  towards: Name,
  sourceIds: string[],
  neighborStationName: Name | null = null,
  bound: PlatformDirection['bound'] = null,
): PlatformDirection {
  return {
    id: 'sk:direction:' + id,
    towards,
    neighborStationName,
    bound,
    terminusStationName: null,
    sourceIds: sourceIds.map((value) => 'sk:source:' + value),
  }
}

function service(place: string, line: string, ...directions: PlatformDirection[]): PlatformService {
  return {
    platformId: 'sk:platform:' + place,
    lineId: 'sk:line:' + line,
    directions,
    track: null,
    provenance: {
      dataNature: 'manual-verified',
      lastVerifiedAt: '2026-11-23',
      sourceIds: [...new Set(directions.flatMap((entry) => entry.sourceIds))],
    },
  }
}

const jrKobe = multilingual('三ノ宮・姫路方面', 'Toward Sannomiya and Himeji')
const jrKyoto = multilingual('新大阪・高槻・京都方面', 'Toward Shin-Osaka, Takatsuki and Kyoto')
const jrEast = multilingual('新大阪・放出・久宝寺方面', 'Toward Shin-Osaka, Hanaten and Kyuhoji')

export const services: PlatformService[] = [
  service('jr-1-2', 'loop',
    direction('jr-1-loop-inner', multilingual('西九条・弁天町方面', 'Toward Nishikujo and Bentencho'), ['jr-index'], null, 'inner'),
    direction('jr-2-loop-outer', multilingual('京橋・鶴橋方面', 'Toward Kyobashi and Tsuruhashi'), ['jr-index'], null, 'outer'),
  ),
  service('jr-3-4', 'kobe', direction('jr-3-4-kobe', jrKobe, ['jr-index'])),
  service('jr-5-6', 'kobe', direction('jr-5-6-kobe', jrKobe, ['jr-index'])),
  service('jr-7-8', 'kyoto', direction('jr-7-8-kyoto', jrKyoto, ['jr-index'])),
  service('jr-9-10', 'kyoto', direction('jr-9-10-kyoto', jrKyoto, ['jr-index'])),
  service('jr-21-22', 'east', direction('jr-22-east', jrEast, ['jr-index'])),
  service('jr-23-24', 'east', direction('jr-23-east', jrEast, ['jr-index'])),
  service('kita-1-2', 'jr-tozai',
    direction('kita-1-west', multilingual('尼崎・宝塚・三ノ宮方面', 'Toward Amagasaki, Takarazuka and Sannomiya'), ['kitashinchi']),
    direction('kita-2-east', multilingual('京橋・四条畷・松井山手方面', 'Toward Kyobashi, Shijonawate and Matsuiyamate'), ['kitashinchi']),
  ),
  service('metro-1', 'midosuji', direction(
    'metro-1-nakamozu', multilingual('なんば・天王寺・なかもず方面', 'Toward Namba, Tennoji and Nakamozu'),
    ['metro-map', 'metro-umeda-stations'], multilingual('淀屋橋', 'Yodoyabashi'),
  )),
  service('nishi-1-2', 'yotsubashi', direction(
    'nishi-1-2-suminoekoen', multilingual('本町・なんば・住之江公園方面', 'Toward Hommachi, Namba and Suminoekoen'),
    ['metro-nishi-map', 'nishi'], multilingual('肥後橋', 'Higobashi'),
  )),
  ...[1, 2, 3].map((platform) => service('hk-' + platform, 'hk-kyoto', direction(
    'hk-' + platform + '-kyoto', multilingual('京都河原町、北千里方面', 'Toward Kyoto-kawaramachi and Kita-senri'),
    ['hankyu', 'hankyu-current', 'hankyu-network'], multilingual('十三', 'Juso'),
  ))),
  ...[4, 5, 6].map((platform) => service('hk-' + platform, 'hk-takarazuka', direction(
    'hk-' + platform + '-takarazuka', multilingual('宝塚方面', 'Toward Takarazuka'),
    ['hankyu', 'hankyu-current', 'hankyu-network'], multilingual('中津', 'Nakatsu'),
  ))),
  ...[7, 8, 9].map((platform) => service('hk-' + platform, 'hk-kobe', direction(
    'hk-' + platform + '-kobe', multilingual('神戸三宮方面', 'Toward Kobe-sannomiya'),
    ['hankyu', 'hankyu-current', 'hankyu-network'], multilingual('中津', 'Nakatsu'),
  ))),
  ...['1-2', '3-4'].map((group) => service('hs-' + group, 'hs-main', direction(
    'hs-' + group + '-kobe', multilingual('神戸三宮方面', 'Toward Kobe-sannomiya'),
    ['hanshin-map', 'hanshin-network'], multilingual('福島', 'Fukushima'),
  ))),
]
