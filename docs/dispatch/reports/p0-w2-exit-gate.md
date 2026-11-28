# Dispatch Report — P0-W2（Exit Gate 0 收官联调）

- **Status**: `READY_FOR_MERGE`
- **Branch**: `feat/p0-w2-exit-gate`
- **Worktree**: `E:\Workteree\SENKIRO\p0-w2-exit-gate`
- **Base Commit**: `b413683`（`integration/phase-0`，开工时与 `origin/integration/phase-0` 一致）
- **Last verified code commit**: `4e78e16`（M3）。紧随其后的提交只新增本报告，提交无法包含自身 SHA，请用 `git rev-parse feat/p0-w2-exit-gate` 取 Head。
- **Model Used**: Claude Opus 5.5（`claude-opus-5-5`，Claude Code 桌面版）

| 里程碑 | Commit | 主题 |
| --- | --- | --- |
| M1 | `c6b2742` | feat(p0-w2): M1 promote Wave 1 contract requests and align station-3d with web slots |
| M2 | `79c8dc8` | feat(web): M2 wire StationExplorer and LocalDbStatusProbe into the shell slots |
| M3 | `4e78e16` | test(web): M3 Playwright Exit Gate 0 E2E and production token fix |
| M3 | （本提交） | docs(dispatch): P0-W2 handoff report |

## 1. Owned Paths Check

- 改动全部落在 `ownedPaths` 内：`YES`。
- 根 `package.json` 只新增 `test:e2e` 别名，`check / build / test` 未改。`tsconfig.base.json`、`biome.json`、`turbo.json`、`vitest.config.ts`、`packages/ui-kit/**`、`packages/domain-core/**`、`labs/**`、`docs/01-domain-contract-v1.0.md` 均未改。`E:\SENKIRO` 主目录未写入。Lab B 的 Playwright 写法通过 `git show lab/b-umeda-3d:...` 只读参考。
- `git diff --name-only b413683...4e78e16`（38 个文件）：

```text
apps/web/package.json
apps/web/playwright.config.ts
apps/web/src/data/hubs.ts
apps/web/src/i18n/messages.ts
apps/web/src/main.tsx
apps/web/src/modules/JourneyModule.tsx
apps/web/src/modules/modules.module.css
apps/web/src/shell/HubPanel.module.css
apps/web/src/shell/HubPanel.tsx
apps/web/src/shell/HubQuickEntry.tsx
apps/web/src/slots/adapters/local-db-probe.tsx
apps/web/src/slots/adapters/station-explorer.tsx
apps/web/src/slots/registry.ts
apps/web/src/slots/slots.tsx
apps/web/tests/e2e/exit-gate-0.spec.ts
apps/web/tests/slots-integration.test.tsx
apps/web/tsconfig.json
apps/web/vite.config.ts
package.json
packages/contracts/src/fare.ts
packages/contracts/src/station.ts
packages/contracts/tests/fare-hooks.test.ts
packages/data-stations/scripts/migrate.mjs
packages/data-stations/src/shinjuku.ts
packages/data-stations/src/umeda.ts
packages/data-stations/tests/hubs.test.ts
packages/fare-engine/src/engine.ts
packages/fare-engine/src/pack.ts
packages/fare-engine/src/packs/kansai/index.ts
packages/fare-engine/src/packs/kanto-jr/equivalence.ts
packages/fare-engine/src/packs/kanto-jr/index.ts
packages/fare-engine/src/packs/kanto-jr/tariff.ts
packages/fare-engine/src/route.ts
packages/station-3d/src/plan2d/StationPlan2D.tsx
packages/station-3d/src/plan2d/layout.ts
packages/station-3d/src/ui/StationExplorer.tsx
packages/station-3d/tests/explorer-controlled.test.tsx
pnpm-lock.yaml
```

## 2. Milestones Completed

- [x] **M1 · 契约上提与跨包接口对齐**
  - `@senkiro/contracts`：新增 `StationHubDataset.planNorth?: PlatformSide`。`RegionalFareRulePack` 增加六个可选钩子：`precheck`、`resolveRoutePreference`、`resolveRuleVersion`、`computeValidityAndStopover`、`pricingUnits`、`lookupSurcharge`。配套类型为 `FareRuleRejection`、`FarePrecheckContext`、`FareRulePreferencePlan`、`FareBillingContext`、`FareValidityResult`、`FarePricingUnit`、`PricedSurchargeQuote` 和 `SurchargeQuoteResult`。另有 `TariffProvider.sourceIds?` 与运行时守卫 `isFareRuleRejection`。路线偏好计划只用线路/车站 ID 数组和布尔开关，不引用 `domain-core` 的搜索类型，契约包仍然只依赖 `zod`。全部字段可选，v1.0 规则包原样可注册，有单测覆盖。`DOMAIN_CONTRACT_VERSION` 仍为 `'1.0'`。
  - `@senkiro/fare-engine`：引擎、Kanto JR 包和 Kansai 占位包直接使用契约类型。`pack.ts` 只剩旧名的 `@deprecated` 类型别名，不再有第二份定义。新增 `toTrackSearchOptions` 把契约计划翻译成 `TrackPathSearchOptions`。原 40 项票价测试全部通过，绕行偏好（埼京、横须贺、尾久、山手线）也在其中。
  - `@senkiro/data-stations`：`umedaHubDataset.planNorth = 'z-'`，`shinjukuHubDataset.planNorth = 'x-'`。`umedaHub` 和 `shinjukuHub` 包装对象保留。`migrate:labs` 生成脚本同步写出该字段，重新生成不会丢失。
  - `@senkiro/station-3d`：`<StationExplorer />` 新增可受控的 `level` / `onLevelChange` 和 `stepFree` / `onStepFreeChange`，与原有 `selectedId` / `onSelect` 同为“传值即受控，不传即内部状态”。平面方位读取 `planNorth ?? dataset.planNorth`。`floorForLevelParam` 与 `levelParamForFloor` 负责 URL `level` 的映射：接受楼层 ID 或楼层标签（`B1F`），写回时优先写标签。标签对应多个楼层时拒绝猜测，回到“全部楼层”，写回时改用楼层 ID。区段根节点暴露 `data-view` 和 `data-active-level`。
  - Vite：`apps/web/vite.config.ts` 在 dev 和 preview 都发送 `Cross-Origin-Opener-Policy: same-origin` 与 `Cross-Origin-Embedder-Policy: credentialless`，设置 `optimizeDeps.exclude: ['@sqlite.org/sqlite-wasm']` 和 `worker.format: 'es'`。`@senkiro/local-db/web` 的 `new URL('./sqlite.worker.js', import.meta.url)` 在直接引用 `.ts` 源码时也能被 Vite 解析：生产构建产出 `sqlite.worker-*.js` 和 `sqlite3-*.wasm`，dev 下 `.wasm` 经 `/@fs/` 返回 200（见 §3）。`local-db` 源码无需改动。
- [x] **M2 · Web 槽位正式接线**
  - `apps/web` 新增 workspace 依赖 `@senkiro/station-3d`、`@senkiro/data-stations`、`@senkiro/local-db`，以及 `three@0.187.0` 和 `@types/three@0.187.0`，与锁定版本一致。
  - `slots/adapters/station-explorer.tsx`：按枢纽懒加载 `@senkiro/data-stations/umeda` 或 `/shinjuku`，每个枢纽独立成块。京都没有加载器，不会请求也不会猜测数据；即使适配器被直接调用也会抛错，由 `SlotBoundary` 兜住。数据集 promise 记录完成状态，已加载的枢纽同步渲染，首次访问才挂起。路由参数仍只经 `HubPanel` 的 `useAppSearch()` 读、`useUpdateSearch()` 写，适配器不碰 TanStack 钩子。`StationExplorerSlotProps` 新增 `onStepFreeChange`，用于把无台阶开关写回 URL。
  - `slots/adapters/local-db-probe.tsx`：Profile 与 Journey 的探针都真实调用 `openWebLocalDb()`，显示存储模式、跨源隔离状态、就绪表数（读取包内 DDL，6/6）和自检记录数，提供写入、清空自检记录和导出 JSON（可下载）三个动作。OPFS SAH-pool 持有独占文件句柄，所有探针因此共享一个引用计数连接。最后一个探针卸载后，经 250 ms 宽限调用 `driver.close()`。这样 StrictMode 的挂载→卸载→挂载和模块切换都不会抢句柄、误降级到内存。
  - `registry.ts` 的 `DEFAULT_SHELL_SLOTS` 由两个 `lazy()` 适配器填充，`three`、枢纽数据和 SQLite Worker 都不进入外壳主块。接线后枢纽状态显示“站内示意模型”，三语文案齐全。
- [x] **M3 · Playwright Exit Gate 0**
  - 在 `apps/web` 安装 `@playwright/test@1.64.1`。`playwright.config.ts` 依次查找 `SENKIRO_CHROMIUM`、Playwright 自带 Chromium、系统 Chrome 或 Edge，不下载浏览器。`vite preview` 使用专用端口 `27410`（`--strictPort`），带 COOP/COEP。`test:e2e` 为 `vite build && playwright test`。
  - `tests/e2e/exit-gate-0.spec.ts` 共 10 项，每项在出现任何 console error 或 pageerror 时失败（见 §3）。
  - **E2E 发现并修复一个既有缺陷**：基线 `b413683` 的生产构建 CSS 不含任何 `--sk-*` 设计令牌定义（已在隔离的 `git archive` 副本中复现）。`@senkiro/ui-kit` 入口里的 `import './styles/tokens.css'` 被 Vite 8 / rolldown 生产构建丢弃，dev 服务器不受影响，P0-S3 的手动检查也只在 dev 下进行。生产页面因此没有令牌，浮动卡片的定位也会失效，Hub 快速入口叠在 Dock 上挡住“显示设置”按钮。修复放在独占范围内：`apps/web/src/main.tsx` 显式 `import '@senkiro/ui-kit/tokens.css'`，这是 ui-kit 文档注明的用法。E2E 同时断言深色和浅色画布令牌（`#181c22` / `#f4f1ea`）。
  - 同时为 `StationPlan2D` 的设施和连接加上 `aria-pressed`，让辅助技术能读出当前选中项，E2E 也借此核对刷新后选中状态的恢复。

## 3. Verification Results (Real Runs Only)

全部在工作树根运行，`TURBO_FORCE=true`，`TURBO_CACHE_DIR=E:\Workteree\SENKIRO\p0-w2-exit-gate\.turbo\cache`（位于已忽略的 `.turbo/` 下）。运行前删除了所有 `dist/` 和该缓存目录。

| 命令 | 退出码 | 摘要 |
| --- | --- | --- |
| `pnpm install --offline --frozen-lockfile` | 0 | 开工时 |
| `pnpm check` | 0 | Biome `Checked 201 files … No fixes applied`（0 错误 0 警告）；typecheck `8 successful, 8 total`，`0 cached` |
| `pnpm build` | 0 | `8 successful, 8 total`，`0 cached`，无警告 |
| `pnpm test` | 0 | `14 successful, 14 total`，`0 cached`；34 个测试文件，**307 / 307** |
| `pnpm --filter @senkiro/web test:e2e` | 0 | Playwright **10 / 10** |

### `pnpm check`

```text
> senkiro@0.0.0 check E:\Workteree\SENKIRO\p0-w2-exit-gate
> biome check --error-on-warnings . && turbo run typecheck

Checked 201 files in 116ms. No fixes applied.

   • turbo 2.11.13
   • Packages in scope: @senkiro/contracts, @senkiro/data-stations, @senkiro/domain-core, @senkiro/fare-engine, @senkiro/local-db, @senkiro/station-3d, @senkiro/ui-kit, @senkiro/web
   • Running typecheck in 8 packages
   • Remote caching disabled

@senkiro/contracts:typecheck: cache bypass, force executing e9dee99da797a0f5
@senkiro/local-db:typecheck: cache bypass, force executing 74f02d78ab6733c7
@senkiro/station-3d:typecheck: cache bypass, force executing 982c20559ff4a1c1
@senkiro/domain-core:typecheck: cache bypass, force executing 564a58d4a88e00f7
@senkiro/ui-kit:typecheck: cache bypass, force executing 6c689ad757b9da04
@senkiro/fare-engine:typecheck: cache bypass, force executing fe44ea5eeb375433
@senkiro/data-stations:typecheck: cache bypass, force executing 9994731b9d735932
@senkiro/web:typecheck: cache bypass, force executing ec5dc12558a029ad

 Tasks:    8 successful, 8 total
Cached:    0 cached, 8 total
  Time:    3.483s
```

### `pnpm build`（`apps/web` 部分）

```text
@senkiro/web:build: dist/index.html                                       0.68 kB │ gzip:   0.40 kB
@senkiro/web:build: dist/assets/sqlite3-opfs-async-proxy-DeAec6oc.js     32.46 kB
@senkiro/web:build: dist/assets/sqlite3-worker1-_vQmK3ps.js             215.85 kB
@senkiro/web:build: dist/assets/sqlite.worker-gsWHXBmq.js               224.11 kB
@senkiro/web:build: dist/assets/sqlite3-k2cTanUO.wasm                   879.08 kB │ gzip: 411.62 kB
@senkiro/web:build: dist/assets/index-DTTVK2pg.css                       19.57 kB │ gzip:   4.30 kB
@senkiro/web:build: dist/assets/local-db-probe-DVQhR5yi.js               86.71 kB │ gzip:  24.48 kB │ map:   365.41 kB
@senkiro/web:build: dist/assets/umeda-DeVMEjq_.js                       270.96 kB │ gzip:  23.01 kB │ map:   560.58 kB
@senkiro/web:build: dist/assets/index-Disncl-r.js                       477.45 kB │ gzip: 152.81 kB │ map: 2,384.25 kB
@senkiro/web:build: dist/assets/station-explorer-B9CYUZsA.js            604.75 kB │ gzip: 155.09 kB │ map: 3,105.70 kB
@senkiro/web:build: dist/assets/shinjuku-DbMB_cDE.js                  1,078.32 kB │ gzip:  78.72 kB │ map: 1,876.10 kB
@senkiro/web:build: ✓ built in 660ms

 Tasks:    8 successful, 8 total
Cached:    0 cached, 8 total
  Time:    3.402s
```

超过 Vite 默认 500 kB 的两个块都是懒加载块：`station-explorer`（含 three.js）和新宿数据集（gzip 约 79 kB）。外壳入口仍约 153 kB gzip。为此 `build.chunkSizeWarningLimit` 设为 1200，并在配置中注明原因。

### `pnpm test`

```text
@senkiro/contracts:test:  Test Files  9 passed (9)
@senkiro/contracts:test:       Tests  83 passed (83)
@senkiro/domain-core:test:  Test Files  5 passed (5)
@senkiro/domain-core:test:       Tests  47 passed (47)
@senkiro/local-db:test:  Test Files  1 passed (1)
@senkiro/local-db:test:       Tests  12 passed (12)
@senkiro/fare-engine:test:  Test Files  2 passed (2)
@senkiro/fare-engine:test:       Tests  40 passed (40)
@senkiro/station-3d:test:  Test Files  6 passed (6)
@senkiro/station-3d:test:       Tests  49 passed (49)
@senkiro/ui-kit:test:  Test Files  7 passed (7)
@senkiro/ui-kit:test:       Tests  27 passed (27)
@senkiro/data-stations:test:  Test Files  1 passed (1)
@senkiro/data-stations:test:       Tests  8 passed (8)
@senkiro/web:test:  Test Files  3 passed (3)
@senkiro/web:test:       Tests  41 passed (41)
 Tasks:    14 successful, 14 total
Cached:    0 cached, 14 total
  Time:    13.392s
```

与 Wave 1 基线 279 项相比新增 28 项：contracts +8（`fare-hooks.test.ts`），station-3d +9（`explorer-controlled.test.tsx`），web +11（`slots-integration.test.tsx`）。data-stations 在原测试内增加了 `dataset.planNorth` 断言，项数不变。Web 测试保持“出现任何 `console.error` 即失败”的规则。

### `pnpm --filter @senkiro/web test:e2e`

```text
Running 10 tests using 1 worker
  ok  1 tests\e2e\exit-gate-0.spec.ts:80:3 › trilingual shell and themes › switches zh-CN → ja → en and dark → light, and a reload keeps both (979ms)
[exit-gate-0] WebGL: {"webgl2":true,"vendor":"Google Inc. (NVIDIA)","renderer":"ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Laptop GPU (0x000027A0) Direct3D11 vs_5_0 ps_5_0, D3D11)","software":false}
  ok  2 tests\e2e\exit-gate-0.spec.ts:116:3 › Umeda (7-station hub) › mounts the explorer, syncs level / selection / step-free with the URL (1.2s)
  ok  3 tests\e2e\exit-gate-0.spec.ts:185:3 › Shinjuku (10-station hub) › switches to the Kanto region and renders the hub and its plan (978ms)
  ok  4 tests\e2e\exit-gate-0.spec.ts:203:3 › Kyoto honest placeholder › shows Phase 1 under construction and loads no model or dataset (992ms)
  ok  5 tests\e2e\exit-gate-0.spec.ts:225:3 › isomorphic SQLite in the browser › OPFS sahpool persists a write across a reload, then clears it (4.1s)
  ok  6 tests\e2e\exit-gate-0.spec.ts:256:3 › isomorphic SQLite in the browser › falls back to memory without createSyncAccessHandle and does not crash (2.1s)
  ok  7 tests\e2e\exit-gate-0.spec.ts:298:5 › narrow layout (390 × 844) › has no horizontal overflow at / (202ms)
  ok  8 tests\e2e\exit-gate-0.spec.ts:298:5 › narrow layout (390 × 844) › has no horizontal overflow at /?hub=umeda (538ms)
  ok  9 tests\e2e\exit-gate-0.spec.ts:298:5 › narrow layout (390 × 844) › has no horizontal overflow at /?hub=shinjuku&lang=ja (540ms)
  ok 10 tests\e2e\exit-gate-0.spec.ts:298:5 › narrow layout (390 × 844) › has no horizontal overflow at /?module=profile&lang=en (1.0s)
  10 passed (15.8s)
```

E2E 条目与 Exit Gate 0 的对应关系：

| Exit Gate 0 条目 | 覆盖 |
| --- | --- |
| 三语与主题切换、刷新保留、0 console error | #1：zh-CN → ja → en、dark → light，刷新后 `html[lang]`、`data-theme`、URL 和令牌值不变，切回默认值后规范 URL 无查询串 |
| 梅田 `?hub=umeda` | #2：挂载 3D（`data-view=3d`，可见 canvas），点击 `B1F` 写入 `level=B1F`，切换平面图后用键盘选中设施写入 `selection`，勾选无台阶写入 `stepFree=true`，`step_free` 寻路得到可达路线，刷新后楼层、无台阶和选中状态（`aria-pressed=true`）全部恢复 |
| 新宿 `?hub=shinjuku` | #3：区域单选自动切到“关东预览区”，渲染新宿视图与平面图，指北针为已知方位 |
| 京都 `?hub=kyoto` | #4：显示“Phase 1 建设中”，不挂载 explorer，`networkidle` 后没有任何 `station-explorer-*`、`umeda-*`、`shinjuku-*` 资源请求 |
| SQLite OPFS 实测 | #5：`crossOriginIsolated === true`，模式 `opfs-sahpool`，6/6 表；写入后刷新仍在，导出 JSON 大于 100 字节，清空后刷新为 0；Journey 模块共用同一库。#6：新上下文中拦截 Worker 模块并删除 `FileSystemFileHandle.prototype.createSyncAccessHandle`（init script 进不了专用 Worker），模式为 `memory-fallback`，写入成功，刷新后如实为 0，无报错 |
| 窄屏 390×844 | #7–#10：首页、梅田、新宿（ja）、Profile 探针页均满足 `scrollWidth ≤ innerWidth`，无 console error |

### 浏览器与 GPU 实情

- 浏览器：Playwright `chromium-1248`（Chrome for Testing 156.0.8078.4），新版 headless，本机已安装，未下载。
- WebGL：硬件 GPU。`WEBGL_debug_renderer_info` 返回 `ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Laptop GPU (0x000027A0) Direct3D11 vs_5_0 ps_5_0, D3D11)`，`software: false`。启动参数带 `--enable-unsafe-swiftshader`，无 GPU 的机器会回退到 SwiftShader；本次运行没有走软件渲染，软件渲染路径未实测。
- 执行环境：Claude Code 的 Bash 沙箱无法拉起 `chrome.exe`（`browserType.launch: spawn UNKNOWN`），所以 Playwright 在同一台机器的 PowerShell 中运行。同一命令在普通终端下预期可直接运行。

### Vite dev 链路（一次性核验，脚本未提交）

用临时 Playwright 配置把 `webServer` 换成 `vite --port 27412` 跑了一次，结束后已删除该配置和脚本：

```text
[dev] mode=opfs-sahpool crossOriginIsolated=true wasm=["200 http://127.0.0.1:27412/@fs/E:/Workteree/SENKIRO/p0-w2-exit-gate/node_modules/.pnpm/@sqlite.org+sqlite-wasm@3.54.1-build1/node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm"]
  1 passed (5.4s)
```

同一运行中梅田 explorer 正常挂载，无 console error。

### 未覆盖 / 已知限制

- 只测了 Chromium，Firefox 和 WebKit 未测。
- jsdom 没有 WebGL，单测里 explorer 只走平面图回退，3D 路径由 E2E 覆盖。
- 自检记录是写入真实 `ride_records` 的合成行（ID 前缀 `sk:ride:local:probe-`，`dataNature: 'synthetic'`，无车站、无区间、无到访记录），清空按钮会连同其 `sync_oplog` 条目一起删除。存在期间它会计入乘车记录条数，不影响到访车站、市区町村和线路完成率。界面三语注明了这一点。
- 3D 视图与平面图的切换、户外寻路起终点是组件内部状态，不写入 URL。

## 4. Contract Requests

- **无待处理的契约申请。** Wave 1 已批准的上提项全部在本分支落地，均为可选字段。
- **给 `ui-kit` 维护方的发现（不属于契约）**：`packages/ui-kit/package.json` 的 `"sideEffects": ["**/*.css"]` 没能让 rolldown 保留入口里的 `import './styles/tokens.css'`，生产构建因此缺少全部令牌。本分支用 `apps/web` 显式导入规避，建议 ui-kit 后续修正 `sideEffects` 写法或把令牌改为显式样式入口。修正后 `apps/web` 的显式导入保留也无害。
- **集成提示**：`pnpm --filter @senkiro/web add …` 让 pnpm 重新计算 vitest 的 peer 变体，锁文件中 `vitest@5.1.2(vite@8.4.0)` 变为 `vitest@5.1.2(@types/node@24.19.4)(jsdom@31.0.1)(vite@8.4.0(@types/node@24.19.4))`，同时留下了未重新链接的 `packages/ui-kit/node_modules/@testing-library/jest-dom`，ui-kit typecheck 随之报错。再执行一次 `pnpm install --offline --frozen-lockfile` 即恢复。合入后若遇到同样症状，按此处理。

## 5. Open-Source & Honesty Self-Check

- [x] 没有提交 API 密钥、token、`.env` 或 `data/raw/`。`test-results/`、`playwright-report/`、`dist/` 和 `.turbo/` 均已被忽略。
- [x] 没有编造车站、票价或时刻事实。京都继续保持诚实占位，未加载任何模型。枢纽数据只来自 `@senkiro/data-stations` 已发布的示意数据集，`planNorth` 取自 P0-S2 的既有值。
- [x] 合成数据有明确防护。探针自检行标记为 `synthetic`，有固定 ID 前缀和三语说明，可一键清空。票价合成表与免责声明逻辑未改。

## 6. Resume Instructions

不需要，状态为 `READY_FOR_MERGE`。主控合入时建议按以下顺序执行：

```powershell
git -C "E:\SENKIRO\worktrees\integration-phase-0" merge --no-ff feat/p0-w2-exit-gate
pnpm install --offline --frozen-lockfile
pnpm check; pnpm build; pnpm test; pnpm test:e2e
```
