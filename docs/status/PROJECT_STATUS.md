# SENKIRO 项目状态

快照时间：2026-11-28T17:35:00+08:00 · 协议 1.1 · 项目 ID `senkiro.main` · 报告：Gemini（主控）

代码基线：`main@e3cba60` · 集成线：`integration/phase-0`（已完整汇合 Wave 0 + Wave 1 三路）。阶段：Phase 0 Wave 2 联调收官（`phase_0_wave2_ready`）。整体进度不估算。

**Wave 0 与 Wave 1 全部四条分支（`P0-W0`、`P0-S1`、`P0-S2`、`P0-S3`）已全部验收合入 `integration/phase-0`**！主控在集成分支绕过 Turbo 缓存（`TURBO_FORCE=true`）实测全仓 **8 个项目** `pnpm check && pnpm build && pnpm test` 全部通过（Biome 194 文件 0 错误 0 警告，279 项单元测试全绿：`contracts` 75 + `domain-core` 47 + `fare-engine` 40 + `local-db` 12 + `station-3d` 40 + `data-stations` 8 + `ui-kit` 27 + `web` 30）。已发布收官联调派单 `P0-W2`（[p0-w2-exit-gate-brief.md](../dispatch/phase-0/p0-w2-exit-gate-brief.md)），完成契约上提、槽位接线与 Playwright E2E 后即达成 **Exit Gate 0**。

## 里程碑

| ID | 事项 | 状态 | 证据 | 人工验收 |
| --- | --- | --- | --- | --- |
| `project_setup` | 立项与 Master Plan v1.0（Gate 0 D-01～D-05 决策锁定） | 完成 | 仓库证据（`main@e3cba60`） | 不需要 |
| `lab_a_archive` | Lab A 归档：`lab/a-tokyo-atlas-fare@9790e55` | 完成 | 仓库证据 + 自报告 | 已收口归档 |
| `lab_b_archive` | Lab B 归档：`lab/b-umeda-3d@b2ed773` | 完成 | 仓库证据 + 自报告（保留 `umeda-*` 未动） | 已收口归档 |
| `lab_c_archive` | Lab C 归档：`lab/c-shinjuku-3d@19b2daa` | 完成 | 仓库证据 + 自报告 | 已收口归档 |
| `lab_scores` | 三原型归档评审（`docs/lab-reports/scores.md`） | 完成 | 仓库证据 | 不需要 |
| `p0_w0_contracts` | Wave 0：Monorepo 根骨架与 `@senkiro/contracts` | **完成** | 主控合入 + 实测 75/75 | 已验收合入 |
| `p0_s1_domain_sqlite` | Wave 1 (`P0-S1`)：`domain-core` (47/47) + `fare-engine` (40/40) + `local-db` (12/12) | **完成** | 主控合入 + 全仓实测通过 | 已验收合入 |
| `p0_s2_station_3d` | Wave 1 (`P0-S2`)：命令式 Three.js `station-3d` (40/40) + `data-stations` (8/8) | **完成** | 主控合入 + 601,364 节点对核验 | 已验收合入 |
| `p0_s3_ui_web_shell` | Wave 1 (`P0-S3`)：`ui-kit` (27/27) + `apps/web` (30/30) | **完成** | **主控合入 + 全仓 8 项目实测通过** | **已验收合入** |
| `p0_w2_exit_gate` | Wave 2 (`P0-W2`)：契约上提、`apps/web` 槽位接线与 Playwright Exit Gate 0 E2E | **待启动** | 派单就绪（`p0-w2-exit-gate-brief.md`） | 待验收 |

## 下一步

1. 新建工作树 `feat/p0-w2-exit-gate`（基于 `integration/phase-0`），分发 `docs/dispatch/phase-0/p0-w2-exit-gate-brief.md` 执行最终联调、COOP/COEP Worker 适配与 Playwright E2E。
2. `P0-W2` 合入并全绿后将 `integration/phase-0` 合并进 `main`，正式启动 **Phase 1（京阪神数据脊梁 + 京都 3D 枢纽）**。

## 依据与验证范围

- 2026-11-28 `P0-S3` 合入验证：在 `E:\SENKIRO\worktrees\integration-phase-0` 绕过 Turbo 缓存（`TURBO_FORCE=true`）实跑 `pnpm install --offline --frozen-lockfile && pnpm check && pnpm build && pnpm test`，全部退出码 `0`；Biome 194 文件 0 错误 0 警告，8 个项目构建通过，Vitest 全仓通过。
- Playwright E2E 与真实硬件 GPU 帧率尚未在集成分支运行，作为 `P0-W2`（Exit Gate 0）核心必验项交付。
- 证据路径见 [project-status.json](./project-status.json) 的 `evidence_refs`。
