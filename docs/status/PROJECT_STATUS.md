# SENKIRO 项目状态

快照时间：2026-11-28T16:58:00+08:00 · 协议 1.1 · 项目 ID `senkiro.main` · 报告：Gemini（主控）

代码基线：`main@e3cba60` · 集成线：`integration/phase-0`（已合入 `P0-W0`、`P0-S2`、`P0-S1`）。阶段：Phase 0 Wave 1 收尾期（仅余 `P0-S3`）。整体进度不估算。

**`P0-S1`（`@senkiro/domain-core` + `@senkiro/fare-engine` + `@senkiro/local-db`）已完成并合入 `integration/phase-0`**（锁文件由 `pnpm` 自动消解）。主控在集成分支绕过 Turbo 缓存（`TURBO_FORCE=true`）实测全仓 6 个包 `pnpm check && pnpm build && pnpm test` 全绿通过（Biome 125 文件 0 错误 0 警告，22 个测试文件 **222/222** 通过：`contracts` 75 + `domain-core` 47 + `fare-engine` 40 + `local-db` 12 + `station-3d` 40 + `data-stations` 8）。Wave 1 仅剩 `P0-S3`（`apps/web` M2/M3）待收口，随后即可执行 `P0-W2-wire` 联调并达成 Exit Gate 0。

## 里程碑

| ID | 事项 | 状态 | 证据 | 人工验收 |
| --- | --- | --- | --- | --- |
| `project_setup` | 立项与 Master Plan v1.0（Gate 0 D-01～D-05 决策锁定） | 完成 | 仓库证据（`main@e3cba60`） | 不需要 |
| `lab_a_archive` | Lab A 归档：`lab/a-tokyo-atlas-fare@6d35ab6` | 完成 | 仓库证据 + 自报告 | 已收口归档 |
| `lab_b_archive` | Lab B 归档：`lab/b-umeda-3d@b2ed773` | 完成 | 仓库证据 + 自报告（保留 `umeda-*` 未动） | 已收口归档 |
| `lab_c_archive` | Lab C 归档：`lab/c-shinjuku-3d@19b2daa` | 完成 | 仓库证据 + 自报告 | 已收口归档 |
| `lab_scores` | 三原型归档评审（`docs/lab-reports/scores.md`） | 完成 | 仓库证据 | 不需要 |
| `p0_w0_contracts` | Wave 0：Monorepo 根骨架与 `@senkiro/contracts` | **完成** | 主控合入 + 实测 75/75 | 已验收合入 |
| `p0_s2_station_3d` | Wave 1 (`P0-S2`)：命令式 Three.js `station-3d` (40/40) + `data-stations` (8/8) | **完成** | 主控合入 + 601,364 节点对核验 | 已验收合入 |
| `p0_s1_domain_sqlite` | Wave 1 (`P0-S1`)：`domain-core` (47/47) + `fare-engine` (40/40) + `local-db` (12/12) | **完成** | **主控合入 + 全仓 222/222 实测通过**（含自报告 Chromium OPFS 冒烟） | **已验收合入** |
| `p0_s3_ui_web_shell` | Wave 1 (`P0-S3`)：`ui-kit` (M1 27/27) + `apps/web` | **进行中（`PAUSED_QUOTA`）** | `feat/p0-ui-web-shell@e79424a`（待续跑 M2/M3） | 待合入 |

## 待上提契约队列（排入 `P0-W2-wire`）

- `StationHubDataset.planNorth?: PlatformSide`（来自 `P0-S2`）
- `RegionalFareRulePack` 可选扩展钩子（`precheck`、`resolveRoutePreference`、`resolveRuleVersion`、`computeValidityAndStopover`、`pricingUnits`、`lookupSurcharge`）及 `TariffProvider.sourceIds`（来自 `P0-S1`）

## 下一步

1. 在 `E:\Workteree\SENKIRO\p0-ui-web-shell` 完成 `P0-S3` 的 M2/M3（`apps/web`）后回主控合入 `integration/phase-0`。
2. 执行 `P0-W2-wire`：上提上述契约字段，在 `apps/web` 接入 `<StationExplorer />` 与 `local-db` 探针，并跑通 Exit Gate 0 全仓及浏览器 E2E 验收。

## 依据与验证范围

- 2026-11-28 `P0-S1` 合入验证：在 `E:\SENKIRO\worktrees\integration-phase-0` 绕过 Turbo 缓存（`TURBO_FORCE=true`）实跑 `pnpm install --offline --frozen-lockfile && pnpm check && pnpm build && pnpm test`，退出码 `0`；6 个包构建通过，22 个测试文件 **222/222** 通过。`P0-S1` 自报告中的 Chromium OPFS 持久化与内存降级验证为转述记录，本次未在集成分支重跑浏览器冒烟；`P0-S3` 未重跑。
- 证据路径见 [project-status.json](./project-status.json) 的 `evidence_refs`。
