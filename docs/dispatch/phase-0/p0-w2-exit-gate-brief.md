# Dispatch Brief · P0-W2（Wave 2 收官联调 · 契约上提、Web 槽位接线与 Exit Gate 0 E2E）

> **执行轮次**：Wave 2（Phase 0 最终收官单路，完成后即可锁板 Exit Gate 0 进入 Phase 1）  
> **推荐订阅模型**：**Claude** 或 **Codex**  
> **基准分支**：`integration/phase-0`（已合并 `P0-W0` + `P0-S1` + `P0-S2` + `P0-S3`，8 项目 279 单测通过）  
> **新建分支**：`feat/p0-w2-exit-gate`  
> **建议工作树路径**：`E:\Workteree\SENKIRO\p0-w2-exit-gate`  
> **独占路径 `ownedPaths`**：
> - `packages/contracts/**`
> - `packages/fare-engine/**`
> - `packages/station-3d/**`
> - `packages/data-stations/**`
> - `packages/local-db/**`
> - `apps/web/**`
> - `package.json`（仅允许补充根级 `test:e2e` 或等价脚本，严禁改坏既有 `check / build / test`）
> - `pnpm-lock.yaml`
> - `docs/dispatch/reports/p0-w2-exit-gate.md`

---

## 📋 一键复制启动提示词（直接粘贴给新工作树内的 Agent）

````markdown
你正在独立 Git Worktree 中执行 SENKIRO Phase 0 最终收官联调任务 `P0-W2`（Exit Gate 0）。
当前 `integration/phase-0` 已汇合 Wave 0 + Wave 1 全部 8 个项目（`contracts`、`domain-core`、`fare-engine`、`local-db`、`station-3d`、`data-stations`、`ui-kit`、`web`），你的目标是打通最后一公里跨包接线与浏览器实机端到端验收。

### 先读再做（只读上下文）
1. 阅读 `docs/01-domain-contract-v1.0.md` 与 `docs/dispatch/HANDOFF_PROTOCOL.md`。
2. 阅读 Wave 1 交接报告中的集成注意事项与契约上提诉求：
   - `docs/dispatch/reports/p0-s1-domain-sqlite.md`（`## Contract Requests`）
   - `docs/dispatch/reports/p0-s2-station-3d.md`（`## 4. Contract Requests`）
   - `docs/dispatch/reports/p0-s3-ui-web-shell.md`（`## 3. Finding worth knowing at integration` 与 `## 4.`）
3. 查看 `apps/web/src/slots/slots.tsx`、`apps/web/src/slots/registry.ts`、`apps/web/src/app/hooks.ts`、`packages/station-3d/src/ui/StationExplorer.tsx`、`packages/local-db/src/web.ts`。

### 边界与铁律
- **当前分支**：确认基于最新 `integration/phase-0` 切出 `feat/p0-w2-exit-gate`（先执行 `pnpm install --frozen-lockfile` 或 `--offline --frozen-lockfile`）。
- **独占范围**：仅修改本派单书 `ownedPaths` 内文件；严禁碰 `E:\SENKIRO` 主目录、`labs/`、`docs/01-domain-contract-v1.0.md` 等其他文档。
- **Zero-Codegen 与原生 3D 红线**：保持 TanStack Router 纯代码路由、无 `@react-three/fiber`、无 Tailwind。
- **Git 提交署名**：每次 `git commit` 末尾必须包含：
  `Co-authored-by: gemini-code-assist[bot] <176961590+gemini-code-assist[bot]@users.noreply.github.com>`

---

### Milestone 1：契约上提与跨包接口对齐

1. **上提 Wave 1 批准的契约字段至 `@senkiro/contracts`**（全部保持向后兼容可选属性）：
   - `StationHubDataset` 增加 `planNorth?: PlatformSide`；同步更新 `packages/data-stations/src/{umeda,shinjuku}.ts` 使 `umedaHubDataset.planNorth = 'z-'`、`shinjukuHubDataset.planNorth = 'x-'`（保留 `umedaHub` / `shinjukuHub` 向后兼容）；
   - 将 `packages/fare-engine/src/pack.ts` 中的可选扩展钩子（`precheck`、`resolveRoutePreference`、`resolveRuleVersion`、`computeValidityAndStopover`、`pricingUnits`、`lookupSurcharge` 及相关类型 `FarePrecheckContext` / `FareRulePreferencePlan` / `FareValidityResult` / `FarePricingUnit` / `SurchargeQuoteResult`）及 `TariffProvider.sourceIds?: readonly string[]` 上提至 `packages/contracts/src/fare.ts`，确保 `@senkiro/contracts` 零 `domain-core` 依赖，并让 `@senkiro/fare-engine` 直接复用契约定义（消除重复定义）。
   - 补齐对应契约单测，确认 `packages/contracts` 编译与测试全绿。
2. **对齐 `<StationExplorer />` 与 `StationExplorerSlotProps`**：
   - 检查 `apps/web/src/slots/slots.tsx` 的 `StationExplorerSlotProps`（含 `level: string | null`、`selection: string | null`、`stepFree: boolean`、`onLevelChange`、`onSelectionChange`）与 `packages/station-3d/src/ui/StationExplorer.tsx`；
   - 为 `<StationExplorer />` 补齐受控/同步 `level?: string | null`、`onLevelChange?: (level: string | null) => void`、`stepFree?: boolean`、`onStepFreeChange?: (stepFree: boolean) => void`（以及自动读取 `dataset.planNorth`）；补齐对应单测，确保 URL 参数 `?hub=umeda&level=B1F&selection=...&stepFree=true` 与站内视图双向同步。
3. **打通 `@senkiro/local-db/web` 的 Vite 开发与生产 Worker 链路**：
   - 检查 `packages/local-db/src/web.ts` 中 `new URL('./sqlite.worker.js', import.meta.url)` 在 `apps/web`（当前通过 workspace `exports` 直引 `.ts` 源码）和 `dist` 构建下 Vite Worker 打包是否正常（确保 Vite dev 与 `vite preview` 均可正确加载 Worker 与 `.wasm`）；
   - 在 `apps/web/vite.config.ts` 中配置 `optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] }` 及开发/预览服务器 COOP/COEP 响应头（`Cross-Origin-Opener-Policy: same-origin`、`Cross-Origin-Embedder-Policy: credentialless`），确保浏览器端 OPFS `sahpool` 开箱即用；
   - 绿灯 `git commit`（M1）。

---

### Milestone 2：`apps/web` 正式接线 `StationExplorer` 与 `LocalDbStatusProbe`

1. 在 `apps/web/package.json` 添加 workspace 依赖：`@senkiro/station-3d`、`@senkiro/data-stations`、`@senkiro/local-db` 及 `three`（注意保持与锁定版本 `0.187.0` 一致）。
2. 创建两个薄适配器并注册进 `apps/web/src/slots/registry.ts` 的 `DEFAULT_SHELL_SLOTS`：
   - `apps/web/src/slots/adapters/station-explorer.tsx`：按 `hub` 动态懒加载 `@senkiro/data-stations/umeda` 或 `@senkiro/data-stations/shinjuku`（京都永不触发加载，继续保留诚实 Phase 1 占位），挂载 `<StationExplorer />`，所有路由参数严格经由 `apps/web/src/app/hooks.ts#useAppSearch` 读写（**严禁直接调用 TanStack `useSearch()`**）；
   - `apps/web/src/slots/adapters/local-db-probe.tsx`：挂载于 Profile / Journey 探针槽位，真实调用 `openWebLocalDb()`，展示持久化模式（`opfs-sahpool` 或 `memory-fallback`）、表就绪数与本地写入/清空/JSON 导出自检动作，并在组件卸载时干净关闭 `driver.close()`。
3. 补齐 `apps/web` 联调单元测试（验证槽位接线后梅田/新宿真实渲染、URL `level`/`selection` 联动、京都仍保留 Phase 1 占位、探针槽位正常），运行根级 `pnpm check && pnpm build && pnpm test` 全绿后 `git commit`（M2）。

---

### Milestone 3：Playwright `Exit Gate 0` 全链路 E2E 验收与报告

1. 在 `apps/web` 安装/配置 `@playwright/test`（使用本机已安装的 Chromium 浏览器，参考 `labs/b-umeda-3d` 的浏览器探测或 `playwright.config.ts` 写法；`vite preview` 使用专用端口如 `27410` 并带 COOP/COEP 头）。
2. 编写端到端测试 `apps/web/tests/e2e/exit-gate-0.spec.ts`，实机验证全部 Exit Gate 0 核心条目：
   - **三语与主题切换**：`zh-CN / ja / en` 与 `dark / light` 切换及刷新保留，控制台 `0` 错误；
   - **梅田七站枢纽（`?hub=umeda`）**：成功挂载 `<StationExplorer />` 3D/2D 视图，切换楼层（如 `B1F`）、选中设施写入 URL、运行 `step_free` 无台阶寻路；
   - **新宿十站枢纽（`?hub=shinjuku`）**：自动切换至 `kanto` 区域并渲染新宿视图与平面图；
   - **京都诚实占位（`?hub=kyoto`）**：明确显示 Phase 1 建设中，不加载假模型；
   - **同构 SQLite OPFS 实测**：在无头 Chromium 验证 OPFS `sahpool` 模式下的写入与刷新后读取持久化（以及禁用 `createSyncAccessHandle` 时降级 `memory-fallback` 不崩溃）。
   - **窄屏布局（390×844）**：无横向溢出且无 console error。
3. 在工作树根运行完整验收命令（设置 `TURBO_FORCE=true` 与独立工作树 `TURBO_CACHE_DIR`）：
   - `pnpm check`（0 错误 0 警告）
   - `pnpm build`（全部包 + `apps/web` 构建成功）
   - `pnpm test`（全仓 Vitest 全绿）
   - `pnpm --filter @senkiro/web test:e2e`（Playwright E2E 全绿）
4. 撰写并提交交接报告 `docs/dispatch/reports/p0-w2-exit-gate.md`（`Status: READY_FOR_MERGE`，完整贴出真实命令输出、测试条目数及浏览器硬件 GPU / 软件渲染实情）。
````
