import type { PlatformDirection, PlatformService } from '../../src/domain/index.ts'

import { chineseName } from './namesZh.ts'

const multilingual = (ja: string, en: string | null, zh = chineseName(ja)) => ({ ja, en, zh })
type Name = ReturnType<typeof multilingual>

function direction(
  id: string,
  towards: Name,
  sourceIds: string[],
  neighborStationName: Name | null = null,
  bound: PlatformDirection['bound'] = null,
  terminusStationName: Name | null = null,
): PlatformDirection {
  return {
    id: 'sk:direction:' + id,
    towards,
    neighborStationName,
    bound,
    terminusStationName,
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
      lastVerifiedAt: '2026-11-24',
      sourceIds: [...new Set(directions.flatMap((entry) => entry.sourceIds))],
    },
  }
}

const jrKobe = multilingual('三ノ宮・姫路方面', 'Toward Sannomiya and Himeji', '往三宫、姬路')
const jrKyoto = multilingual('新大阪・高槻・京都方面', 'Toward Shin-Osaka, Takatsuki and Kyoto', '往新大阪、高槻、京都')
const jrEast = multilingual('新大阪・放出・久宝寺方面', 'Toward Shin-Osaka, Hanaten and Kyuhoji', '往新大阪、放出、久宝寺')
const tsukamoto = multilingual('塚本', 'Tsukamoto')
const shinOsaka = multilingual('新大阪', 'Shin-Osaka')
const fukushima = multilingual('福島', 'Fukushima', '福岛')
const jrRoute = ['jr-index', 'jr-network-symbols']
const hanwaDirection = multilingual('鳳・和歌山方面', 'Toward Otori and Wakayama', '往凤、和歌山')
const airportDirection = multilingual('関西空港方面', 'Toward Kansai-airport', '往关西机场')
const westLimited = multilingual('京都・北陸・東海方面', 'Toward Kyoto, Hokuriku and Tokai', '往京都、北陆、东海')

export const services: PlatformService[] = [
  service('jr-1-2', 'loop',
    direction('jr-1-loop-inner', multilingual('西九条・弁天町方面', 'Toward Nishikujo and Bentencho', '往西九条、弁天町'), jrRoute, fukushima, 'inner'),
    direction('jr-2-loop-outer', multilingual('京橋・鶴橋方面', 'Toward Kyobashi and Tsuruhashi', '往京桥、鹤桥'), jrRoute, multilingual('天満', 'Temma', '天满'), 'outer'),
  ),
  service('jr-1-2', 'yumesaki', direction('jr-1-yumesaki', multilingual('ユニバーサルシティ方面', 'Toward Universal City', '往环球城'), jrRoute)),
  service('jr-1-2', 'kansai-airport', direction('jr-1-airport', airportDirection, jrRoute, null, null, multilingual('関西空港', 'Kansai-airport', '关西机场'))),
  service('jr-1-2', 'hanwa', direction('jr-1-hanwa', hanwaDirection, jrRoute)),
  service('jr-1-2', 'yamatoji', direction('jr-1-yamatoji', multilingual('王寺・奈良方面', 'Toward Oji and Nara', '往王寺、奈良'), jrRoute)),
  service('jr-3-4', 'kobe', direction('jr-3-4-kobe', jrKobe, jrRoute, tsukamoto)),
  service('jr-3-4', 'takarazuka', direction('jr-3-4-takarazuka',
    multilingual('篠山口・福知山方面', 'Toward Sasayamaguchi and Fukuchiyama', '往篠山口、福知山'), jrRoute, tsukamoto)),
  service('jr-3-4', 'bantan', direction('jr-4-bantan',
    multilingual('城崎温泉・香住方面', 'Toward Kinosaki Onsen and Kasumi', '往城崎温泉、香住'), ['jr-index'])),
  service('jr-5-6', 'kobe', direction('jr-5-6-kobe', jrKobe, [...jrRoute, 'jr-kobe-schedule'], tsukamoto, null,
    multilingual('姫路・網干・西明石など', 'Himeji, Aboshi, Nishi-Akashi and others', '姬路、网干、西明石等'))),
  service('jr-5-6', 'takarazuka', direction('jr-6-takarazuka',
    multilingual('宝塚・三田方面', 'Toward Takarazuka and Sanda', '往宝塚、三田'), [...jrRoute, 'jr-kobe-schedule'], tsukamoto, null,
    multilingual('新三田など', 'Shin-Sanda and others', '新三田等'))),
  service('jr-7-8', 'kyoto', direction('jr-7-8-kyoto', jrKyoto, jrRoute, shinOsaka)),
  service('jr-9-10', 'kyoto', direction('jr-9-10-kyoto', jrKyoto, jrRoute, shinOsaka)),
  service('jr-11', 'tokaido-express',
    direction('jr-11-tokaido', westLimited, ['jr-index'], null, null, multilingual('東京など', 'Tokyo and others', '东京等'))),
  service('jr-21-22', 'east', direction('jr-22-east', jrEast, jrRoute, shinOsaka)),
  service('jr-21-22', 'kansai-airport', direction('jr-21-airport', airportDirection, ['jr-index'], null, null,
    multilingual('関西空港', 'Kansai-airport', '关西机场'))),
  service('jr-21-22', 'hanwa', direction('jr-21-hanwa', multilingual('和歌山方面（特急）', 'Toward Wakayama · limited express', '往和歌山（特急）'), ['jr-index'])),
  service('jr-23-24', 'east', direction('jr-23-east', jrEast, jrRoute, shinOsaka)),
  service('jr-23-24', 'tokaido-express', direction('jr-24-express',
    multilingual('新大阪・京都方面', 'Toward Shin-Osaka and Kyoto', '往新大阪、京都'), ['jr-index'])),
  service('kita-1-2', 'jr-tozai',
    direction('kita-1-west', multilingual('尼崎・宝塚・三ノ宮方面', 'Toward Amagasaki, Takarazuka and Sannomiya', '往尼崎、宝塚、三宫'), ['kitashinchi', 'jr-network-symbols'], multilingual('新福島', 'Shin-Fukushima', '新福岛')),
    direction('kita-2-east', multilingual('京橋・四条畷・松井山手方面', 'Toward Kyobashi, Shijonawate and Matsuiyamate', '往京桥、四条畷、松井山手'), ['kitashinchi', 'jr-network-symbols'], multilingual('大阪天満宮', 'Osaka Temmangu', '大阪天满宫')),
  ),
  service('metro-1', 'midosuji', direction(
    'metro-1-nakamozu', multilingual('なんば・天王寺・なかもず方面', 'Toward Namba, Tennoji and Nakamozu', '往难波、天王寺、中百舌鸟'),
    ['metro-map', 'metro-umeda-stations'], multilingual('淀屋橋', 'Yodoyabashi'), null,
    multilingual('なかもず', 'Nakamozu', '中百舌鸟'),
  )),
  service('higashi-1', 'tanimachi', direction(
    'higashi-1-yaominami', multilingual('八尾南方面', 'Toward Yaominami', '往八尾南'),
    ['higashi-map', 'metro-network-colors'], multilingual('南森町', 'Minamimorimachi'), null,
    multilingual('八尾南', 'Yaominami'),
  )),
  service('higashi-2', 'tanimachi', direction(
    'higashi-2-dainichi', multilingual('大日方面', 'Toward Dainichi', '往大日'),
    ['higashi-map', 'metro-network-colors'], multilingual('中崎町', 'Nakazakicho'), null,
    multilingual('大日', 'Dainichi'),
  )),
  service('nishi-1-2', 'yotsubashi', direction(
    'nishi-1-2-suminoekoen', multilingual('本町・なんば・住之江公園方面', 'Toward Hommachi, Namba and Suminoekoen', '往本町、难波、住之江公园'),
    ['metro-nishi-map', 'nishi'], multilingual('肥後橋', 'Higobashi', '肥后桥'), null,
    multilingual('住之江公園', 'Suminoekoen', '住之江公园'),
  )),
  ...[1, 2, 3].map((platform) => service('hk-' + platform, 'hk-kyoto', direction(
    'hk-' + platform + '-kyoto', multilingual('京都河原町、北千里方面', 'Toward Kyoto-kawaramachi and Kita-senri', '往京都河原町、北千里'),
    ['hankyu', 'hankyu-current', 'hankyu-network'], multilingual('十三', 'Juso'),
  ))),
  ...[4, 5, 6].map((platform) => service('hk-' + platform, 'hk-takarazuka', direction(
    'hk-' + platform + '-takarazuka', multilingual('宝塚方面', 'Toward Takarazuka', '往宝塚'),
    ['hankyu', 'hankyu-current', 'hankyu-network'], multilingual('中津', 'Nakatsu'),
  ))),
  ...[7, 8, 9].map((platform) => service('hk-' + platform, 'hk-kobe', direction(
    'hk-' + platform + '-kobe', multilingual('神戸三宮方面', 'Toward Kobe-sannomiya', '往神户三宫'),
    ['hankyu', 'hankyu-current', 'hankyu-network'], multilingual('中津', 'Nakatsu'),
  ))),
  ...['1-2', '3-4'].map((group) => service('hs-' + group, 'hs-main', direction(
    'hs-' + group + '-kobe', multilingual('神戸三宮方面', 'Toward Kobe-sannomiya', '往神户三宫'),
    ['hanshin-map', 'hanshin-network'], fukushima,
  ))),
]
