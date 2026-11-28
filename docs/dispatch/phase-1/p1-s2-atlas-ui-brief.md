# Dispatch Brief · `P1-S2`（Wave 1 并行 · `SENKIRO Atlas` 交互图鉴 + `ui-kit/base.css` 与 Phase 0 Web 修复）

> **执行轮次**：Wave 1（与 `P1-S1`、`P1-S3` 三路并行，基于 `integration/phase-1`）  
> **推荐订阅模型**：Claude  
> **基准分支**：`integration/phase-1`  
> **新建分支**：`feat/p1-atlas-ui`  
> **建议工作树路径**：`E:\Workteree\SENKIRO\p1-atlas-ui`  
> **独占路径 `ownedPaths`**：
> - `packages/ui-kit/**`
> - `apps/web/**`
> - `pnpm-lock.yaml`（仅限上述包/应用增删依赖时由 `pnpm install` 自动更新；**严禁改动根 `package.json`**）
> - `docs/dispatch/reports/p1-s2-atlas-ui.md`

---

## 📋 一键复制启动提示词（直接粘贴给新工作树内的 Agent）

````markdown
你正在独立 Git Worktree 中执行 SENKIRO Phase 1 Wave 1 并行任务 `P1-S2`（`SENKIRO Atlas` MapLibre 矢量铁道图鉴 + 三语百科抽屉 + Phase 0 CSS/E2E 遗留修复）。
请先完整阅读以下基线文档与源码：
1. `docs/02-phase1-atlas-spec.md`（**核心规范**：PMTiles MVT 图层字段、`RegionalAtlasBundle`、`useAppSearch()` 双向深链协议、OPFS 降级原因协议、锁定版本 `maplibre-gl ^5.4.0` 与 `pmtiles ^4.3.0`）
2. `docs/01-domain-contract-v1.0.md`（§1 诚实性规则、§2 一级三语回退、§5.1/5.3、§6 URL 深链）
3. `docs/brand-v1.0.md` 与 `docs/dispatch/phase-0/README.md` §4（你负责的 P0-W2 验收审查遗留项详单）
4. `docs/dispatch/HANDOFF_PROTOCOL.md`
5. 现有源码：`packages/ui-kit/package.json`、`packages/ui-kit/src/index.ts`、`apps/web/src/main.tsx`、`apps/web/src/app/hooks.ts`、`apps/web/src/shell/MapCanvas.tsx`、`apps/web/src/shell/HubPanel.tsx`、`apps/web/src/slots/slots.tsx`、`apps/web/src/slots/adapters/local-db-probe.tsx`、`apps/web/tests/e2e/exit-gate-0.spec.ts`
6. 只读参考 Lab A MapLibre 样式/交互：`git show lab/a-tokyo-atlas-fare:labs/a-tokyo-atlas-fare/src/ui/MapCanvas.tsx`

### 你的边界与工具链铁律
- **分支与工作树**：确认在基于 `integration/phase-1` 切出的 `feat/p1-atlas-ui` 分支上作业；开干前先运行 `pnpm install --offline --frozen-lockfile`。
- **独占路径 `ownedPaths`**：仅允许创建/修改 `packages/ui-kit/**`、`apps/web/**`、`docs/dispatch/reports/p1-s2-atlas-ui.md`，以及 `apps/web` 安装 `maplibre-gl ^5.4.0` 与 `pmtiles ^4.3.0` 时自动更新的 `pnpm-lock.yaml`。**严禁**修改 `packages/contracts/**`、`packages/local-db/**`、`packages/station-3d/**`、`packages/data-stations/**`、`packages/data-kansai/**`、根 `package.json`！
- **禁止导入未合入的同波次包**：Wave 1 期间 `apps/web` **不得**导入 `@senkiro/data-kansai` 或未合入的 `kyoto` 枢纽数据；通过 `apps/web/src/slots/slots.tsx` 的类型化 `atlasDataSource` 槽位接入数据（Wave 2 `P1-W2` 负责正式接线），并确保在未挂载真实数据时提供优雅、诚实的占位态（同时支持测试/预览注入小型 `RegionalAtlasBundle` 夹具以完整验证地图、搜索、筛选与百科抽屉！）。
- **硬性路由纪律**：`apps/web` 中读取 URL 查询参数**必须使用 `useAppSearch()`**（来自 `apps/web/src/app/hooks.ts`），**严禁裸用 TanStack Router 的 `useSearch()`**！
- **TypeScript 7.0.2 & Biome 2.6.9 严格检查**：禁 `any`、禁 `!` 非空断言、禁 `console.*`、禁 `.forEach`、相对导入必须带 `.ts` / `.tsx` 扩展名；`exactOptionalPropertyTypes: true` 下向组件传递可选 prop 时如值为 `undefined` 请勿写出属性键或显式联合 `| undefined`。
- **Git 提交署名**：每次 `git commit` 末尾必须包含：
  `Co-authored-by: gemini-code-assist[bot] <176961590+gemini-code-assist[bot]@users.noreply.github.com>`

### 分里程碑任务拆解

#### M1：`@senkiro/ui-kit` 生产 `base.css` 修复 + Phase 0 Web 审查遗留清零
按 `docs/dispatch/phase-0/README.md` §4 逐项落实你名下的修复（并补单测）：
1. **必修 #1（`ui-kit` 生产 `base.css` 丢失）**：
   - 在 `packages/ui-kit/package.json` 的 `exports`（及 `publishConfig.exports` 如有）显式暴露 `"./base.css": "./src/styles/base.css"`；
   - 在 `apps/web/src/main.tsx` 顶部显式导入 `import '@senkiro/ui-kit/base.css';`（置于 `tokens.css` 之后）。
2. **必修 #3（Web 端 OPFS 降级文案区分）**：
   - `packages/local-db` 将在 `P1-S3` 为 driver/worker 增补可选字段 `persistenceFallbackReason?: 'unsupported' | 'pool-busy' | 'unknown'`；
   - 在 `apps/web/src/i18n/messages.ts` 为 `zh-CN / ja / en` 增加区分“浏览器不支持 OPFS 同步句柄”与“已被同源其他标签页占用，当前标签页回退至内存临时库”的精确文案；
   - 在 `apps/web/src/slots/adapters/local-db-probe.tsx` 安全读取可选属性 `persistenceFallbackReason`（兼容旧无该字段的返回形状），按原因渲染对应说明。
3. **小项 #4 / #5 / #6 / #7（探针与槽位边界健壮性）**：
   - #4：`local-db-probe.tsx:208` 捕获 `readStatus` 异常避免卡死在“正在打开…”；写入 / 清空 / 导出失败时展示操作级报错但**保留原有操作按钮**；
   - #5：`JourneyModule.tsx` 与 `ProfileModule.tsx` 中 `LocalDbStatusProbe` 的 `SlotBoundary` 使用本地数据库专属加载/报错文案（不再沿用枢纽 3D 文案）；
   - #6：修复 `apps/web/tests/slots-integration.test.tsx:132` 断言，确保元素不存在时必失败；
   - #7：`apps/web/src/shell/HubPanel.tsx` 的 `SlotBoundary` 添加 `key={hub.id}`，防止某枢纽报错后切换另一枢纽残留错误态。
4. **双向深链接口预留**：在 `StationExplorerSlotProps` 与 `HubPanel.tsx` 接入 `onNavigateExternalLine`（调用 `update({ module: 'atlas', line: lineId, station: undefined, complex: undefined })`）。
5. 包级检查绿灯后 `git commit`（M1）。

#### M2：`SENKIRO Atlas` MapLibre GL JS v5 + PMTiles 交互底板、筛选器与搜索
1. 在 `apps/web/package.json` 安装 `maplibre-gl@^5.4.0` 与 `pmtiles@^4.3.0`（注意仅修改 `apps/web/package.json`，不要动根 `package.json`）。
2. 在 `apps/web/src/slots/slots.tsx` 新增类型化 `atlasDataSource?: RegionalAtlasBundleProvider`（结构严格匹配 `docs/02-phase1-atlas-spec.md` §5.1 `RegionalAtlasBundle`）；实现 `apps/web/src/features/atlas/` 懒加载地图适配器，接管 `MapCanvas.tsx` 中的 `[data-map-mount="maplibre"]`：
   - 动态加载 `maplibre-gl`、`maplibre-gl/dist/maplibre-gl.css` 与 `pmtiles`（确保独立 chunk，**绝不打入入口主块**）；
   - 注册 `pmtiles` 协议，加载 `bundle.pmtilesUrl` 中的 `rail_segments`、`rail_stations`、`station_complexes`、`through_boundaries` 四大 MVT 图层；无 `bundle` 或 WebGL 不可用时，保留 Phase 0 经纬网格底板并诚实提示状态（不崩溃）；
   - 离线可用样式规范：MapLibre style 采用纯矢量深/浅色（与 `--sk-*` 和纸白/石墨黑双主题同步），不强依赖在线瓦片即可完整绘制全部线网、多线平行偏移（`line-offset` 基于 `corridor_slot`）、新干线双线/虚线风格、分级缩放站名与站号徽章（`importance_rank`）、以及 `umeda / kyoto / shinjuku` 3D 枢纽醒目徽章；
   - 切换 `region`（`kansai` ↔ `kanto`）时平滑过渡地图视野与数据源。
3. 在 `AtlasModule` / 悬浮区实现：
   - **运营商筛选器**：支持多选过滤 8 社 / 关东运营商；
   - **三语智能搜索框（`zh-CN / ja / en / 假名 / 站号`）**：实时高亮并区分展示「复合体（如 `大阪・梅田`、`京都駅 4社`）」与「独立车站（如 `阪急 京都河原町`、`京阪 祇園四条`）」，确保搜索「京都」或「河原町」绝不混同！
4. 绿灯后 `git commit`（M2）。

#### M3：三语铁道百科详情抽屉、加固 E2E 与交接报告
1. 构建 `Atlas` 三语百科抽屉组件（`apps/web/src/features/atlas/`，通过 `useAppSearch()` 联动 `station / complex / line` URL 参数）：
   - **线路详情**：正式运营商归属、识别色 `<LineBadge />`、站序表（支持点击跳站）、营业キロ（未知时渲染 `<UnknownValue />`）、`R-07` 运行情报诚实占位（`unavailableOperationalStatus` 三语提示“无实时授权运行数据”）、`<ProvenanceTag />`；
   - **车站 & 复合体详情**：站号徽章、闸内/闸外换乘说明（`Interchange`）、**防误并显著提示**（渲染 `explicitlyExcluded` 列表，例如在京都站复合体提示“不含阪急京都河原町・京阪祇園四条”）；若关联 3D 枢纽（`umeda / kyoto / shinjuku`），提供「进入站内 3D/2D 导览」按钮触发 `update({ hub, complex, ... })`；
   - **直通运营详情**：展示边界站与跨社直通线路关系。
2. 加固 `apps/web/tests/` 与 Playwright E2E（覆盖全部 `P0-W2` 遗留 #2 / #8 / #9 / #10）：
   - **必修 #2**：窄屏（`390×844`）E2E 增加对 `[role=dialog]`、`[data-station-explorer]`、`[data-local-db-probe]` 等 `position: fixed` 元素的 `getBoundingClientRect().right <= innerWidth` 断言；
   - 生产页断言 `getComputedStyle(document.body).margin === '0px'` 与 `boxSizing === 'border-box'`（验证 `base.css` 生效）；
   - **小项 #8**：在测试中或构建校验中显式断言生产入口主 chunk 压缩后未静态卷入 `three` 与 `maplibre-gl`；
   - **小项 #9 & #10**：补齐枢纽 chunk 正向对照断言、语言切换刷新后重新验证 `--sk-*` CSS 变量与 URL query；
   - 新增 Atlas 搜索防误并、运营商筛选、百科抽屉与双向跳转的 Vitest + Testing Library 测试。
3. 运行 `pnpm check && pnpm build && pnpm test && pnpm --filter @senkiro/web test:e2e`，确认全部通过。
4. 按 `docs/dispatch/HANDOFF_PROTOCOL.md` 撰写并提交 `docs/dispatch/reports/p1-s2-atlas-ui.md`（`READY_FOR_MERGE`）。
````
