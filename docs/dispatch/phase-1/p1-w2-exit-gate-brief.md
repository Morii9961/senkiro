# Dispatch Brief · `P1-W2`（Wave 2 收官集成与 `Exit Gate 1` 全端 E2E 验收）

> **⛔ 启用前置条件（重要）**：**本派单书仅在 Wave 1 三条分支全部经主控验收 `--no-ff` 合入 `integration/phase-1` 后才可新建工作树启动！** 当前进度：`P1-S1` ✅（`0f1e70e`）、`P1-S2` ✅（`82ea02a`）、`P1-S3` ⏳ 精修中。  
> **执行轮次**：Wave 2（收官集成与 Exit Gate 1）  
> **推荐订阅模型**：Claude（Gemini 本周配额已用尽）  
> **基准分支**：`integration/phase-1`（须已合入 `P1-S1` + `P1-S2` + `P1-S3`）  
> **新建分支**：`feat/p1-w2-exit-gate`  
> **建议工作树路径**：`E:\Workteree\SENKIRO\p1-w2-exit-gate`（若该目录仍有 Phase 0 残留文件，请先删除残留目录或改用 `p1-w2-exit-gate-b`）  
> **独占路径 `ownedPaths`**：
> - `apps/web/**`
> - `packages/data-kansai/**`
> - `packages/contracts/src/track.ts`（**仅限 M0 增补 `StationComplexExclusion.reasonNames` 一项**，经主控 2026-11-28 特批）
> - `packages/contracts/tests/station-complex-exclusion.test.ts`（新建）
> - `pnpm-lock.yaml`（仅限 `apps/web` 增加 `@senkiro/data-kansai` workspace 依赖时由 `pnpm install` 自动更新；**严禁改动根 `package.json`**）
> - `docs/dispatch/reports/p1-w2-exit-gate.md`

---

## 📋 一键复制启动提示词（Wave 1 三路合入后再粘贴使用）

````markdown
你正在独立 Git Worktree 中执行 SENKIRO Phase 1 收官任务 `P1-W2`（Wave 2 跨包真实联调与 Exit Gate 1 全维度验收）。
先确认当前 `integration/phase-1` 已合入 `P1-S1`（`data-pipeline` + `data-kansai`）、`P1-S2`（`Atlas UI` + `ui-kit/base.css`）与 `P1-S3`（`data-stations/kyoto` + Worker/Engine 加固）：`git log --oneline integration/phase-1` 中应能看到三条 `Merge branch 'feat/p1-...'`。缺任何一条就停下，告诉用户本任务尚不能启动。

请先完整阅读：
1. `docs/dispatch/phase-1/README.md`：§4 Exit Gate 1 验收条款；**§5.3 移交 P1-W2 的 9 项事项（本派单书已逐条编入下方里程碑）**
2. `docs/01-domain-contract-v1.0.md`：§2 三语回退、§5.1 `StationComplex`、**§7.2 防误并说明三语化（M0 的权威规格）**
3. `docs/02-phase1-atlas-spec.md`：§2.3 复合体与防误并红线、§3 PMTiles 文件与图层、§5 `RegionalAtlasBundle` 与双向深链协议
4. 交接报告：`docs/dispatch/reports/p1-s1-data-kansai.md`、`docs/dispatch/reports/p1-s2-atlas-ui.md`（**§6 接线说明**）、`docs/dispatch/reports/p1-s3-station-kyoto.md`
5. `docs/dispatch/HANDOFF_PROTOCOL.md`

### 你的边界与纪律
- **分支**：基于最新 `integration/phase-1` 切出 `feat/p1-w2-exit-gate`，先跑 `pnpm install --offline --frozen-lockfile`。
- **独占路径 `ownedPaths`**：`apps/web/**`、`packages/data-kansai/**`、`packages/contracts/src/track.ts`（仅 M0 一项字段）、新建的 `packages/contracts/tests/station-complex-exclusion.test.ts`、由 `pnpm install` 自动更新的 `pnpm-lock.yaml`、`docs/dispatch/reports/p1-w2-exit-gate.md`。**严禁**修改 `packages/contracts` 的其他文件、`packages/data-pipeline/**`、`packages/data-stations/**`、`packages/station-3d/**`、`packages/local-db/**`、`packages/fare-engine/**`、`packages/ui-kit/**`、根 `package.json`、`tsconfig.base.json`、`biome.json`、`turbo.json`、`vitest.config.ts`。发现这些包需要改动时，写入报告 `## 4. Contract Requests` 并停下。
- **原始数据**：`data:build` 只读 `E:\SENKIRO\.local-raw-backup\a-tokyo-atlas-fare\raw\ksj-n02.zip`（或 `SENKIRO_RAW_DIR`），严禁修改该目录或把 `raw/`、`.zip` 提交入 Git。
- **路由铁律**：`apps/web` 读取 URL 状态一律通过 `useAppSearch()`，写入一律通过 `useUpdateSearch()`，严禁裸用 `useSearch()`。
- **TypeScript 7.0.2 & Biome 2.6.9**：禁 `any`、禁 `!` 非空断言、禁 `console.*`、禁 `.forEach`，相对导入带 `.ts` / `.tsx` 扩展名，遵守 `exactOptionalPropertyTypes`。
- **Playwright 一律在 PowerShell 中运行**（Bash 沙箱无法启动 Chromium）。截图只放在已被 gitignore 的 `apps/web/test-results/` 等目录，仓库内不得留存未跟踪的 `.png`。
- **诚实性**：不得编造站名译名、距离、营业キロ、步行时间或运行状态；未核实一律 `null` / `<UnknownValue />`。
- **Git 提交署名**：每次 `git commit` 末尾必须包含：
  `Co-authored-by: gemini-code-assist[bot] <176961590+gemini-code-assist[bot]@users.noreply.github.com>`

### 分里程碑任务拆解

#### M0：防误并说明三语化（契约 §7.2）
1. `packages/contracts/src/track.ts`：在 `StationComplexExclusion` 增加可选字段 `reasonNames?: LocalizedNames`（带 JSDoc，说明 `reason` 仍必填、`ja_kana` 恒为 `null`）。不改 `DOMAIN_CONTRACT_VERSION`，不动其他文件。
2. 新建 `packages/contracts/tests/station-complex-exclusion.test.ts`：证明不带 `reasonNames` 的旧数据仍能赋值给 `StationComplex`，带 `reasonNames` 的数据通过类型检查，且 `resolveLocalizedName(reasonNames, locale)` 在三语下按 §2 回退。
3. `packages/data-kansai`：为 `src/kansai/catalog.ts` 中全部关西复合体的 `explicitlyExcluded`（当前 14 条）补齐 `reasonNames`（`zh` 取现有 `reason`；`ja` / `en` 依 §7.2 撰写，距离与方位与 `reason` 一致，站名用已核实译名，未核实保留日文原名）。关东预览区沿用 Lab A 的排除项：有可靠三语文本才补，否则保持缺省并在报告中写明数量。运行 `pnpm --filter @senkiro/data-kansai data:build` 重新生成，**再跑一次确认第二次运行无任何 diff**（可复现）。
4. `apps/web/src/features/atlas/AtlasEncyclopedia.tsx`：按 §7.2 展示规则渲染——说明优先 `resolveLocalizedName(reasonNames, lang)`，缺省时显示 `reason`；被排除站名称优先用 `stationId` 在当前数据包解析到的站名，解析不到显示 `name`。补 Vitest：三语各一例、缺省回退一例；同步更新 `apps/web/tests/fixtures/atlas-bundle.ts`（保留至少一条不带 `reasonNames` 的排除项作回退对照）。
5. 运行 `pnpm check && pnpm build && pnpm test` 绿灯后 `git commit`（M0）。

#### M1：京阪神 / 关东数据源接线与京都 3D 枢纽激活
1. **数据源 provider**（README §5.3 第 1、2、9 项）：
   - `apps/web/package.json` 增加 `"@senkiro/data-kansai": "workspace:*"`，`pnpm install` 自动更新锁文件；
   - 在 `apps/web/src/slots/adapters/atlas-data-source.ts(x)` 实现 `RegionalAtlasBundleProvider`，`regions: ['kansai', 'kanto']`：关西懒加载 `import('@senkiro/data-kansai')` 的 `kansaiAtlasBundle`，关东懒加载 `import('@senkiro/data-kansai/kanto-preview')` 的 `kantoPreviewAtlasBundle`，两者各自独立 chunk；在 `registry.ts` 注册；
   - **预览注入口（主控决定）**：保留 `window.__SENKIRO_ATLAS_PREVIEW__` 作为测试入口——注入时优先使用注入数据并继续标注“预览夹具”；未注入时使用正式 provider，生产页绝不出现预览标记。Exit Gate 1 的 E2E 必须跑真实数据，不得用夹具代替；
   - 入口预算保持 `tests/e2e/bundle.spec.ts` 的 200 kB gzip，数据包必须留在懒加载 chunk。
2. **静态瓦片**：`/tiles/kansai-rail.pmtiles`、`/tiles/kanto-rail.pmtiles`、`/tiles/kanto-rail-vertical.odbl.pmtiles` 从 `@senkiro/data-kansai` 的 `./tiles/*.pmtiles` 提供：用 Vite 插件在 `vite dev` / `vite preview` 下以中间件响应（支持 `Range` → `206`），并在 `vite build` 时复制进 `dist/tiles/`。**不得在 `apps/web/public/` 再提交一份 `.pmtiles`**（避免 3.6 MB 二进制重复入库）。
3. **关东单站复合体**（第 7 项）：`kantoTrackGraph` 现有 401 个复合体，其中 342 个只含 1 站。在 `packages/data-kansai` 的关东迁移中只保留 ≥2 站的复合体（单站复合体删除，对应站 `stationComplexId` 置 `null`），重新 `data:build`；补测试证明 `sk:complex:kanto:shinjuku` 仍为 10 站、`assertOdbLIsolation` 仍通过、没有站引用已删除的复合体。
4. **搜索**（第 8 项）：以 `apps/web/src/features/atlas/atlas-index.ts` 为准；在真实 `kansaiAtlasBundle` 上补单测，证明「大阪」「梅田」「京都」「河原町」「祇園四条」五个词区分复合体与独立站、京都复合体结果不含河原町 / 祇園四条。`data-kansai` 的 `searchAtlasEntities` 不接入 Web，在报告中说明。
5. **激活京都 3D 枢纽**：`apps/web/src/data/hubs.ts` 将 `kyoto` 从 `'phase-1-placeholder'` 切换为 `'station-3d'`；`apps/web/src/slots/adapters/station-explorer.tsx` 的 `HUB_DATASET_LOADERS` 懒加载 `@senkiro/data-stations/kyoto`（`kyotoHubDataset`）；更新 `apps/web/src/i18n/messages.ts` 中京都枢纽的状态文案；改写 `exit-gate-0.spec.ts` 中“京都诚实占位、零请求”用例。
6. **跨包 ID 对齐单测**：`data-kansai` 的 `osaka-umeda` / `kyoto` / `kanto:shinjuku` 与 `data-stations` 的 `stationIds` / `lineIds` 100% 一致；`<StationExplorer />` 能触发 `onNavigateExternalLine` 的每条线路 ID 都能在 `data-kansai` 找到。
7. 改写或删除 `atlas.spec.ts` 中“无数据源时不加载 MapLibre chunk”一条（第 1 项）。
8. 绿灯后 `git commit`（M1）。

#### M2：Exit Gate 1 全链路 Playwright E2E（多浏览器与无 GPU 降级）
编写 `apps/web/tests/e2e/exit-gate-1.spec.ts`，并确保 `exit-gate-0.spec.ts`、`atlas.spec.ts`、`bundle.spec.ts` 适配后继续全绿：
1. **搜索防误并**：真实数据上搜索「大阪」「梅田」「京都」「河原町」「祇園四条」，精准区分复合体与独立站；打开京都复合体条目不出现河原町 / 祇園四条为成员。
2. **防误并说明三语**：分别在 `zh-CN` / `ja` / `en` 打开京都复合体条目，“不含”名单的说明文字为对应语言（不再在日文 / 英文界面显示中文说明）。
3. **真实瓦片**（第 3 项）：浏览器实际请求 `/tiles/kansai-rail.pmtiles` 得到 `206`，地图从瓦片源（非内联 GeoJSON）渲染出 `rail_segments` 与 `rail_stations` 要素（可用 `map.querySourceFeatures` 或渲染要素计数断言）。
4. **地图点击拾取**（第 3 项）：在画布上点击梅田 / 京都 “3D” 徽章、一个车站、一条线路，URL 分别写入 `hub + complex`、`station`、`line`（用 `map.project` 取像素坐标，不写死坐标）。
5. **三枢纽 3D/2D 无台阶寻路**：梅田 7 站、京都 4 社、新宿 10 站枢纽面板的 3D 画布与 2D 分栏正常渲染，开启 `stepFree` 完成站内寻路且 URL 同步。
6. **双向深链**：地图徽章 / 百科抽屉 → 梅田、京都 3D 枢纽；站内站台点击外部线路 → 回到 Atlas 并打开该线路条目。
7. **区域切换**：`kansai` ↔ `kanto` 平滑切换，加载对应图谱与新宿枢纽。
8. **OPFS 回退原因**（第 4 项）：把内存回退用例从接受 `'unreported' | 'unsupported'` 收紧为只接受 `'unsupported'`；新增双标签页用例：两个页面同时进入 Profile 探针，第二个页面显示“被其他标签页占用”而非“不支持”。
9. **地图字形抽查**（第 5 项）：三语各截一张含京都站名的地图图，**亲自查看截图**；若全角括号等字符绘制异常，通过调整标签文本或字体栈修复后同机位重拍。
10. **跨浏览器与软件渲染**：在 `apps/web/playwright.config.ts` 增加 Firefox、WebKit 项目（本机已装对应 Playwright 浏览器时实跑，未安装时在报告中写明缺失与安装命令，不得伪称通过），以及禁用硬件 GPU（软件渲染 / 无 WebGL 降级）下的可用性与无崩溃断言。
11. 绿灯后 `git commit`（M2）。

#### M3：全仓回归与交接报告
1. 执行 `pnpm check && pnpm build && pnpm test && pnpm --filter @senkiro/web test:e2e`，记录真实耗时、产物大小（入口 gzip、两个数据 chunk、`AtlasMapView` chunk）、测试数与各浏览器覆盖明细。
2. 再跑一次 `pnpm --filter @senkiro/data-kansai data:build`，确认 `git status` 无变化。
3. 撰写并提交 `docs/dispatch/reports/p1-w2-exit-gate.md`（`READY_FOR_MERGE`），逐条对照 README §4 Exit Gate 1 五项与 §5.3 九项写明完成情况与证据。
````

---

## 交接提醒

- 本任务改动 `packages/contracts/src/track.ts` 属主控特批的一次性例外，范围仅限 `reasonNames` 一个可选字段；规格以 `docs/01-domain-contract-v1.0.md` §7.2 为准。
- 若 5 小时窗口配额接近 95%，在当前绿灯 Commit 停下并写入 `PAUSED_QUOTA` 交接报告。
