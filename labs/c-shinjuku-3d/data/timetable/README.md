# data/timetable — 时刻表交接目录

把时刻表文件（`.csv` 和/或 `.json`）放进本目录，重新构建后三维场景就按它驱动列车；
本目录没有可用记录时，页面改用 **Demo Fixture**（`src/timetable/demoFixture.ts`
生成的固定间隔假数据），并在界面上明确标注。两者不会混用。

本原型不生成、不维护任何运营时刻；这里只定义接口。

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
