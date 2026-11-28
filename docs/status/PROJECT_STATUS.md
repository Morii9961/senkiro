# SENKIRO 项目状态

快照时间：2026-11-28T22:00:00+08:00 · 协议 1.1 · 项目 ID `senkiro.main` · 报告：Gemini（`P1-Coord` 总控调度）

代码基线：`main@0f7b764`（Exit Gate 0 合入点）→ `integration/phase-1`。阶段：**Phase 1 Wave 1 三路并行派单已就绪**（`phase_1_wave_1_dispatched`）。整体进度不估算。

**Phase 1 Wave 0（`P1-Coord`）已完成并发布至 `integration/phase-1`。** 经核验 `@senkiro/contracts` v1.0（含 `P0-W2` 上提字段）与 `@senkiro/station-3d` 已覆盖 Phase 1 全部接口，**跳过冗余的 `P1-W0` 代码前置波次**，直接放行 `P1-S1`（京阪神 8 社空间管线 + `.pmtiles` + 关东预览区）、`P1-S2`（MapLibre `SENKIRO Atlas` UI + `ui-kit/base.css` 与 Web 遗留修复）、`P1-S3`（京都站四社复合体 3D/2D + Worker/Engine 加固）三路零冲突并行开发；P0-W2 遗留全部 3 项必修与 10 项小改进已按 `ownedPaths` 精确分拣写入对应派单书。

## 里程碑

| ID | 事项 | 状态 | 证据 | 人工验收 |
| --- | --- | --- | --- | --- |
| `project_setup` | 立项与 Master Plan v1.0（Gate 0 D-01～D-05 决策锁定） | 完成 | 仓库证据（`main@e3cba60`） | 不需要 |
| `lab_a_archive` | Lab A 归档：`lab/a-tokyo-atlas-fare@9790e55` | 完成 | 仓库证据 + 自报告 | 已收口归档 |
| `lab_b_archive` | Lab B 归档：`lab/b-umeda-3d@b2ed773` | 完成 | 仓库证据 + 自报告（保留 `umeda-*` 未动） | 已收口归档 |
| `lab_c_archive` | Lab C 归档：`lab/c-shinjuku-3d@19b2daa` | 完成 | 仓库证据 + 自报告 | 已收口归档 |
| `lab_scores` | 三原型归档评审（`docs/lab-reports/scores.md`） | 完成 | 仓库证据 | 不需要 |
| `exit_gate_0` | Exit Gate 0：Phase 0 全部五分支合入 `main@0f7b764`（307/307 单测 + 10/10 E2E） | 完成 | 主控复跑验证 | 已验收 |
| `p1_coord_spec_dispatch` | Phase 1 Wave 0 (`P1-Coord`)：冻结关西 ID / PMTiles / 许可规范并发布 Wave 1/2 派单体系 | **完成** | `docs/02-phase1-atlas-spec.md` + `docs/dispatch/phase-1/README.md` | 不需要 |
| `p1_s1_data_kansai` | Wave 1 (`P1-S1`)：`data-pipeline` + `data-kansai`（8 社 + `.pmtiles` + 关东预览） | 待启动 | [p1-s1-data-kansai-brief.md](../dispatch/phase-1/p1-s1-data-kansai-brief.md) | 待交付 |
| `p1_s2_atlas_ui` | Wave 1 (`P1-S2`)：`SENKIRO Atlas` MapLibre UI + `ui-kit/base.css` 与 Web 修复 | 待启动 | [p1-s2-atlas-ui-brief.md](../dispatch/phase-1/p1-s2-atlas-ui-brief.md) | 待交付 |
| `p1_s3_station_kyoto` | Wave 1 (`P1-S3`)：京都四社复合体 3D/2D 数据包 + Worker/Engine 加固 | 待启动 | [p1-s3-station-kyoto-brief.md](../dispatch/phase-1/p1-s3-station-kyoto-brief.md) | 待交付 |
| `p1_w2_exit_gate_1` | Wave 2 (`P1-W2`)：跨包接线、京都激活与 Exit Gate 1 多浏览器 E2E | 待汇合 | [p1-w2-exit-gate-brief.md](../dispatch/phase-1/p1-w2-exit-gate-brief.md) | 待验收 |

## Phase 1 启动要点（`P1-Coord` 冻结决策）

- **跳过 `P1-W0`**：`packages/contracts` 无需改码；`apps/web` 新增 `AtlasDataSourceSlot` 解耦数据源，Wave 1 三路 `ownedPaths` 零重叠。
- **锁定技术边界**：`maplibre-gl@^5.4.0`（独立懒加载 chunk）+ `pmtiles@^4.3.0`；Windows 无 `tippecanoe`/`duckdb`，由 `packages/data-pipeline` 使用 `geojson-vt` + 纯 TS MVT v2.1 / PMTiles v3 编码器 100% 离线打包；严格遵守 `TypeScript 7.0.2` 与 `Biome 2.6.9`。
- **复合体硬边界**：`sk:complex:kansai:kyoto` 严格仅含 JR西日本 / JR東海 / 近鉄 / 地下鉄烏丸線 4 站；`阪急京都河原町` 与 `京阪祇園四条` 独立归入 `sk:complex:kansai:shijo-kawaramachi` 并写入 `explicitlyExcluded`。
- **Phase 0 工作树清理**：已安全注销并清理 `integration-phase-0` 与 `p0-w2-exit-gate`（及本地已合并分支 `integration/phase-0`、`feat/p0-w2-exit-gate`）；`p0-w0-contracts` 空目录被本机外部进程占用句柄保留未强删。

## 下一步

1. Morii 基于 `integration/phase-1` 创建三个 Wave 1 工作树（`E:\Workteree\SENKIRO\p1-data-kansai`、`p1-atlas-ui`、`p1-station-kyoto`）并粘贴各自派单书启动提示词并行推进。
2. 任一分支报告 `READY_FOR_MERGE` 后回主控执行 `ownedPaths` + 开源合规核验与 `--no-ff` 增量合入；三路全合入后开启 `P1-W2`（Exit Gate 1）。

## 依据与验证范围

- 继承 `main@0f7b764` 的 Exit Gate 0 实跑基线：8 个项目 `pnpm check && pnpm build && pnpm test` 全绿（307/307 Vitest，10/10 Playwright E2E）。本轮 `P1-Coord` 仅编辑并提交 `docs/**` 文档，未修改任何代码包，故未重跑 Phase 0 单测。
- 证据路径见 [project-status.json](./project-status.json) 与 [docs/02-phase1-atlas-spec.md](../02-phase1-atlas-spec.md)。
