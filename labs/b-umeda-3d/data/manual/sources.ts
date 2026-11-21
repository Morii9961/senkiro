import type { SourceRecord } from '../../src/domain/types.ts'
export const checked = '2026-11-21'
const jr = 'JR西日本', metro = 'Osaka Metro', city = '大阪市', hankyu = '阪急電鉄', hanshin = '阪神電気鉄道'
const terms: Record<string, string> = {
  [jr]: 'https://www.jr-odekake.net/use/about.html',
  [metro]: 'https://www.osakametro.co.jp/site_info.php',
  [hankyu]: 'https://www.hankyu.co.jp/sitepolicy/index.html',
  [hanshin]: 'https://hanshin.co.jp/terms/'
}
const metroUrl = 'https://subway.osakametro.co.jp/station_guide/'
const cityUrl = 'https://www.city.osaka.lg.jp/toshikeikaku/'
function record(id: string, publisher: string, title: string, url: string | null, sourceDate: string | null, notes: string): SourceRecord {
  return { id: 'sk:source:'+id, publisher, title, url, sourceDate, notes, retrievedAt: checked,
    license: terms[publisher] ? '运营商网站条款，原作保留权利' : '未确认原作再分发授权',
    licenseUrl: terms[publisher] ?? null, commercialUse: 'unknown', redistribution: terms[publisher] ? 'no' : 'unknown',
    shareAlike: 'unknown', attributionText: publisher+' · '+title }
}
export const sources: SourceRecord[] = [
  record('jr-index',jr,'大阪駅 構内図・のりば案内','https://eki.jr-odekake.net/premises?id=0610130','2026-01-14','日期是所链接图版日期。线路与番线摘录自のりば案内。'),
  record('jr-map',jr,'大阪駅 構内図（全8頁）','https://eki.jr-odekake.net/premises/0610130_a3bc6bfc-640f-41db-8c67-a99428b100e7.pdf','2026-01-14','PDF 页2–5 既有区、页7–8 西口及地下区。字母是图内索引。原图仅供查阅。'),
  record('jr-access',jr,'大阪駅 バリアフリー情報','https://eki.jr-odekake.net/barrierfree?id=0610130',null,'按改札与番线核实无台阶路线；具体停层来自构内图。'),
  record('city-b',city,'梅田 各鉄道駅間の乗り換え経路 B',cityUrl+'cmsfiles/contents/0000369/369380/umeda04-1%28202606%29.pdf','2026-06','B 段明确横道、⑥号电梯与中北東改札。⑥是图内编号。'),
  record('city-index',city,'交通バリアフリーマップ',cityUrl+'page/0000369380.html','2026-06','梅田图组的更新月份。以 PDF 内标题识别路线。'),
  record('metro-access',metro,'梅田 構内設備・バリアフリー経路',metroUrl+'m/m16/index.php',null,'1番線路线3–6明确中北東改札、坡道、电梯。'),
  record('metro-map',metro,'梅田 構内図',metroUrl+'station/M16_%E6%A2%85%E7%94%B0_%E6%A7%8B%E5%86%85%E5%9B%B3_1.pdf',null,'站厅、岛式站台分区、坡道及电梯。'),
  record('metro-exits',metro,'梅田 出入口',metroUrl+'m/m16/map.php',null,'不同出口分别指向 JR 与周边设施。'),
  record('higashi',metro,'東梅田 構内設備',metroUrl+'T/t20/index.php',null,'独立站；有出入口关闭提示。'),
  record('higashi-exits',metro,'東梅田 出入口',metroUrl+'T/t20/map.php',null,'仅作边界核对。'),
  record('nishi',metro,'西梅田 構内設備',metroUrl+'Y/y11/index.php',null,'独立站。'),
  record('nishi-exits',metro,'西梅田 出入口',metroUrl+'Y/y11/map.php',null,'仅作边界核对。'),
  record('hankyu',hankyu,'大阪梅田 駅情報','https://www.hankyu.co.jp/station/umeda.html',null,'确认与阪神同名异站。'),
  record('hankyu-map',hankyu,'大阪梅田 構内図','https://rail.hankyu.co.jp/station/pdf/map/umeda.pdf','2024-09','历史图版，只用来核对范围。'),
  record('hankyu-lift',hankyu,'大阪梅田 乗降位置・エレベーター','https://www.hankyu.co.jp/station/umeda_ev.html','2019-12','电梯指南自身标注的月份。'),
  record('hanshin',hanshin,'大阪梅田 駅情報','https://www.hanshin.co.jp/station/umeda.html',null,'设施表、周边地下街。'),
  record('hanshin-map',hanshin,'大阪梅田 構内案内図','https://www.hanshin.co.jp/uploads/guidemap/umeda.pdf','2024-06-13','历史图版；不用于本模型的路径。'),
  record('odpt','ODPT','公共交通オープンデータセンター 目录','https://ckan.odpt.org/dataset',null,'各数据集许可不同；未核实可用于本站的 indoor pathways 数据。'),
  record('odpt-challenge','ODPT','挑战赛限定许可的数据集','https://ckan.odpt.org/dataset/?license_id=odpt-ptodcll',null,'目录列出的东京站等步行网络受 Challenge Limited License 约束；无梅田授权依据。'),
  record('odpt-access','ODPT','开发者站','https://developer.odpt.org/',null,'注册/API key 与使用规约独立于再分发许可。'),
  {...record('shin-osaka','国土交通省 / e-Gov','歩行空間ネットワークデータ 新大阪地区','https://data.e-gov.go.jp/data/dataset/8e75df8b-305a-41a4-ac8c-f60edfbbd40d/resource/be0573d8-a04e-4bd9-a20f-a1d04db6c6f6',null,'索引摘要；地域为新大阪，不覆盖本项目。未下载。'), license:'政府標準利用規約 第2.0版（目录所示）'},
  {...record('fixture','SENKIRO Lab','Synthetic platform service fixture',null,null,'本地固定示例。时间戳为 2000 年；无外部实时数据。'),license:'Repository license',redistribution:'yes',commercialUse:'yes'},
  ...Object.entries(terms).map(([name,url],i)=>record('terms-'+i,name,'网站使用条款',url,null,'仅用于网站内容许可核对。'))
]
