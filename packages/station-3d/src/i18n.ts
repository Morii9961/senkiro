/**
 * UI strings of the station engine in the three first-class locales (decision D-05).
 * Only interface wording lives here; entity names always come from the data through
 * `resolveLocalizedName`, never from translation.
 */
import {
  type Locale,
  type LocalizedNames,
  resolveLocalizedName,
  type StationLinkKind,
  type StationPlaceKind,
} from '@senkiro/contracts';

const STRINGS = {
  unknown: { 'zh-CN': '未知', ja: '不明', en: 'Unknown' },
  unverified: { 'zh-CN': '未核实', ja: '未確認', en: 'Unverified' },
  floor: { 'zh-CN': '楼层', ja: 'フロア', en: 'Floor' },
  floors: { 'zh-CN': '楼层', ja: 'フロア', en: 'Floors' },
  allFloors: { 'zh-CN': '全部楼层', ja: '全フロア', en: 'All floors' },
  exploded: { 'zh-CN': '分层展开', ja: '階層を展開', en: 'Explode levels' },
  view2d: { 'zh-CN': '平面图', ja: '平面図', en: 'Plan' },
  view3d: { 'zh-CN': '3D', ja: '3D', en: '3D' },
  north: { 'zh-CN': '北', ja: '北', en: 'N' },
  northUnknown: {
    'zh-CN': '方位未核实',
    ja: '方位は未確認',
    en: 'Orientation not established',
  },
  schematicNote: {
    'zh-CN': '示意图：坐标与尺寸为示意，非实测；各分栏间距离不按比例。',
    ja: '模式図：座標と寸法は模式的で実測ではありません。パネル間の距離は縮尺どおりではありません。',
    en: 'Schematic: coordinates and sizes are not surveyed; distances between panels are not to scale.',
  },
  route: { 'zh-CN': '站内路线', ja: '構内ルート', en: 'Indoor route' },
  from: { 'zh-CN': '起点', ja: '出発', en: 'From' },
  to: { 'zh-CN': '终点', ja: '到着', en: 'To' },
  choosePlace: { 'zh-CN': '选择地点…', ja: '場所を選択…', en: 'Choose a place…' },
  standardMode: { 'zh-CN': '标准', ja: '標準', en: 'Standard' },
  stepFreeMode: { 'zh-CN': '无台阶', ja: '段差なし', en: 'Step-free' },
  search: { 'zh-CN': '查找路线', ja: 'ルート検索', en: 'Find route' },
  clear: { 'zh-CN': '清除', ja: 'クリア', en: 'Clear' },
  swap: { 'zh-CN': '交换', ja: '入れ替え', en: 'Swap' },
  gatePasses: { 'zh-CN': '通过闸机', ja: '改札通過', en: 'Gates passed' },
  levelChanges: { 'zh-CN': '换层', ja: '階移動', en: 'Floor changes' },
  steps: { 'zh-CN': '步骤', ja: 'ステップ', en: 'Steps' },
  distance: { 'zh-CN': '距离', ja: '距離', en: 'Distance' },
  duration: { 'zh-CN': '用时', ja: '所要時間', en: 'Walking time' },
  inferredLinks: { 'zh-CN': '推断连接', ja: '推定接続', en: 'Inferred links' },
  unconfirmedStepFree: {
    'zh-CN': '无台阶未核实',
    ja: '段差なし未確認',
    en: 'Step-free not confirmed',
  },
  noRoute: { 'zh-CN': '未找到路线', ja: 'ルートが見つかりません', en: 'No route found' },
  'reason.unknown-place': {
    'zh-CN': '地点不在此枢纽模型中。',
    ja: 'この拠点モデルにない場所です。',
    en: 'The place is not part of this hub model.',
  },
  'reason.unreachable': {
    'zh-CN': '已核实模型中不存在可行路线（不穿越车道，不经未核实的跨社闸内连络）。',
    ja: '確認済みモデル内に経路がありません（車路や未確認の他社連絡は通りません）。',
    en: 'No route in the verified model (roadways and unverified cross-operator links are never used).',
  },
  'reason.step-free-unavailable': {
    'zh-CN': '仅能经由楼梯、扶梯或有台阶的通道到达。',
    ja: '階段・エスカレーター・段差のある通路でのみ到達できます。',
    en: 'Reachable only by stairs, escalators or links with steps.',
  },
  details: { 'zh-CN': '设施详情', ja: '施設の詳細', en: 'Details' },
  sources: { 'zh-CN': '来源', ja: '出典', en: 'Sources' },
  showSources: { 'zh-CN': '查看来源', ja: '出典を見る', en: 'View sources' },
  close: { 'zh-CN': '关闭', ja: '閉じる', en: 'Close' },
  fareZone: { 'zh-CN': '区域', ja: '区域', en: 'Fare zone' },
  paid: { 'zh-CN': '闸内', ja: '改札内', en: 'Paid area' },
  unpaid: { 'zh-CN': '闸外', ja: '改札外', en: 'Unpaid area' },
  roadway: { 'zh-CN': '车道（不可步行）', ja: '車路（歩行不可）', en: 'Roadway (not walkable)' },
  stepFree: { 'zh-CN': '无台阶', ja: '段差なし', en: 'Step-free' },
  yes: { 'zh-CN': '是', ja: 'はい', en: 'Yes' },
  no: { 'zh-CN': '否', ja: 'いいえ', en: 'No' },
  geometry: { 'zh-CN': '几何', ja: '形状', en: 'Geometry' },
  'geometry.verified': { 'zh-CN': '实测', ja: '実測', en: 'Surveyed' },
  'geometry.schematic': { 'zh-CN': '示意', ja: '模式', en: 'Schematic' },
  'geometry.unknown': { 'zh-CN': '未知', ja: '不明', en: 'Unknown' },
  connection: { 'zh-CN': '连接', ja: '接続', en: 'Connection' },
  'connection.verified': { 'zh-CN': '已核实', ja: '確認済み', en: 'Verified' },
  'connection.inferred': { 'zh-CN': '推断', ja: '推定', en: 'Inferred' },
  tracks: { 'zh-CN': '番线', ja: '番線', en: 'Tracks' },
  towards: { 'zh-CN': '方向', ja: '方面', en: 'Towards' },
  platformDoors: { 'zh-CN': '站台门', ja: 'ホームドア', en: 'Platform doors' },
  'doors.installed': { 'zh-CN': '已设置', ja: '設置済み', en: 'Installed' },
  'doors.planned': { 'zh-CN': '计划设置', ja: '設置予定', en: 'Planned' },
  'doors.none': { 'zh-CN': '无', ja: 'なし', en: 'None' },
  leadsTo: { 'zh-CN': '通往', ja: '行き先', en: 'Leads to' },
  hours: { 'zh-CN': '开放时间', ja: '営業時間', en: 'Hours' },
  station: { 'zh-CN': '车站', ja: '駅', en: 'Station' },
  externalLines: { 'zh-CN': '相关线路', ja: '関連路線', en: 'Lines here' },
  officialLinks: { 'zh-CN': '官方页面', ja: '公式ページ', en: 'Official pages' },
  licence: { 'zh-CN': '许可', ja: 'ライセンス', en: 'Licence' },
  retrieved: { 'zh-CN': '获取日期', ja: '取得日', en: 'Retrieved' },
  sourceDate: { 'zh-CN': '资料日期', ja: '資料日付', en: 'Source date' },
  dataNature: { 'zh-CN': '数据性质', ja: 'データ種別', en: 'Data nature' },
  webglUnavailable: {
    'zh-CN': '此环境无法使用 WebGL，已显示平面图。',
    ja: 'この環境では WebGL を使えないため、平面図を表示しています。',
    en: 'WebGL is unavailable here; showing the plan instead.',
  },
  selectHint: {
    'zh-CN': '点击平面图或 3D 中的地点查看详情。',
    ja: '平面図または 3D の場所をクリックすると詳細を表示します。',
    en: 'Click a place in the plan or the 3D view for details.',
  },
} as const satisfies Record<string, Record<Locale, string>>;

export type UiStringKey = keyof typeof STRINGS;

export function t(locale: Locale, key: UiStringKey): string {
  return STRINGS[key][locale];
}

const PLACE_KIND: Record<StationPlaceKind, Record<Locale, string>> = {
  platform: { 'zh-CN': '站台', ja: 'ホーム', en: 'Platform' },
  concourse: { 'zh-CN': '大厅', ja: 'コンコース', en: 'Concourse' },
  passage: { 'zh-CN': '通道', ja: '通路', en: 'Passage' },
  entrance: { 'zh-CN': '出入口', ja: '出入口', en: 'Entrance' },
  landing: { 'zh-CN': '升降口', ja: '乗降口', en: 'Landing' },
};

const LINK_KIND: Record<StationLinkKind, Record<Locale, string>> = {
  passage: { 'zh-CN': '步行', ja: '徒歩', en: 'Walk' },
  gate: { 'zh-CN': '闸机', ja: '改札', en: 'Gate' },
  stairs: { 'zh-CN': '楼梯', ja: '階段', en: 'Stairs' },
  escalator: { 'zh-CN': '自动扶梯', ja: 'エスカレーター', en: 'Escalator' },
  elevator: { 'zh-CN': '电梯', ja: 'エレベーター', en: 'Lift' },
};

export function placeKindLabel(locale: Locale, kind: StationPlaceKind): string {
  return PLACE_KIND[kind][locale];
}

export function linkKindLabel(locale: Locale, kind: StationLinkKind): string {
  return LINK_KIND[kind][locale];
}

/** Display text of a name; `null` text means "no name known" (render `<UnknownValue />`). */
export function nameText(names: LocalizedNames, locale: Locale): string | null {
  const resolved = resolveLocalizedName(names, locale);
  return resolved.resolvedLocale === 'unknown' ? null : resolved.text;
}

/** BCP 47 tag for the `lang` attribute of a resolved name. */
export function langTag(locale: Locale): string {
  return locale === 'zh-CN' ? 'zh-Hans' : locale;
}
