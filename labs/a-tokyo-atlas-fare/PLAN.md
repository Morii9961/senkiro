# PLAN — SENKIRO Lab · Tokyo Atlas & Fare

## 1. 目标与核心命题
在 `labs/a-tokyo-atlas-fare/` 构建一个可运行的 Web 原型：基于**同一套车站、线路与轨道区段实体**，同时支撑东京铁道交互地图（地理视图 + 立体分层视图 + 条形线路图）与规则驱动、可解释的 JR 运价引擎。地图点选即为运价输入，计费路径与实际乘车路径双向回绘到地图上。

## 2. 数据策略与许可边界
- **主网络数据（非 share-alike）**：
  1. **国土数値情報 鉄道データ N02（MLIT）**（公共データ利用規約 1.0 / CC BY 4.0 互換）：东京 23 区及 JR 运价切片（大宫—都心—热海—三岛、八王子/八高线）的轨道几何与车站坐标。
  2. **ODPT 公开端点（`api-public.odpt.org`，无密钥）**：都营地下铁 GTFS / 公开静态数据（CC BY 4.0），用于跨来源对齐测试与官方站号/英名/站序。
  3. **人工核实官方元数据（`manual-verified`）**：JR 営業キロ、主要站英/假名与站号、换乘复合体（区分改札内/改札外，未核实标未知）、直通运营关系（如千代田线↔JR常磐缓行↔小田急、都营浅草线↔京急↔京成）。
  4. **地理院タイル（国土地理院）**：无密钥底图（CC BY 4.0 互換），离线时优雅降级。
- **独立 ODbL 数据集（隔离存放）**：
  - **OpenStreetMap（Overpass API，ODbL 1.0，share-alike）**：仅提取 `tunnel` / `bridge` / `layer` 派生 `verticalClass` 与 `verticalOrder`，写入独立文件 `data/processed/osm-vertical.json`，绝不与主库混合。
- **运价费率策略（诚实性优先）**：
  - 采用**规则验证演示模式（`synthetic` 费率表）**，在数据、代码与 UI 三处醒目标注「示例数据，不可作为实际购票金额」，同时提供 `FareTariffProvider` 接口供未来接入授权费率服务。

## 3. 架构分层
- `src/domain/`（纯 TypeScript，零 React 依赖）：
  - 契约实体类型（`Operator`, `RailLine`, `TrackSegment`, `Station`, `StationComplex`, `Interchange`, `ServicePattern`, `ThroughService`, `FareRule`, `FareProduct`, `FareQuote`, `SourceRecord`）
  - **三图分离**：轨道拓扑图（`TrackGraph`）、运营服务图（`ServiceGraph`）、计费规则图（`FareRuleGraph`）
  - 跨来源对齐模块（`alignment.ts`）：KSJ ↔ ODPT ↔ 官方核实表映射到 `sk:` ID，未对齐项显式保留
  - 版本化 JR 运价规则引擎（`fareEngine.ts`）：支持按乘车日期切换规则版本（含 2026-03-14 改定前后差异）、基础运费与地方交通线拒算、第69条特定区間、第156/157条大都市近郊区間、第16条の2幹在同一視及例外、附加费层（Should #17），严格区分 6 种状态码（`OK` / `NOT_APPLICABLE` / `MISSING_DATA` / `UNSUPPORTED` / `STALE_RULE` / `ERROR`）
- `src/providers/`：数据源适配器（`StaticAtlasProvider`, `SyntheticFareTariffProvider`, `OdptRealtimeProvider` 无密钥显式降级为「无实时数据」）
- `scripts/data-build.mjs`（`npm run data:build`）：从 `data/raw/` 与核实表可复现生成 `data/processed/`
- `src/ui/`（React + MapLibre GL JS）：地理地图 + 3D 立体分层视图 + 条形线路图、筛选/搜索、站线详情、覆盖面板、运价计算器 + 解释树 + 双路径对比高亮、日英双语 + 深浅色 + 键盘可达。

## 4. 纵向切片与里程碑
1. **M1 项目脚手架与真实数据管线**：初始化 Vite + React + TS(strict) + Vitest + Playwright；拉取并核实 KSJ N02、ODPT Toei 公开数据与 OSM 纵向标签；跑通 `npm run data:build` 与数据一致性测试。
2. **M2 领域模型与 JR 运价引擎**：实现三图分离、对齐器、版本化规则引擎与 ≥25 条 Vitest 单元测试。
3. **M3 地图与运价联动 UI**：MapLibre 地理视图、搜索/筛选、站线详情、覆盖面板、地图选站→计费→解释树→双路径高亮。
4. **M4 Should 增强与端到端验证**：附加费层、条形线路图、3D 立体分层视图（ODbL 隔离）、实时数据插槽、Playwright 交互测试（≥6 条）、完善 `DECISIONS.md`、`SOURCES.md`、`README.md`、`REPORT.md`。
