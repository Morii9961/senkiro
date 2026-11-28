# SENKIRO 项目状态

快照时间：2026-11-28T19:20:00+08:00 · 协议 1.1 · 项目 ID `senkiro.main` · 报告：Claude（临时主控，代 Gemini 值守）

代码基线：`integration/phase-0@eb77275`（P0-W2 合入点）→ 本快照提交后以 `--no-ff` 合并进 `main`。阶段：**Exit Gate 0 通过，Phase 0 收官**（`phase_0_exit_gate_passed`）。整体进度不估算。

**Phase 0 全部五条分支（`P0-W0`、`P0-S1`、`P0-S2`、`P0-S3`、`P0-W2`）已验收合入 `integration/phase-0`。** 主控在集成分支合入 `P0-W2` 后清除全部 `dist/` 与独立 Turbo 缓存，`TURBO_FORCE=true` 复跑：Biome 201 文件 0 错误 0 警告，8 个项目 typecheck 与构建全部通过，全仓 **307 项单测**全绿（`contracts` 83 + `domain-core` 47 + `fare-engine` 40 + `local-db` 12 + `station-3d` 49 + `data-stations` 8 + `ui-kit` 27 + `web` 41），Playwright Exit Gate 0 E2E **10/10** 通过（Chromium 156 headless，WebGL 走真实硬件 GPU：RTX 4080 / D3D11，非软件渲染）。

## 里程碑

| ID | 事项 | 状态 | 证据 | 人工验收 |
| --- | --- | --- | --- | --- |
| `project_setup` | 立项与 Master Plan v1.0（Gate 0 D-01～D-05 决策锁定） | 完成 | 仓库证据（`main@e3cba60`） | 不需要 |
| `lab_a_archive` | Lab A 归档：`lab/a-tokyo-atlas-fare@9790e55` | 完成 | 仓库证据 + 自报告 | 已收口归档 |
| `lab_b_archive` | Lab B 归档：`lab/b-umeda-3d@b2ed773` | 完成 | 仓库证据 + 自报告（保留 `umeda-*` 未动） | 已收口归档 |
| `lab_c_archive` | Lab C 归档：`lab/c-shinjuku-3d@19b2daa` | 完成 | 仓库证据 + 自报告 | 已收口归档 |
| `lab_scores` | 三原型归档评审（`docs/lab-reports/scores.md`） | 完成 | 仓库证据 | 不需要 |
| `p0_w0_contracts` | Wave 0：Monorepo 根骨架与 `@senkiro/contracts` | 完成 | 主控合入 + 实测 75/75 | 已验收合入 |
| `p0_s1_domain_sqlite` | Wave 1 (`P0-S1`)：`domain-core` (47/47) + `fare-engine` (40/40) + `local-db` (12/12) | 完成 | 主控合入 + 全仓实测通过 | 已验收合入 |
| `p0_s2_station_3d` | Wave 1 (`P0-S2`)：命令式 Three.js `station-3d` + `data-stations` | 完成 | 主控合入 + 601,364 节点对核验 | 已验收合入 |
| `p0_s3_ui_web_shell` | Wave 1 (`P0-S3`)：`ui-kit` (27/27) + `apps/web` 三语全屏壳 | 完成 | 主控合入 + 全仓实测通过 | 已验收合入 |
| `p0_w2_exit_gate` | Wave 2 (`P0-W2`)：契约上提、`apps/web` 槽位接线与 Playwright Exit Gate 0 E2E | **完成** | **主控合入 `eb77275` + 全仓 307/307 + E2E 10/10 复跑** | **已验收合入** |
| `exit_gate_0` | Exit Gate 0：`integration/phase-0` 合并进 `main` | **完成** | 本快照随合并提交进入 `main` | 已验收 |

## P0-W2 验收要点

- `ownedPaths` 核验：`git diff --name-only b413683...46df3be` 共 39 个文件，全部落在派单书白名单内；根 `package.json` 仅新增 `test:e2e` 别名。`git ls-tree` 未发现密钥、`.env` 或 `data/raw/`。
- 契约：`StationHubDataset.planNorth?`、六个可选运价规则包钩子与 `TariffProvider.sourceIds?` 上提至 `@senkiro/contracts`，契约包仍只依赖 `zod`，`DOMAIN_CONTRACT_VERSION` 保持 `'1.0'`。
- Web：梅田 / 新宿按需懒加载，`level` / `selection` / `stepFree` 与 URL 双向同步；京都保持 Phase 1 诚实占位且零数据请求；Profile / Journey 探针真实打开浏览器 SQLite（OPFS `sahpool`，缺 `createSyncAccessHandle` 时降级 `memory-fallback`）。
- 修复既有缺陷（部分）：生产构建缺失全部 `--sk-*` 设计令牌。`apps/web/src/main.tsx` 显式导入 `tokens.css` 规避，主控复核生产 CSS 含 62 个令牌定义（深色 `#181c22` / 浅色 `#f4f1ea`）。**同一机制下 `ui-kit` 的 `base.css` 仍被丢弃**：主控在 `vite preview` 实测生产页 `body` 留 8px 边距并出现纵向滚动、`box-sizing` 为 `content-box`、按钮字体回退 Arial、无 `:focus-visible` 焦点框。页面可用，未违反 Exit Gate 0 条款，判定不阻断合入，列为 Phase 1 首要待办。
- 主控四路只读代码审查（契约 / station-3d / Web 接线 / E2E 与构建配置）：无阻断项；3 项应在 Phase 1 修复、10 项小问题，清单见 [Phase 0 派单总览 §4](../dispatch/phase-0/README.md#4-p0-w2-验收审查遗留项移交-phase-1)。契约文档漂移已由主控在 `docs/01-domain-contract-v1.0.md` §7 补记。

## 下一步

1. **Phase 1 Wave 0（`P1-Coord`）**：创建 `integration/phase-1`（基于合并后的 `main`），冻结关西 ID 注册表（`sk:complex:osaka-umeda`、`sk:complex:kyoto` 等）、`PMTiles` 图层规范与数据源许可矩阵，生成 `docs/dispatch/phase-1/` 下 `P1-S1`（京阪神数据 `[REP-02]`）、`P1-S2`（Atlas UI）、`P1-S3`（京都站 `[REP-01]`）三份派单书。
2. **P0 遗留待办（并入 Phase 1 派单，详单见派单总览 §4）**：
   - `ui-kit` 生产 CSS：`index.ts` 在 `"sideEffects": ["**/*.css"]` 下被视为无副作用，入口的 `tokens.css` 与 `base.css` 均被丢弃；需让 ui-kit 暴露并保留 `base.css`（或改为显式样式入口）并由 `apps/web` 导入。
   - 窄屏 E2E（#7–#10）只比较根元素 `scrollWidth`，而壳层全部 `position: fixed`，无法失败；需改为元素级边界检查。
   - 探针 `memory-fallback` 文案一律称“浏览器不支持 OPFS”，跨标签页占用句柄时归因错误。
   - E2E 浏览器覆盖：Firefox、WebKit 及无 GPU 的软件渲染路径尚未实测。
   - 探针自检行写入真实 `ride_records`（标记 `synthetic`，可一键清空）；Phase 3 `journey-store` 统计须排除 `dataNature: 'synthetic'`。

## 依据与验证范围

- 2026-11-28 `P0-W2` 合入验证：在 `E:\SENKIRO\worktrees\integration-phase-0`（`eb77275`）执行 `pnpm install --offline --frozen-lockfile`，删除全部 `dist/` 与独立 `TURBO_CACHE_DIR`，`TURBO_FORCE=true` 实跑 `pnpm check && pnpm build && pnpm test`（各 `8/8`、`8/8`、`14/14` 任务，`0 cached`），以及 PowerShell 下 `pnpm --filter @senkiro/web test:e2e`（`10 passed`），全部退出码 `0`。
- 未覆盖：Firefox / WebKit、软件渲染 WebGL、真实帧率基准。
- 证据路径见 [project-status.json](./project-status.json) 的 `evidence_refs` 与 [P0-W2 交接报告](../dispatch/reports/p0-w2-exit-gate.md)。
