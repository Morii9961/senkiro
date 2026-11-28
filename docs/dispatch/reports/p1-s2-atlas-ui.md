# Dispatch Report — P1-S2（SENKIRO Atlas 交互图鉴 + `ui-kit/base.css` 与 Phase 0 Web 遗留修复）

- **Status**: `READY_FOR_MERGE`
- **Branch**: `feat/p1-atlas-ui`
- **Worktree**: `E:\Workteree\SENKIRO\p1-atlas-ui`
- **Base Commit**: `734aa5a`（`integration/phase-1`）
- **Last verified code commit**: `7dd4690`（M3）。紧随其后的提交只新增本报告，提交无法包含自身 SHA，请用 `git rev-parse feat/p1-atlas-ui` 取 Head。
- **Model Used**: Claude Opus 5.5（`claude-opus-5-5`，Claude Code 桌面版）

| 里程碑 | Commit | 主题 |
| --- | --- | --- |
| M1 | `b64ca14` | fix(web,ui-kit): M1 ship base.css in production and clear P0-W2 web follow-ups |
| M2 | `047d412` | feat(web): M2 SENKIRO Atlas map engine, operator filter and trilingual search |
| M3 | `7dd4690` | feat(web): M3 Atlas encyclopedia entries and hardened Exit Gate E2E |
| M3 | （本提交） | docs(dispatch): P1-S2 handoff report |

## 1. Owned Paths Check

- 改动全部落在 `ownedPaths` 内：`YES`。
- 未改根 `package.json`、`tsconfig.base.json`、`biome.json`、`turbo.json`、`vitest.config.ts`，未碰 `packages/contracts/**`、`packages/local-db/**`、`packages/station-3d/**`、`packages/data-stations/**`、`packages/data-kansai/**`、`labs/**`。`apps/web` 未导入 `@senkiro/data-kansai` 或京都枢纽数据。Lab A 的 `MapCanvas.tsx` 只通过 `git show` 只读参考。
- `pnpm-lock.yaml` 仅由 `pnpm --filter @senkiro/web add maplibre-gl pmtiles` 与随后的 `pnpm install --offline` 自动更新。
- `git diff --name-only 734aa5a...7dd4690`（40 个文件）：

```text
apps/web/package.json
apps/web/src/features/atlas/AtlasEncyclopedia.tsx
apps/web/src/features/atlas/AtlasMapLayer.tsx
apps/web/src/features/atlas/AtlasMapView.tsx
apps/web/src/features/atlas/AtlasSearch.tsx
apps/web/src/features/atlas/OperatorFilter.tsx
apps/web/src/features/atlas/atlas-geojson.ts
apps/web/src/features/atlas/atlas-index.ts
apps/web/src/features/atlas/atlas-pick.ts
apps/web/src/features/atlas/atlas-store.ts
apps/web/src/features/atlas/atlas-style.ts
apps/web/src/features/atlas/atlas.module.css
apps/web/src/features/atlas/use-atlas-bundle.ts
apps/web/src/i18n/messages.ts
apps/web/src/main.tsx
apps/web/src/modules/AtlasModule.tsx
apps/web/src/modules/JourneyModule.tsx
apps/web/src/modules/ProfileModule.tsx
apps/web/src/shell/AppShell.tsx
apps/web/src/shell/HubPanel.tsx
apps/web/src/shell/MapCanvas.module.css
apps/web/src/shell/MapCanvas.tsx
apps/web/src/slots/adapters/local-db-probe.tsx
apps/web/src/slots/adapters/station-explorer.tsx
apps/web/src/slots/registry.ts
apps/web/src/slots/slots.tsx
apps/web/tests/atlas-encyclopedia.test.tsx
apps/web/tests/atlas.test.tsx
apps/web/tests/e2e/atlas.spec.ts
apps/web/tests/e2e/bundle.spec.ts
apps/web/tests/e2e/exit-gate-0.spec.ts
apps/web/tests/fixtures/atlas-bundle.ts
apps/web/tests/phase0-followups.test.tsx
apps/web/tests/render-app.tsx
apps/web/tests/slots-integration.test.tsx
apps/web/vite.config.ts
packages/ui-kit/package.json
packages/ui-kit/src/index.ts
packages/ui-kit/tests/exports.test.ts
pnpm-lock.yaml
```

## 2. Milestones Completed

- [x] **M1** `ui-kit` 生产 `base.css` 与 Phase 0 Web 遗留（`docs/dispatch/phase-0/README.md` §4）
  - #1：`packages/ui-kit` 导出 `./base.css`；`apps/web/src/main.tsx` 在 `tokens.css` 之后导入。生产页 E2E 断言 `body` 边距 `0px`、`border-box`、按钮字体继承正文、键盘焦点框为实线。
  - #3：探针以 `Reflect.get` 安全读取可选的 `persistenceFallbackReason`，三语区分 `unsupported`（不支持同步句柄）与 `pool-busy`（同源其他标签页占用，回退内存临时库）；`unknown` 写“原因未明”；没有该字段的旧驱动显示“存储层未报告回退原因”，不再一律归因为“不支持”。
  - #4：首次 `readStatus` 失败时结束“正在打开…”并显示报错；写入 / 清空 / 导出失败改为操作级报错，状态与三个按钮都保留。
  - #5：Journey / Profile 的本地数据库 `SlotBoundary` 使用专属加载与报错文案。
  - #6：`slots-integration.test.tsx` 改为 `toHaveTextContent(/\S/)`，元素缺失时必失败。
  - #7：`HubPanel` 的 `SlotBoundary` 加 `key={hub.id}`。
  - 双向深链：`StationExplorerSlotProps.onNavigateExternalLine` 经适配器透传给 `<StationExplorer />`；`HubPanel` 调用 `update({ module: 'atlas', line, station: undefined, complex: undefined })` 并打开 Atlas 面板，枢纽预览保留（规范 §5.2.3 允许）。
- [x] **M2** MapLibre GL JS v5 + PMTiles 底板、筛选与搜索
  - `apps/web` 依赖 `maplibre-gl ^5.4.0`（解析为 5.24.1）、`pmtiles ^4.3.0`（解析为 4.5.0），均无生命周期脚本。
  - `slots.tsx` 新增 `RegionalAtlasBundle`（与规范 §5.1 同构）、`RegionalAtlasBundleProvider { regions, load(region), preview? }` 与 `ShellSlots.atlasDataSource`。Wave 1 默认不挂载 provider，地图保留 Phase 0 经纬网格并诚实提示“数据源尚未接入”。
  - `features/atlas/AtlasMapView.tsx` 是独立懒加载 chunk（`maplibre-gl` + 其 CSS + `pmtiles`）。注册 `pmtiles://` 协议，按 `bundle.pmtilesUrl` 加载四个 MVT 图层；`pmtilesUrl === ''` 时用 `trackGraph` 生成同 schema 的 GeoJSON（夹具 / 预览用，见 §6）。无 WebGL 时不加载引擎（jsdom 亦然），状态栏如实说明。
  - 离线样式：无 glyphs 服务器（MapLibre 5.24 在未设 `glyphs` 时以 TinySDF 本地绘制全部字形），无 sprite、无底图瓦片；深浅两套配色与 `ui-kit` 令牌一致（单测守卫）；`corridor_slot` 居中偏移；新干线为宽描边 + 底色虚线芯的双线；站名按 `importance_rank` 分 z9 / z11 / z13 出现，站号作第二行；有室内模型的复合体显示 “3D” 徽章；CJK 字体随语言切换日文 / 简中字形。
  - 切换区域时相机 `fitBounds` 飞向新区域并替换数据源；主题、语言、运营商筛选、URL 选中项通过 `setStyle(..., { diff: true })` 生效；地图点击写回 URL（徽章 → `hub + complex`，站 → `station`，线 → `line`，直通边界 → 边界站）。
  - Atlas 面板：运营商多选筛选（同时作用于地图与搜索，并显示被筛掉的结果数）；三语搜索（简中 / 日文 / 假名 / 英文 / 站号，NFKC + 片假名转平假名 + 去分隔符），结果按“车站复合体 / 独立车站 / 线路”分组，每个车站标明真实所属复合体或“不属于任何复合体”，并高亮匹配片段。复合体只匹配自身名称，`explicitlyExcluded` 与成员站名都不参与匹配，所以“京都”“河原町”不会混同。
- [x] **M3** 三语百科条目、E2E 加固与本报告
  - 条目随 `useAppSearch()` 的 `station › complex › line` 切换：线路（运营商、`<LineBadge />`、类别、收录范围、营业キロ合计或 `<UnknownValue />`、`unavailableOperationalStatus` 的 R-07 提示、可点击站序、`<ProvenanceTag />`、相关直通）；车站（站号徽章或“未核实”、所属线路、真实复合体或独立站、闸内 / 闸外 / 未核实换乘、直通）；复合体（成员、醒目的“不含（防误并）”名单、换乘、“进入站内 3D/2D 导览”按钮 → `update({ region, hub, complex, station: undefined, line: undefined })`）；URL 中的 ID 不在数据包时如实说明，不作推测。
  - E2E：#2 窄屏改为逐个测量 `position: fixed` 表面（对话框、探针、站内导览、Atlas 条目、Dock、状态栏、快速入口）的 `getBoundingClientRect()`，并检查抽屉内可滚动元素无横向溢出，另有一条对照用例证明该检查会失败；#8 新增 `bundle.spec.ts`，检查入口及其 `modulepreload` 静态依赖不含 three.js / MapLibre / pmtiles、gzip 合计低于 200 kB，并以懒加载 chunk 作正向对照；#9 京都零请求用例补梅田 / 新宿正向对照；#10 语言用例刷新后复核令牌与 URL。

## 3. Verification Results (Real Runs Only)

全部在本工作树 `E:\Workteree\SENKIRO\p1-atlas-ui`、HEAD `7dd4690` 上运行（Windows 11，Node 24.15.0，pnpm 10.33.0）。

- `pnpm install --offline --frozen-lockfile` → Exit `0`（开工前）。
- `pnpm check` → Exit `0`：Biome 无错误无警告；`turbo run typecheck` 8/8 成功。
- `pnpm build` → Exit `0`：8/8 成功。
- `pnpm test` → Exit `0`：共 **364** 项全部通过。

  | 项目 | 用例 |
  | --- | --- |
  | `@senkiro/contracts` | 83 |
  | `@senkiro/domain-core` | 47 |
  | `@senkiro/fare-engine` | 40 |
  | `@senkiro/local-db` | 12 |
  | `@senkiro/station-3d` | 49 |
  | `@senkiro/data-stations` | 8 |
  | `@senkiro/ui-kit` | 31（+4：`exports.test.ts`） |
  | `@senkiro/web` | 94（基线 41，+53：`phase0-followups` 11、`atlas` 31、`atlas-encyclopedia` 11） |

- `pnpm --filter @senkiro/web test:e2e`（PowerShell，`vite build` + Playwright，硬件 GPU：ANGLE / NVIDIA RTX 4080 Laptop，Direct3D11）→ Exit `0`，**20/20** 通过：`atlas.spec.ts` 4、`bundle.spec.ts` 3、`exit-gate-0.spec.ts` 13（原 10 项全部保留并加固，新增 base.css 1 项、窄屏对照 1 项、Atlas 窄屏 1 项）。
- 生产构建体积：入口 + 静态依赖 **172.7 kB gzip**（P0-W2 约 150 kB；增量为 Atlas 面板、搜索与三语文案）；`AtlasMapView` chunk 1,060 kB（gzip 285 kB）+ CSS 70 kB，仅在挂载数据源且有 WebGL 时请求。
- 人工目测：E2E 截图确认 MapLibre 在 Chromium 中离线绘制线、站、站号、3D 徽章与复合体选中高亮，桌面与 390 px 宽度下条目布局正常。

未运行 / 未覆盖：

- 真实 PMTiles 归档未经浏览器加载验证：P1-S1 的 `kansai-rail.pmtiles` 尚未合入，测试夹具走内联 GeoJSON 路径。PMTiles 路径的样式（`source-layer`）由单测检查，`pmtiles://` 协议注册已在每次地图启动时执行，但没有对真实瓦片的端到端断言。
- 地图上的点击拾取只对 `pickFromFeature` 做了单测；E2E 不点击画布坐标（夹具几何没有稳定像素位置），改为通过搜索与条目验证 URL 联动。
- `pool-busy` 的真实跨标签页场景依赖 P1-S3 的 Worker 回传原因，本分支只能用伪造驱动验证文案。

## 4. Contract Requests

- None。全部改动只用 `@senkiro/contracts` v1.0 现有导出。

## 5. Open-Source & Honesty Self-Check

- [x] 未提交 API 密钥、令牌、`.env`、`raw/`、`.zip` 或 `.pmtiles`。
- [x] 未编造车站 / 线路 / 站号 / 营业キロ / 运行状态：无数据时显示“待接入”或 `<UnknownValue />`；运行情报固定为 `unavailableOperationalStatus`；站号缺失显示“未核实”。
- [x] 合成数据显式标注：测试夹具 `apps/web/tests/fixtures/atlas-bundle.ts` 只在测试中使用，所有记录 `dataNature: 'synthetic'`；经 `window.__SENKIRO_ATLAS_PREVIEW__` 注入时，地图状态栏与 Atlas 面板都标明“预览夹具（合成数据，仅供测试）”。生产构建中不含任何夹具数据。
- [x] 夹具中只有京都站四社、京都河原町、祇園四条的坐标取自规范 §2.3 的 KSJ 数值，其余坐标、区段几何与唯一一个营业キロ均为合成值，文件头已写明。

## 6. 给主控与 P1-W2 的接线说明

1. **正式接线**：在 `apps/web/src/slots/registry.ts` 的 `DEFAULT_SHELL_SLOTS` 中加入
   ```ts
   atlasDataSource: {
     regions: ['kansai'],
     load: () => import('@senkiro/data-kansai').then((m) => m.kansaiAtlasBundle),
   },
   ```
   （导出名以 P1-S1 实际为准）。数据包与静态文件需满足 `slots.tsx` 的 `RegionalAtlasBundle`；`.pmtiles` 放在 `apps/web/public/tiles/` 下即可用相对路径 `/tiles/kansai-rail.pmtiles`。接线后 `atlas.spec.ts` 的“没有数据源时不加载 MapLibre chunk”一条需改为在无 provider 的条件下运行或删除。
2. **`pmtilesUrl` 约定**：空字符串表示该数据包没有发布瓦片，地图改用 `trackGraph` 生成同名同字段的四个图层。正式数据包应给出真实路径。
3. **预览接口**：`window.__SENKIRO_ATLAS_PREVIEW__ = { kansai?: bundle, kanto?: bundle }` 必须在页面脚本执行前设置（Playwright `addInitScript`）。注入的数据一律标为预览数据，正式 provider 存在时建议移除或保留为测试专用。
4. **OPFS 回退原因**：P1-S3 合入 `persistenceFallbackReason` 后无需改 Web 代码；`exit-gate-0.spec.ts` 的内存回退用例同时接受 `'unreported'` 与 `'unsupported'`，合入后可收紧为只接受 `'unsupported'`。
5. **3D 枢纽复合体 ID** 写在 `features/atlas/atlas-geojson.ts` 的 `HUB_COMPLEX_IDS`（`osaka-umeda` / `kyoto` / `kanto:shinjuku`），与规范 §2.3 一致；PMTiles 的 `hub_key` 字段由 P1-S1 管线提供时以瓦片为准。
6. 体积预算 `ENTRY_GZIP_BUDGET = 200 kB` 写在 `tests/e2e/bundle.spec.ts`，真实数据接线后若入口超限，说明有数据被静态打进了入口。

## 7. Resume Instructions

- 不适用（`READY_FOR_MERGE`）。
