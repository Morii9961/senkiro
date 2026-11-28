# SENKIRO 项目状态

快照时间：2026-11-28T16:18:00+08:00 · 协议 1.1 · 项目 ID `senkiro.main` · 报告：Gemini（主控）

代码基线：`main@e3cba60` · 集成线：`integration/phase-0`（已合入 Wave 0 `feat/p0-w0-contracts`）。阶段：Phase 0 Wave 1 配额接力期（`phase_0_wave1_relay`）。整体进度不估算。

Wave 0（`P0-W0`）已合入 `integration/phase-0`（`75/75` 通过）。Wave 1 三路（`P0-S1` / `P0-S2` / `P0-S3`）在 Claude 会话先后完成各自 M1 阶段后因滚动配额耗尽进入 `PAUSED_QUOTA`。主控已完成三方交接报告与 `Contract Requests` 审定，为 **`P0-S1` 与 `P0-S2` 生成了 Codex 专属接力派单书**（内嵌官方 KSJ N02-24 17 站精确坐标与架构裁定）；`P0-S3` 暂维持 M1 检查点等待 Claude 窗口恢复。

## 里程碑

| ID | 事项 | 状态 | 证据 | 人工验收 |
| --- | --- | --- | --- | --- |
| `project_setup` | 立项与 Master Plan v1.0（Gate 0 D-01～D-05 决策锁定） | 完成 | 仓库证据（`main@e3cba60`） | 不需要 |
| `lab_a_archive` | Lab A 归档：`lab/a-tokyo-atlas-fare@9244196` | 完成 | 仓库证据 + 自报告（主目录保留并发微调） | 已收口归档 |
| `lab_b_archive` | Lab B 归档：`lab/b-umeda-3d@b2ed773` | 完成 | 仓库证据 + 自报告（保留 `umeda-*` 未动） | 已收口归档 |
| `lab_c_archive` | Lab C 归档：`lab/c-shinjuku-3d@19b2daa` | 完成 | 仓库证据 + 自报告 | 已收口归档 |
| `lab_scores` | 三原型归档评审（`docs/lab-reports/scores.md`） | 完成 | 仓库证据 | 不需要 |
| `p0_w0_contracts` | Wave 0：Monorepo 根骨架与 `@senkiro/contracts` | **完成** | 主控合入 + 实测通过（75/75 Vitest，0 警告） | 已验收合入 |
| `p0_s1_domain_sqlite` | Wave 1 (`P0-S1`)：`domain-core` + `fare-engine` + `local-db` | **进行中（`PAUSED_QUOTA`）** | `feat/p0-domain-sqlite@da56d34`：M1 `domain-core` 47/47 通过；待 Codex 接力 M2/M3 | 待合入 |
| `p0_s2_station_3d` | Wave 1 (`P0-S2`)：`station-3d` + `data-stations` | **进行中（`PAUSED_QUOTA`）** | `feat/p0-station-3d@df77a7e`：M1 图/寻路/2D 31/31 单测通过（待清 7 条 Biome）；待 Codex 接力 | 待合入 |
| `p0_s3_ui_web_shell` | Wave 1 (`P0-S3`)：`ui-kit` + `apps/web` | **进行中（`PAUSED_QUOTA`）** | `feat/p0-ui-web-shell@e79424a`：M1 `ui-kit` 27/27 通过；等 Claude 续跑 M2/M3 | 待合入 |

## 主控裁定与当前卡点

- **P0-S1 运价扩展钩子裁定**：在 `@senkiro/fare-engine` 内定义 `FareEngineRulePack extends RegionalFareRulePack` 承载附加钩子，M3 后随报告建议上提至 `@senkiro/contracts`。
- **P0-S2 坐标与朝向裁定**：正式启用官方 `MLIT KSJ N02-24`（`sk:source:jp:mlit-ksj-n02-24`，CC BY 4.0 互换），梅田 7 站 + 新宿 10 站精确质心坐标已写入 `p0-s2-codex-relay.md`；`planNorth` 为可选 Prop 并由 `@senkiro/data-stations` 导出元数据；梅田站台线路关联同时读取 `services.json`。

## 下一步（Codex 接力启动）

1. 在 Codex 打开既有工作树 `E:\Workteree\SENKIRO\p0-domain-sqlite`，粘贴 `docs/dispatch/phase-0/p0-s1-codex-relay.md` 提示词续跑 M2 + M3。
2. 在 Codex 打开既有工作树 `E:\Workteree\SENKIRO\p0-station-3d`，粘贴 `docs/dispatch/phase-0/p0-s2-codex-relay.md` 提示词完成 M1 收尾 + M2 + M3。
3. 待 `P0-S3` 恢复并三路全部达 `READY_FOR_MERGE` 后回主控合入 `integration/phase-0` 并验收 `Exit Gate 0`。

## 依据与验证范围

- 2026-11-28 核对 `E:\Workteree\SENKIRO\p0-domain-sqlite`、`p0-station-3d`、`p0-ui-web-shell` Git 日志、交接报告、`N02-24_Station.geojson` 坐标与 `p0-station-3d` Biome 检查输出；未在各子工作树重跑测试（`tests_rerun = false`）。
- 证据路径见 [project-status.json](./project-status.json) 的 `evidence_refs`。
