# SENKIRO 项目状态

快照时间：2026-11-28T16:53:00+08:00 · 协议 1.1 · 项目 ID `senkiro.main` · 报告：Gemini（主控）

代码基线：`main@e3cba60` · 集成线：`integration/phase-0`（已合入 `P0-W0` 与 `P0-S2`）。阶段：Phase 0 Wave 1 增量收口（`phase_0_wave1_partial_merged`）。整体进度不估算。

**`P0-S2`（`@senkiro/station-3d` + `@senkiro/data-stations` 梅田 7 站 & 新宿 10 站）已完成并增量合入 `integration/phase-0`**，主控在集成分支绕过 Turbo 缓存（`TURBO_FORCE=true`）实测 `pnpm check && pnpm build && pnpm test` 全绿通过（14 个测试文件 **123/123** 通过：`contracts` 75 + `station-3d` 40 + `data-stations` 8；真实 GPU 帧率、浏览器渲染画面与 Expo WebView 待下游实测）。`P0-S1` 已完成 M2 `fare-engine` 并正在推进 M3 `local-db`；`P0-S3` 维持 M1 `ui-kit`（27/27）等待 Claude 续跑 M2/M3 `apps/web`。

## 里程碑

| ID | 事项 | 状态 | 证据 | 人工验收 |
| --- | --- | --- | --- | --- |
| `project_setup` | 立项与 Master Plan v1.0（Gate 0 D-01～D-05 决策锁定） | 完成 | 仓库证据（`main@e3cba60`） | 不需要 |
| `lab_a_archive` | Lab A 归档：`lab/a-tokyo-atlas-fare@9244196` | 完成 | 仓库证据 + 自报告（主目录保留并发微调） | 已收口归档 |
| `lab_b_archive` | Lab B 归档：`lab/b-umeda-3d@b2ed773` | 完成 | 仓库证据 + 自报告（保留 `umeda-*` 未动） | 已收口归档 |
| `lab_c_archive` | Lab C 归档：`lab/c-shinjuku-3d@19b2daa` | 完成 | 仓库证据 + 自报告 | 已收口归档 |
| `lab_scores` | 三原型归档评审（`docs/lab-reports/scores.md`） | 完成 | 仓库证据 | 不需要 |
| `p0_w0_contracts` | Wave 0：Monorepo 根骨架与 `@senkiro/contracts` | **完成** | 主控合入 + 实测通过（75/75 Vitest，0 警告） | 已验收合入 |
| `p0_s2_station_3d` | Wave 1 (`P0-S2`)：命令式 Three.js `station-3d` + 梅田/新宿 `data-stations` | **完成** | **主控合入 + 实测全仓 123/123 通过（601,364 节点对不变量核验）** | **已验收合入** |
| `p0_s1_domain_sqlite` | Wave 1 (`P0-S1`)：`domain-core` + `fare-engine` + `local-db` | **进行中** | `feat/p0-domain-sqlite@6eadf35`：M1/M2 已提交，M3 `local-db` 进行中 | 待合入 |
| `p0_s3_ui_web_shell` | Wave 1 (`P0-S3`)：`ui-kit` + `apps/web` | **进行中（`PAUSED_QUOTA`）** | `feat/p0-ui-web-shell@e79424a`：M1 `ui-kit` 27/27 通过；等 Claude 续跑 M2/M3 | 待合入 |

## 待上提契约队列（排入 `P0-W2-wire`）

- `StationHubDataset.planNorth?: PlatformSide`（来自 `P0-S2`）：避免在途改契约扰动 `P0-S1` / `P0-S3`，统一排入三路合入后的 `P0-W2-wire` 升级。

## 下一步

1. 等待 `P0-S1` 完成 M3 `local-db` 并提交 `READY_FOR_MERGE` 报告后回主控验收合入。
2. 等待 `P0-S3` 完成 M2/M3 `apps/web` 并提交 `READY_FOR_MERGE` 报告后回主控验收合入。
3. 执行 `P0-W2-wire` 升级契约、在 `apps/web` 接入 `<StationExplorer />` 与 `local-db` 探针，并完成 `Exit Gate 0`。

## 依据与验证范围

- 2026-11-28 `P0-S2` 合入验证：在 `E:\SENKIRO\worktrees\integration-phase-0` 绕过 Turbo 缓存（`TURBO_FORCE=true`）实跑 `pnpm install --offline --frozen-lockfile && pnpm check && pnpm build && pnpm test`，全部退出码 `0`；3 个包构建通过，14 个测试文件 **123/123** 通过（`contracts` 75、`station-3d` 40、`data-stations` 8）。真实 GPU、浏览器画面及 Expo WebView 尚未实测。
- `P0-S1` 与 `P0-S3` 仅核对工作树 `git status` / `git log` 状态，未重跑其分支测试。
- 证据路径见 [project-status.json](./project-status.json) 的 `evidence_refs`。
