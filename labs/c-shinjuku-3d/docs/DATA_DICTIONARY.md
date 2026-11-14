# 数据字典

所有 CSV 都是 UTF-8（无 BOM）、LF 换行；空单元格表示 `null`。JSON 的结构与 CSV 相同，类型定义见 `timetable/adapter/senkiroTimetable.ts`，JSON Schema 见 `timetable/adapter/senkiro_timetable.schema.json`。

## 文件一览（`labs/c-shinjuku-3d/data/shinjuku/`）

| 文件 | 内容 | 可提交 |
| --- | --- | --- |
| `stations.csv` | 12 个契约站点：运营商、线路、日英中名称、站点编码及其核实状态、3D 模型站点 ID | ✔ |
| `station_id_map.csv` | 内部 ID ↔ ODPT ID / 站点编号 / Lab C 模型 ID | ✔ |
| `operators.csv` `lines.csv` `directions.csv` | 运营商、线路、方向 | ✔ |
| `platforms.csv` | 站台/轨道，以 station_id 为命名空间；`model_platform_ref` 指向 3D 模型的岛式站台 | ✔ |
| `calendars.csv` `calendar_dates.csv` | 运营日历定义；2026-11-01～2027-03-31 每天对应的日类型、节假日名和特殊运行标记 | ✔ |
| `services.csv` | 班次（每个 trip 一行） | ✔ |
| `timetable_events.csv` | **站点时刻事件**（正式层：都营 S01/S02/E27/E01，3,018 条） | ✔ |
| `trip_links.csv` | 同一班次在两个目标站之间的连接（S01↔S02，E27↔E01） | ✔ |
| `vehicle_catalog.csv` `trip_vehicle_assignments.csv` | 车型配置（车型×编组）及每班次的车辆判断 | ✔ |
| `sources.csv` | 来源与许可 | ✔ |
| `senkiro_timetable.json` | 前端读取的完整包（正式层） | ✔ |
| `coverage_report.json` `validation_report.json` `legacy_audit_report.json` `v3_scenarios.json` | 报告 | ✔ |
| `local/timetable_events.legacy.csv` `local/timetable_events.all.csv` `local/services.legacy.csv` `local/legacy_crosswalk.csv` `local/senkiro_timetable.full.json` `local/v3_scenarios.local.json` | 旧 CSV 派生的待核实层，以及合并视图 | ✘（gitignored） |

## timetable_events — 核心契约字段（名称固定）

| 字段 | 类型 | 说明 / 合法值 |
| --- | --- | --- |
| `station_id` | string | 12 个契约值之一（见 FABLE_INTEGRATION.md） |
| `operator_id` | string | `jr-east` `odakyu` `keio` `tokyo-metro` `toei` `seibu` |
| `line_id` | string | `<operator>:<slug>`，如 `toei:shinjuku`、`jr-east:chuo-rapid` |
| `platform_id` | string \| null | `<station_id>:track-<番线>`，如 `toei:shinjuku:E27:track-6`。未知时为 **null**，不默认映射到任何轨道 |
| `direction_id` | string \| null | `<line_id>:<slug>`，如 `toei:oedo:inner-loop` |
| `service_date_type` | enum | `weekday` \| `saturday_holiday`（所有来源都只区分这两类，不擅自拆分） |
| `trip_id` | string | 都营：ODPT `owl:sameAs`（如 `odpt.TrainTimetable:Toei.Shinjuku.505T.SaturdayHoliday`）；旧层：`legacy:<sha1>`（合成） |
| `train_number` | string \| null | 运营商列车番号（如 `505T`）。合成 ID 绝不写入此字段 |
| `arrival_time_local` / `departure_time_local` | "HH:MM" \| null | 营业日时刻，可以 ≥ 24（`24:13`）。只有一侧时，另一侧为 null，不推算 |
| `destination_text` | string | 日文原名；ODPT 多目的地用「・」连接 |
| `service_class` | string \| null | 运营商原用种别（都营 ODPT 用「普通」「急行」） |
| `vehicle_series` | string \| null | 如 `10-300`；不能确定时为 null |
| `formation_length` | int \| null | 编组辆数 |
| `vehicle_assignment_status` | enum | `verified` \| `representative` \| `unknown` |
| `source_id` | string | 引用 sources.csv |
| `valid_from` / `valid_until` | date \| null | 数据有效期（都营 = `dct:issued`；结束日期未知） |
| `remarks` | string \| null | 限制条件与不确定性（关键信息另有独立字段） |

## timetable_events — 辅助字段

| 字段 | 说明 |
| --- | --- |
| `stop_event_id` | `<trip_id>@<station_id>`，唯一 |
| `station_complex_id` | `complex:shinjuku` / `complex:seibu-shinjuku` / `complex:shinjuku-sanchome` / `complex:shinjuku-nishiguchi`。只做关联，不合并停靠位置 |
| `service_calendar_id` | 引用 calendars.csv |
| `trip_id_is_synthetic` | 旧层为 true |
| `original_trip_id` / `original_station_code` / `original_line_code` | 源 ID |
| `arrival_time_source` / `departure_time_source` | 源中的原始字符串（ODPT 写 `00:13`，换算后为 `24:13`） |
| `arrival_seconds` / `departure_seconds` | 营业日 00:00 起的秒数（精度为分钟，不编造秒） |
| `time_precision` | `minute` |
| `arrival_departure_type` | `arrival_departure` / `departure_only`（起点或只有出发）/ `arrival_only`（终点，或在源中直通京王后出界） |
| `origin_text` / `destination_text_zh` | 始发站；可选中文显示 |
| `service_class_unified` | `local` `rapid` `express` `limited_express` `liner` `other` |
| `is_origin_at_station` / `is_terminal_at_station` | true / false / **null = 未知或来源矛盾** |
| `through_service_text` | 直通说明，如「京王多摩センター行 京王線へ直通」 |
| `platform_verification_status` | `verified` / `legacy_unverified` / `unknown` |
| `route_pattern_id` | 线路:方向:起点>终点 |
| `vehicle_source_id` / `formation_source_id` | 车辆判断的依据 |
| `source_confidence` | `high`（官方开放数据）/ `medium`（旧记录与官方一致）/ `low` |
| `data_status` | `official` / `legacy_unverified` |
| `last_verified_at` | 最后核对日 |
| 仅本地层：`legacy_duplicate_count` `legacy_csv_lines` `legacy_match_status` `legacy_coupled_group` | 旧文件中的重复次数、行号、与官方的匹配状态、联挂候选组 |

## 跨午夜规则

- 营业日从 04:00 开始。ODPT 的 `00:00`–`03:59` 按前一营业日的 `24:00`–`27:59` 处理。旧 CSV 已经写成 `24:xx`，原样保留。
- 绝对时刻 = 营业日日期 + 秒数，固定按 +09:00 计算（日本没有夏令时），不依赖浏览器时区。`toInstant('2026-11-14', 87180)` 返回 `2026-11-15T00:13:00+09:00`。

## 车辆判断规则（trip_vehicle_assignments）

| 线路 | 规则 | 状态 |
| --- | --- | --- |
| 都营新宿线，番号尾 `T` | 都营车 → 10-300形 10 辆 | representative（尾字母含义是运营惯例，数据集本身没有说明） |
| 都营新宿线，番号尾 `K` | 京王车 → 9000 或 5000 系（无法区分），10 辆 | representative，`vehicle_series = null` |
| 都营大江户线 | 全部编组都是 8 辆；12-000 和 12-600 哪班用哪种不公开 | representative，`vehicle_series = null` |
| 旧层所有线路 | 无依据 | unknown |

没有任何记录标为 `verified`。UI 可以用 `isActualForThisTrain`（只有 verified 才为 true）或 `vehicleLabel()` 显示。
