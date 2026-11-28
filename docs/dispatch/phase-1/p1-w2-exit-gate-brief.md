# Dispatch Brief · `P1-W2`（Wave 2 收官集成与 `Exit Gate 1` 全端 E2E 验收）

> **⛔ 启用前置条件（重要）**：**本派单书仅在 Wave 1 三条分支（`P1-S1`、`P1-S2`、`P1-S3`）全部经主控验收 `--no-ff` 合入 `integration/phase-1` 后才可新建工作树启动！Wave 1 期间严禁提前启动本任务。**  
> **执行轮次**：Wave 2（收官集成与 Exit Gate 1）  
> **推荐订阅模型**：Claude 或 Gemini  
> **基准分支**：`integration/phase-1`（须已合入 `P1-S1` + `P1-S2` + `P1-S3`）  
> **新建分支**：`feat/p1-w2-exit-gate`  
> **建议工作树路径**：`E:\Workteree\SENKIRO\p1-w2-exit-gate`  
> **独占路径 `ownedPaths`**：
> - `apps/web/**`
> - `packages/data-kansai/**`（仅当需调整静态瓦片导出路径或构建脚本对接 `apps/web/public/tiles/` 时）
> - `docs/dispatch/reports/p1-w2-exit-gate.md`

---

## 📋 一键复制启动提示词（Wave 1 三路合入后再粘贴使用）

````markdown
你正在独立 Git Worktree 中执行 SENKIRO Phase 1 收官任务 `P1-W2`（Wave 2 跨包真实联调与 Exit Gate 1 全维度验收）。
请确认当前 `integration/phase-1` 已合入 `P1-S1`（`data-pipeline` + `data-kansai`）、`P1-S2`（`Atlas UI` + `ui-kit/base.css`）与 `P1-S3`（`data-stations/kyoto` + Worker/Engine 加固）。
请先阅读：
1. `docs/02-phase1-atlas-spec.md`（重点 §3 PMTiles 路径、§5 双向深链与接口协议）
2. `docs/dispatch/phase-1/README.md`（§4 Exit Gate 1 验收条款）
3. `docs/dispatch/HANDOFF_PROTOCOL.md`

### 你的边界与纪律
- **分支**：基于最新 `integration/phase-1` 切出 `feat/p1-w2-exit-gate`，先跑 `pnpm install --offline --frozen-lockfile`。
- **独占路径 `ownedPaths`**：仅允许修改 `apps/web/**`、`packages/data-kansai/**`（仅静态瓦片衔接必要改动）与 `docs/dispatch/reports/p1-w2-exit-gate.md`。
- **路由铁律**：所有 URL 状态读取一律通过 `useAppSearch()`。
- **Git 提交署名**：每次 `git commit` 末尾必须包含：
  `Co-authored-by: gemini-code-assist[bot] <176961590+gemini-code-assist[bot]@users.noreply.github.com>`

### 分里程碑任务拆解

#### M1：京阪神 / 关东数据源接线与京都 3D 枢纽激活
1. 在 `apps/web/package.json` 挂载 `@senkiro/data-kansai` 依赖，在 `apps/web/src/slots/adapters/` 新增 `atlas-data-source.tsx` 懒加载适配器并在 `apps/web/src/slots/registry.ts` 注册 `atlasDataSource`（保持按需分包，不膨胀入口主块）。
2. 将 `kansai-rail.pmtiles`、`kanto-rail.pmtiles` 与物理隔离的 `kanto-rail-vertical.odbl.pmtiles` 配置至 `apps/web/public/tiles/`（或 Vite 静态资产复制钩子）确保 `vite dev` 与 `vite preview` 下 `/tiles/*.pmtiles` Range 请求正常返回 `206 / 200`。
3. 激活京都 3D 枢纽：
   - 更新 `apps/web/src/data/hubs.ts` 将 `kyoto` 状态从 `'phase-1-placeholder'` 正式切换为 `'station-3d'`；
   - 更新 `apps/web/src/slots/adapters/station-explorer.tsx` 的 `HUB_DATASET_LOADERS` 懒加载 `@senkiro/data-stations/kyoto`（`kyotoHubDataset`）；
   - 更新 `apps/web/src/i18n/messages.ts` 中关于京都枢纽的状态描述文案。
4. 编写跨包 ID 对齐单测：校验 `data-kansai` 中 `osaka-umeda` / `kyoto` / `shinjuku` 与 `data-stations` 的 `stationIds` / `lineIds` 100% 一致，且 `StationExplorer` 触发 `onNavigateExternalLine` 的每条线路 ID 均可在 `data-kansai` 找到对应线路。
5. 绿灯后 `git commit`（M1）。

#### M2：Exit Gate 1 全链路 Playwright E2E（多浏览器与无 GPU 降级）
编写 `apps/web/tests/e2e/exit-gate-1.spec.ts`（并确保既有 `exit-gate-0.spec.ts` 更新适配后继续全绿）：
1. **搜索防误并 E2E**：搜索「大阪」「梅田」「京都」「河原町」「祇園四条」，验证精准区分各复合体与独立站，点击京都复合体不显示河原町/祇園四条。
2. **三枢纽 3D/2D 无台阶寻路 E2E**：打开梅田 7 站、京都 4 社、新宿 10 站枢纽面板，验证 3D 画布与 2D 横向分栏图正常渲染，开启 `stepFree`（只走电梯）完成站内寻路且 URL 实时同步。
3. **宏观地图 ↔ 站内 3D 双向深链 E2E**：从地图徽章/百科抽屉跳转进入梅田/京都 3D 枢纽，再从站内站台点击外部线路反向跳回 Atlas 高亮对应线路抽屉。
4. **区域切换 E2E**：`kansai` ↔ `kanto`（关东预览区）平滑切换并加载对应图谱与新宿枢纽。
5. **双标签页 OPFS `pool-busy` 文案 E2E**：同时打开两个浏览器页面进入 Profile/LocalDb 探针，验证第二标签页准确展示“被其他标签页占用”的降级提示而非“浏览器不支持”。
6. **跨浏览器与软件渲染覆盖（P0 移交 P2 项收口）**：在 `apps/web/playwright.config.ts` 验证 Chromium（硬件 GPU）、Firefox、WebKit（如本机已安装对应 Playwright 浏览器；未安装时记录缺失并在能跑的引擎全量实跑）以及禁用硬件 GPU（软件渲染 / 无 WebGL 降级）下的页面可用性与无崩溃断言。
7. 绿灯后 `git commit`（M2）。

#### M3：全仓回归与交接报告
1. 执行 `pnpm check && pnpm build && pnpm test && pnpm --filter @senkiro/web test:e2e`，记录真实耗时、产物大小、测试数与浏览器覆盖明细。
2. 撰写并提交 `docs/dispatch/reports/p1-w2-exit-gate.md`（`READY_FOR_MERGE`）。
````
