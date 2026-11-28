# SENKIRO 项目状态

快照时间：2026-11-28T12:20:00+08:00 · 协议 1.1 · 项目 ID `senkiro.main` · 报告：Gemini（主控）

代码基线：`main@e3cba60` · 集成线：`integration/phase-0`（挂载于独立主控工作树 `worktrees/integration-phase-0`）。阶段：正式开发启动（`phase_0_dispatched`）。整体进度不估算。

Gate 0 五大立项决策（`D-01` ～ `D-05`）与 `Master Plan v1.0` 已在 `main@e3cba60` 锁定。SENKIRO Lab A / B / C 三座先行原型已分别收拢归档至 `lab/a-tokyo-atlas-fare`、`lab/b-umeda-3d`、`lab/c-shinjuku-3d`（已完成归档评审 `docs/lab-reports/scores.md`），冗余 Lab A/C 临时工作树已清理并完成本地原始数据备份。`docs/01-domain-contract-v1.0.md` 与 Phase 0 Wave 0 / Wave 1 四份自包含派单书已全部落盘就绪，等待手动新建工作树启动 `P0-W0`。

## 里程碑

| ID | 事项 | 状态 | 证据 | 人工验收 |
| --- | --- | --- | --- | --- |
| `project_setup` | 立项与 Master Plan v1.0（Gate 0 D-01～D-05 决策锁定） | 完成 | 仓库证据（`main@e3cba60`） | 不需要 |
| `lab_a_archive` | Lab A 归档：东京 40 线地图 + 双版本 6 态 JR 运价 + 3D 都市地下网（`lab/a-tokyo-atlas-fare@9244196`） | 完成 | 仓库证据 + 自报告（注：主目录另有并发视觉微调未入此次快照） | 已收口归档 |
| `lab_b_archive` | Lab B 归档：大阪・梅田 7 站 3D/2D + 9 款关西车型 + 三语外链（`lab/b-umeda-3d@b2ed773`） | 完成 | 仓库证据 + 自报告（保留 `umeda-b`/`umeda-sol`/`umeda-handoff` 未动） | 已收口归档 |
| `lab_c_archive` | Lab C 归档：新宿 10 层 3D/2D + 大新宿时刻表管线合入（`lab/c-shinjuku-3d@19b2daa`） | 完成 | 仓库证据 + 自报告 | 已收口归档 |
| `lab_scores` | 三原型归档评审与迁移映射报告（`docs/lab-reports/scores.md`） | 完成 | 仓库证据 | 不需要 |
| `phase0_contract_and_dispatch` | 全域领域契约 `v1.0`、交接规程与 Phase 0 四路派单体系 | 完成 | 仓库证据（`integration/phase-0`） | 待执行派单 |
| `p0_w0_contracts` | Wave 0：Monorepo 根骨架（pnpm + Turborepo + Biome + TS strict）与 `@senkiro/contracts` | 未开始 | 派单就绪（`p0-w0-contracts-brief.md`） | 待验收 |
| `p0_wave1_parallel` | Wave 1 三路并行：`P0-S1`（领域+SQLite）、`P0-S2`（命令式 3D）、`P0-S3`（UI-Kit+Web 壳） | 未开始 | 待 `P0-W0` 合入后并行启动 | 待验收 |

## 当前卡点与并发工作区提醒

- **主目录并发会话隔离**：`E:\SENKIRO` 主目录当前处于 `lab/a-tokyo-atlas-fare` 分支进行额外城市海岸线微调，故 `integration/phase-0` 独立挂载于 `E:\SENKIRO\worktrees\integration-phase-0` 避免干扰。
- **Lab B 保留目录未触碰**：`labs/_worktrees/umeda-b`、`labs/_worktrees/umeda-sol`、`E:\Workteree\SENKIRO\umeda-handoff-ab4a62` 保持原样未改动。
- **商业数据许可边界（已按 D-03 锁定）**：Phase 1–5 零商业 API 订阅，仅使用公开可再分发数据与人工核对官方规则条文；受限网页时刻表仅本地 `.gitignore` 隔离，商业 API 统一在 Phase 6 引入。

## 下一步（Wave 0 → Wave 1）

1. **立即启动 `P0-W0`**：手动创建工作树 `feat/p0-w0-contracts`（基于 `integration/phase-0`），粘贴 `docs/dispatch/phase-0/p0-w0-contracts-brief.md` 提示词启动执行。
2. **合入 `P0-W0` 后并发启动 Wave 1**：回主控合入 `feat/p0-w0-contracts` 后，同时新建 `P0-S1`、`P0-S2`、`P0-S3` 三个工作树并行推进。
3. **完成 Exit Gate 0**：三路均合入 `integration/phase-0` 后由主控联调接线并全量验收 `pnpm check && pnpm build && pnpm test`。

## 依据与验证范围

- 2026-11-28 生成 Phase 0 启动快照：核对 Git 分支拓扑、工作树状态、开源合规文件索引与各原型既有自报告；**未重跑各原型的构建或测试（`tests_rerun=false`）**。
- 证据路径见 [project-status.json](./project-status.json) 的 `evidence_refs`。
