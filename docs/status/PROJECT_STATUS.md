# SENKIRO 项目状态

快照时间：2026-11-28T12:54:00+08:00 · 协议 1.1 · 项目 ID `senkiro.main` · 报告：Gemini（主控）

代码基线：`main@e3cba60` · 集成线：`integration/phase-0`（已合入 Wave 0 `feat/p0-w0-contracts@0af4bcf`）。阶段：Phase 0 Wave 1 并行启动（`phase_0_wave1_ready`）。整体进度不估算。

Gate 0 五大立项决策（`D-01` ～ `D-05`）与 `Master Plan v1.0` 已在 `main@e3cba60` 锁定。SENKIRO Lab A / B / C 三座先行原型已归档至三条只读基准分支并完成评审 `docs/lab-reports/scores.md`。**Wave 0（`P0-W0`：pnpm + Turborepo + Biome + TypeScript 7.0.2 + `@senkiro/contracts`）已完成并合入 `integration/phase-0`**，主控在集成分支绕过 Turbo 缓存实测 `pnpm check`、`pnpm build`、`pnpm test`（8 文件 **75/75** 测试）全绿通过。已同步 `docs/01-domain-contract-v1.0.md` 与三份 Wave 1 派单书，正式放行 `P0-S1` / `P0-S2` / `P0-S3` 三路并行开发。

## 里程碑

| ID | 事项 | 状态 | 证据 | 人工验收 |
| --- | --- | --- | --- | --- |
| `project_setup` | 立项与 Master Plan v1.0（Gate 0 D-01～D-05 决策锁定） | 完成 | 仓库证据（`main@e3cba60`） | 不需要 |
| `lab_a_archive` | Lab A 归档：东京 40 线地图 + 双版本 6 态 JR 运价 + 3D 都市地下网（`lab/a-tokyo-atlas-fare@9244196`） | 完成 | 仓库证据 + 自报告（注：主目录另有并发视觉微调未入此次快照） | 已收口归档 |
| `lab_b_archive` | Lab B 归档：大阪・梅田 7 站 3D/2D + 9 款关西车型 + 三语外链（`lab/b-umeda-3d@b2ed773`） | 完成 | 仓库证据 + 自报告（保留 `umeda-b`/`umeda-sol`/`umeda-handoff` 未动） | 已收口归档 |
| `lab_c_archive` | Lab C 归档：新宿 10 层 3D/2D + 大新宿时刻表管线合入（`lab/c-shinjuku-3d@19b2daa`） | 完成 | 仓库证据 + 自报告 | 已收口归档 |
| `lab_scores` | 三原型归档评审与迁移映射报告（`docs/lab-reports/scores.md`） | 完成 | 仓库证据 | 不需要 |
| `phase0_contract_and_dispatch` | 全域领域契约 `v1.0`、交接规程与 Phase 0 四路派单体系 | 完成 | 仓库证据（`integration/phase-0`） | 不需要 |
| `p0_w0_contracts` | Wave 0：Monorepo 根骨架（pnpm + Turborepo + Biome + TS 7.0.2 strict）与 `@senkiro/contracts` | **完成** | **主控合入 + 实测通过（75/75 Vitest，0 警告）** | **已验收合入** |
| `p0_wave1_parallel` | Wave 1 三路并行：`P0-S1`（领域+SQLite）、`P0-S2`（命令式 3D）、`P0-S3`（UI-Kit+Web 壳） | **待启动** | 派单书已与 Wave 0 对齐就绪 | 待验收 |

## 当前卡点与并发工作区提醒

- **主目录并发会话隔离**：`E:\SENKIRO` 主目录当前处于 `lab/a-tokyo-atlas-fare` 分支进行额外城市海岸线微调，故 `integration/phase-0` 独立挂载于 `E:\SENKIRO\worktrees\integration-phase-0` 避免干扰。
- **Lab B 保留目录未触碰**：`labs/_worktrees/umeda-b`、`labs/_worktrees/umeda-sol`、`E:\Workteree\SENKIRO\umeda-handoff-ab4a62` 保持原样未改动。
- **商业数据许可边界（已按 D-03 锁定）**：Phase 1–5 零商业 API 订阅，仅使用公开可再分发数据与人工核对官方规则条文；受限网页时刻表仅本地 `.gitignore` 隔离，商业 API 统一在 Phase 6 引入。

## 下一步（Wave 1 三路并行）

1. **同时启动 `P0-S1` / `P0-S2` / `P0-S3`**：基于最新 `integration/phase-0` 同时创建三个工作树，分别粘贴三份派单书顶部的提示词并发推进。
2. **增量合并与 Exit Gate 0**：三路各自提交 `READY_FOR_MERGE` 交接报告后依次回主控合入 `integration/phase-0`，由主控完成 `<StationExplorer />` 与 `local-db` 在 `apps/web` 的联调接线，并跑通全仓 `pnpm check && pnpm build && pnpm test` 与浏览器验收。

## 依据与验证范围

- 2026-11-28 Wave 0 合入验证：在 `E:\SENKIRO\worktrees\integration-phase-0` 绕过 Turbo 缓存（`TURBO_FORCE=true`）真实执行 `pnpm install --frozen-lockfile && pnpm check && pnpm build && pnpm test`，退出码均为 `0`，`@senkiro/contracts` 8 个文件 **75/75** 测试全部通过。
- 先前 Lab A / B / C 归档记录保持只读转述，未重跑原型独立测试。
- 证据路径见 [project-status.json](./project-status.json) 的 `evidence_refs`。
