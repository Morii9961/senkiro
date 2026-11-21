# SOURCES — SENKIRO Lab · Tokyo Atlas & Fare

所有数据源的结构化登记同时维护于 [data/sources.json](file:///e:/SENKIRO/labs/a-tokyo-atlas-fare/data/sources.json)。

## 1. 数据源与许可登记表（SourceRecords）

| ID | 名称 | 发布者 | 许可 | 商用 | 再分发 | Share-Alike | 取得时间 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `src-ksj-n02-2024` | 国土数値情報 鉄道データ（N02・令和6年度 / 2024年版） | 国土交通省（MLIT） | 公共データ利用規約 1.0 / CC BY 4.0 互換 | yes | yes | false | 2026-11-21 | 车站坐标与线路几何一次基础来源（`N02-24_GML.zip` UTF-8 GeoJSON） |
| `src-odpt-toei-gtfs` | 都営交通 鉄道 GTFS データ（`Toei-Train-GTFS.zip`） | 東京都交通局 / ODPT | CC BY 4.0 | yes | yes | false | 2026-11-21 | 免密钥公开端点 `api-public.odpt.org`；都营地铁站号、英/假名、站序对齐与未照合记录保留 |
| `src-gsi-tiles` | 地理院タイル（淡色地図） | 国土地理院（GSI） | 国土地理院コンテンツ利用規約（CC BY 4.0 互換） | yes | yes | false | 2026-11-21 | 无密钥底图瓦片，离线优雅降级 |
| `src-jr-east-kippu-1101` | JR東日本 きっぷのルール：運賃計算の特例 | 東日本旅客鉄道 | 官方说明页（仅核实规则逻辑，非转载原文/图片） | conditional | no | false | 2026-11-21 | `https://www.jreast.co.jp/kippu/1101.html` |
| `src-jr-east-kippu-1103` | JR東日本 きっぷのルール：大都市近郊区間 | 東日本旅客鉄道 | 官方说明页（仅核实规则逻辑，非转载原文/图片） | conditional | no | false | 2026-11-21 | `https://www.jreast.co.jp/kippu/1103.html` |
| `src-jr-east-ryokaku-2026` | JR東日本 旅客営業規則（2026年3月14日改定反映） | 東日本旅客鉄道 | 官方约款（仅核实条文号与条件） | conditional | no | false | 2026-11-21 | `https://www.jreast.co.jp/ryokaku/`（含 2026-03-14 改定与八高线地方交通线区分） |
| `src-jr-central-rules` | JR東海 旅客営業規則・東海道新幹線/東海道本線営業キロ | 東海旅客鉄道 | 官方说明/约款（仅核实事实与営業キロ） | conditional | no | false | 2026-11-21 | `https://railway.jr-central.co.jp/ticket-rule/` |
| `src-manual-verified-tokyo-ref` | 東京圏主要路线 站名/站号/直通/换乘人工核实表 | SENKIRO Lab（对照各社官方页面） | CC0 1.0（事实元数据整理） | yes | yes | false | 2026-11-21 | 千代田↔常磐↔小田急、浅草↔京急↔京成直通关系、主要枢纽改札内外区分；未核实写 `null`/`unknown` |
| `src-synthetic-fare-tariff` | SENKIRO Lab 合成运价与附加费演示表 | SENKIRO Lab | MIT | yes | yes | false | 2026-11-21 | **仅用于规则验证演示，非官方实时购票价格** |
| `src-osm-overpass-vertical` | OpenStreetMap 铁路纵断标签（`tunnel`/`bridge`/`layer`） | OpenStreetMap Contributors | **ODbL 1.0** | yes | yes | **true** | 2026-11-21 | **物理隔离于独立文件 `data/processed/osm-vertical.json`**，不混入主数据库；仅输出模式 `verticalClass` 与 `verticalOrder`，`elevationM` 均为 `null` |
| `src-osm-urban-3d-chunks` | OpenStreetMap 东京23区都市地理分块（建筑轮廓/高度、主要道路、河川水域、公园） | OpenStreetMap Contributors | **ODbL 1.0** | yes | yes | **true** | 2026-11-21 | **物理隔离于 `public/data/urban-chunks/`**（130 分块、24,216 栋真实建筑、5,574 条主干道、河川与公园）；未标注高度建筑的示意高度标为 `hb="i"`，非官方测量值 |

---

## 2. 规则来源表（JR 运价引擎）

| RuleId | 条文或页面 | 核实日期 | 适用期间 | 说明 |
| --- | --- | --- | --- | --- |
| `JR-ART67-BASE` | JR 旅客営業規則 第67条・第14条（`https://www.jreast.co.jp/ryokaku/`） | 2026-11-21 | `2020-04-01` ～ `2027-03-31` | 实乘路径営業キロ合算与 1 km 未满进位原则 |
| `JR-LOCAL-LINE-UNSUPPORTED` | JR 旅客営業規則 第77条・第84条（地方交通線 換算キロ，`https://www.jreast.co.jp/ryokaku/`） | 2026-11-21 | `2020-04-01` ～ `2027-03-31` | 八高线属地方交通线，需換算キロ；未实现故显式返回 `UNSUPPORTED` |
| `JR-ART69-2` | JR 旅客営業規則 第69条第1項第2号（`https://www.jreast.co.jp/kippu/1101.html`） | 2026-11-21 | `2020-04-01` ～ `2027-03-31` | 日暮里以遠〜赤羽以遠：经尾久（7.6 km）按经王子（7.4 km）计费 |
| `JR-ART69-3` | JR 旅客営業規則 第69条第1項第3号（`https://www.jreast.co.jp/kippu/1101.html`） | 2026-11-21 | `2020-04-01` ～ `2027-03-31` | 赤羽以遠〜大宮以遠：经埼京线戸田公園（18.0 km）按经川口・浦和（17.1 km）计费 |
| `JR-ART69-4` | JR 旅客営業規則 第69条第1項第4号（`https://www.jreast.co.jp/kippu/1101.html`） | 2026-11-21 | `2020-04-01` ～ `2027-03-31` | 品川以遠〜鶴見以遠：经横须贺线西大井（17.8 km）按经大井町・川崎（14.9 km）计费 |
| `JR-ART157-SUBURBAN` | JR 旅客営業規則 第156条・第157条第2項（`https://www.jreast.co.jp/kippu/1103.html`） | 2026-11-21 | `2020-04-01` ～ `2027-03-31` | 东京近郊区間内普通乘车券最短路径计费、当日有效、禁止重复乘车与途中下車 |
| `JR-ART16-2-V2025` | JR 旅客営業規則 第16条の2第1項・第2項（2026年3月13日以前版，`https://www.jreast.co.jp/kippu/1101.html`） | 2026-11-21 | `2020-04-01` ～ `2026-03-13` | 东海道新干线（东京—热海）与东北新干线（东京—大宫）原则视同在来线；品川—小田原间中间站（新横滨）发着/连接属第2项例外（别线扱い） |
| `JR-ART16-2-V2026` | JR 旅客営業規則 第16条の2（2026年3月14日改定版，`https://www.jreast.co.jp/kippu/1101.html`） | 2026-11-21 | `2026-03-14` ～ `2027-03-31` | **重大改定**：东海道新干线（JR东海）东京—热海与东海道本线（JR东日本）改为**别线扱い**；东北新干线（JR东日本）东京—大宫继续视同同一线路 |
| `JR-CROSS-COMPANY-V2025` / `V2026` | JR 东日本 2026年3月14日运价改定跨社规则（`https://www.jreast.co.jp/ryokaku/`） | 2026-11-21 | `2020-04-01` ～ `2027-03-31` | 2026-03-13 前本州三社通算；2026-03-14 起 JR 东日本＋JR 东海跨社分离计算（合成费率演示） |
| `JR-TICKET-IC-UNSUPPORTED` | JR 东日本 Suica / IC 乘车券使用规则（`https://www.jreast.co.jp/suica/use/riding/`） | 2026-11-21 | `2020-04-01` ～ `2027-03-31` | IC 卡与纸券在 1 円运价及路径/大回り规则上存在差异，本原型显式返回 `UNSUPPORTED` |
| `JR-SURCHARGE-*` | JR 旅客営業規則 第125条・第130条（特急・指定席・グリーン・グランクラス） | 2026-11-21 | `2020-04-01` ～ `2027-03-31` | 作为独立 `FareProduct` 附加费层组合（合成费率演示；グランクラス限新干线） |
