# data/timetable — 时刻表目录

把时刻表文件（`.csv` 和/或 `.json`）放进本目录，重新构建后三维场景就按它驱动列车；
本目录（以及下面的本地目录）没有可用记录时，页面改用 **Demo Fixture**（`src/timetable/demoFixture.ts`
生成的固定间隔假数据），并在界面上明确标注。两者不会混用。

## 本目录里有什么（会提交、会随仓库公开）

只放许可允许再分发的数据，每个来源都要在 `data/manual/sources.ts` 里有 SourceRecord，且
`redistribution: 'yes'`（`npm run data:build` 会检查）。

| 文件 | 内容 | 来源与许可 |
| --- | --- | --- |
| `toei-odpt.csv`、`toei-odpt.sources.json` | 都营新宿线（新宿 S01、新宿三丁目 S02）、都营大江户线（新宿 E27、新宿西口 E01）的停站记录，平日 + 土休日 | 東京都交通局・公共交通オープンデータ協議会「東京都交通局 列車時刻表」「東京都交通局 駅情報」（CC BY 4.0）を加工して作成。由 `npx tsx scripts/fetch-timetable-odpt.ts` 从 ODPT 免密钥公开接口生成；加工内容：只取四站、03:00 前写成 24:xx、按下一站和方向牌加番线、加站名 |

## 本地目录 `data/raw/timetable/`（不提交）

条款不允许再分发的时刻表放在这里（整个 `data/raw/` 被 `.gitignore` 忽略）。本机构建时一并读入，
界面标“仅本地（不可再分发，不在仓库中）”；别人克隆仓库后不会有这些数据。

- `jreast-shinjuku.csv`：由 `npx tsx scripts/fetch-timetable-jreast.ts` 从 JR 东日本「駅の時刻表」读取的新宿站 JR 时刻
  （成田特快、中央线特急、湘南新宿线、东武直通特急等）。JR 东日本网站利用规约谢绝复制与再分发，
  这是项目方决定的本地私人使用（2026-11-16），绝不提交。脚本会缓存读过的页面（`data/raw/jreast-cache/`），
  `--offline` 只用缓存生成。2026-11-16 读了 137 页后站点断开了本机连接，数据只有一部分（V3-REPORT 第 19 节）。
- `data/raw/jreast-saved/*.html`（同样不提交）：用浏览器手动保存的 JR「デジタル時刻表」（一条线、一个方向、一种日别一页，
  例如 `https://timetables.jreast.co.jp/2611/timetable-v/223u1.html`，`1` = 平日、`2` = 土曜・休日）。页面里每班车在新宿的
  到发时刻和「新宿番線」都有，脚本按「日别 + 车次」与停车站页合并；表里没有番线时，只有山手线（14/15）和中央・総武線各停
  （13/16）按“该方向唯一的站台”补，其余不补、不上轨。
- `npx tsx scripts/fetch-timetable-jreast.ts --digital --interval=20000`：只取这 28 张数字时刻表（每 20 秒一页），存进
  `data/raw/jreast-saved/` 再离线重建；`--only-upstream=東京` 只读东京站的成田特快发车表及其停车站页。只在列出日期开行的
  临时列车不放进平日 / 土休日时刻表。
- `keio-shinjuku.csv`、`odakyu-shinjuku.csv`、`private-sources.json`：由 `npx tsx scripts/import-private-timetables.ts` 从用户交来的
  CSV（放在 `data/raw/private-saved/`）生成。京王有逐班番线；小田急只有站台组，不上轨。京王新线 4 号站台的西行发车与都营的西行到站
  在模拟里合为一班（`mergeComplementaryPlans`）。
- `npx tsx scripts/timetable-coverage.ts`：逐个站台面列出平日 / 周日的班次数和来源，0 / 0 就是没有任何时刻表。

`direction_id`：JR 新宿的记录可写 `southbound` / `northbound`（按前后停车站），列车在通过式番线上按此方向进出。

## 文件

- 任意数量的 `*.csv`：首行为字段名，列顺序不限，多余的列忽略。
- 任意数量的 `*.json`：记录数组，或 `{ "generatedAt": "...", "sources": [...], "records": [...] }`。
- `sources` 条目：`{ id, title, publisher, url, retrievedAt, license, notes }`。
  记录里出现但没有描述的 `source_id` 会被登记为“仅知 id”。
- 示例见 `../timetable-example/demo-fixture.sample.csv`（示例是假数据，不在本目录内，不会被读入）。

## 字段

| 字段 | 说明 |
| --- | --- |
| `station_id` | 规范车站 ID，见下表。各公司的新宿、新宿三丁目、新宿西口互相独立 |
| `operator_id` | `jr-east` / `odakyu` / `keio` / `tokyo-metro` / `toei` / `seibu`，须与车站一致 |
| `line_id` | 规范线路 ID，见下表；也接受 `odpt.Railway:*` 写法 |
| `platform_id` | `<station_id>:<站台/番线号>`，如 `jr-east:shinjuku:14`。为空则无法上轨，不绘制 |
| `direction_id` | 可为空；目前仅保存和显示 |
| `service_date_type` | `weekday` / `saturday` / `holiday` / `saturday-holiday` / `everyday`，或 平日 / 土曜 / 休日 / 土休日 |
| `trip_id` | 可以是内部 ID；不会被当作列车番号显示 |
| `train_number` | 仅在有来源时填写，否则留空 |
| `arrival_time_local` / `departure_time_local` | JST，`HH:MM` 或 `HH:MM:SS`；跨零点写 `24:35`、`25:10`。至少要有一个。没有到站时刻时，动画按 30 秒停站示意并在信息卡标注“假定” |
| `destination_text` / `service_class` | 原文；可为空 |
| `vehicle_series` | 如 `E235系`；可为空 |
| `formation_length` | 节数（整数）；未知留空 —— 不会按 10 节假定 |
| `vehicle_assignment_status` | `verified` / `representative` / `unknown`。`vehicle_series` 为空时必须是 `unknown` |
| `source_id` | 必填。以 `demo:` 开头的来源只允许出现在 Demo Fixture |
| `valid_from` / `valid_until` | `YYYY-MM-DD`，可为空 |
| `remarks` | 可为空 |

空单元格、`null`、`-`、`不明`、`未知` 都读作空值。校验规则在 `src/timetable/validate.ts`：
有 error 的记录不进入模拟，warning 只提示。

## 车站 ID（`src/timetable/registry.ts`）

| `station_id` | `station_complex_id` | 模型内车站 |
| --- | --- | --- |
| `jr-east:shinjuku` | `shinjuku` | `sk:station:jr-east-shinjuku` |
| `odakyu:shinjuku` | `shinjuku` | `sk:station:odakyu-shinjuku` |
| `keio:shinjuku` | `shinjuku` | `sk:station:keio-shinjuku` |
| `keio:shinjuku-newline` | `shinjuku` | `sk:station:keio-new-line-shinjuku`（4 番线） |
| `tokyo-metro:shinjuku:M08` | `shinjuku` | `sk:station:tokyo-metro-shinjuku` |
| `toei:shinjuku:S01` | `shinjuku` | `sk:station:keio-new-line-shinjuku`（5 番线，京王管理站） |
| `toei:shinjuku:E27` | `shinjuku` | `sk:station:toei-oedo-shinjuku` |
| `seibu:seibu-shinjuku` | `seibu-shinjuku` | `sk:station:seibu-shinjuku` |
| `tokyo-metro:shinjuku-sanchome:M09` | `shinjuku-sanchome` | `sk:station:tokyo-metro-shinjuku-sanchome` |
| `tokyo-metro:shinjuku-sanchome:F13` | `shinjuku-sanchome` | `sk:station:tokyo-metro-shinjuku-sanchome` |
| `toei:shinjuku-sanchome:S02` | `shinjuku-sanchome` | `sk:station:toei-shinjuku-sanchome` |
| `toei:shinjuku-nishiguchi:E01` | `shinjuku-nishiguchi` | `sk:station:toei-shinjuku-nishiguchi` |

## 线路 ID

`jr-east:yamanote`、`jr-east:chuo-rapid`、`jr-east:chuo-sobu-local`、`jr-east:saikyo`、
`jr-east:shonan-shinjuku`、`jr-east:chuo-limited-express`、`jr-east:narita-express`、
`jr-east:tobu-through-limited-express`、`odakyu:odawara`、`keio:keio`、`keio:keio-new`、
`tokyo-metro:marunouchi`、`tokyo-metro:fukutoshin`、`toei:shinjuku`、`toei:oedo`、`seibu:shinjuku`。

未登记的 `line_id` 只产生 warning：列车照常绘制，但不带线路色。
