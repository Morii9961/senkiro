# Codex 接力派单书 · P0-S2（继续完成 M1 收尾 + M2 + M3）

> **接力背景**：原 Claude 会话已完成 M1 核心图构建、寻路、2D 横向分栏 `<StationPlan2D />` 与 31/31 单测（WIP 提交 `df77a7e`），因 5 小时窗口配额耗尽按协议安全停机（`PAUSED_QUOTA`）。  
> **接力模型**：**Codex（GPT）**  
> **复用已有工作树与分支（无需新建 worktree）**：
> - 工作目录：`E:\Workteree\SENKIRO\p0-station-3d`
> - 当前分支：`feat/p0-station-3d`（当前 HEAD：`df77a7e`；`three@0.187.0`、`react@19.3.1`、`jsdom@31.0.1` 已锁定安装完毕）
> **独占路径 `ownedPaths`**：
> - `packages/station-3d/**`
> - `packages/data-stations/**`
> - `pnpm-lock.yaml`（仅限本包 workspace 链接或依赖更新时由 pnpm 自动更新；**严禁修改根 `package.json` 与其他根配置文件**）
> - `docs/dispatch/reports/p0-s2-station-3d.md`

---

## 主控对原报告 4 项 Contract Requests 的正式裁定（必读）

1. **车站与复合体坐标（保持 `LonLat` 非空，正式授权采用官方 KSJ N02-24）**：
   - 正式批准使用已核验合规的 **国土交通省 国土数値情報 鉄道データ（N02-24）** 坐标（`CC BY 4.0` 互换、`commercialUse: 'yes'`、`redistribution: 'yes'`、`shareAlike: false`），**不要把 `Station.coordinates` 改为 `null`**。下方提示词已内嵌主控从官方 `N02-24_Station.geojson` 提取好的梅田 7 站与新宿 10 站精确质心坐标，直接写入 `@senkiro/data-stations` 并将 `'sk:source:jp:mlit-ksj-n02-24'` 登记进数据集 `sources` 与各站 `provenance.sourceIds`。
2. **平面图朝向 `planNorth`**：保持 `<StationPlan2D planNorth? />` 与 `<StationExplorer planNorth? />` 作为显式可选 Prop（缺省时指北针诚实显示「未核实」）；`@senkiro/data-stations` 除导出标准 `StationHubDataset`（`umedaHubDataset`、`shinjukuHubDataset`）外，同时导出包含 `planNorth` 的元数据封装对象 `umedaHub`（`planNorth: 'z-'`）与 `shinjukuHub`（`planNorth: 'x-'`），并在报告登记 `StationHubDataset.planNorth` 供 Exit Gate 0 上提契约。
3. **梅田站台线路关联（`serviceLineIds`）**：同时只读读取 `git show lab/b-umeda-3d:labs/b-umeda-3d/data/processed/services.json`，将 `boarding` 与已核实的站台服务线路映射为 `StationPlace.tracks: PlatformTrack[]`（未核实具体去向文案的字段保持 `null` 的 `LocalizedNames`，严禁编造终点）。
4. **`UnknownValue` 组件**：Wave 1 期间保留 `@senkiro/station-3d` 内轻量 `<UnknownValue />`，避免跨分支耦合 `P0-S3`。

---

## 📋 一键复制 Codex 接力启动提示词（直接粘贴到 `E:\Workteree\SENKIRO\p0-station-3d` 窗口）

````markdown
你正在接力完成 SENKIRO Phase 0 任务 `P0-S2`（M1 收尾 + M2 + M3）。请直接在当前工作树 `E:\Workteree\SENKIRO\p0-station-3d`（分支 `feat/p0-station-3d`）继续开发，**不要新建工作树**。

### 先读再做（只读上下文）
1. 阅读交接报告：`docs/dispatch/reports/p0-s2-station-3d.md`（已写明已完成模块、7 条待修 Biome lint 及数据映射规则）。
2. 阅读契约与规范：`docs/01-domain-contract-v1.0.md`、`docs/dispatch/HANDOFF_PROTOCOL.md`、`packages/contracts/src/station.ts` 与 `packages/station-3d/src/` 已有代码。

### 边界铁律（严格遵守）
- **独占修改范围**：仅限修改 `packages/station-3d/**`、`packages/data-stations/**`、`docs/dispatch/reports/p0-s2-station-3d.md` 与 `pnpm install` 触发的 `pnpm-lock.yaml`。
- **绝对禁区**：严禁碰 `E:\SENKIRO` 主目录（另有并发会话）、严禁修改 `labs/`、`packages/contracts/**`、`apps/web/**`、根 `package.json` / `tsconfig.base.json` / `biome.json` / `vitest.config.ts`。
- **读取 Lab B / Lab C 资产的唯一方式**：仅用 `git show lab/b-umeda-3d:labs/b-umeda-3d/<path>` 与 `git show lab/c-shinjuku-3d:labs/c-shinjuku-3d/<path>` 只读读取，严禁切分支。
- **核心 3D 架构红线**：**严禁引入 `@react-three/fiber` 或 `@react-three/drei`**！全仓统一为原生命令式 `Three.js` + `InstancedMesh` + `render-on-demand`（静止零空转）+ 卸载完整 `dispose()` + 薄 React 桥接 `<StationExplorer />`。
- **Git 提交署名**：每次 `git commit` 末尾必须包含：
  `Co-authored-by: gemini-code-assist[bot] <176961590+gemini-code-assist[bot]@users.noreply.github.com>`

---

### Milestone 1 收尾：修复 7 处 Biome 报错并落地正式 M1 提交

1. 进入 `packages/station-3d` 运行 `pnpm exec biome check --error-on-warnings .` 查看当前 7 条错误（主要为 `StationPlan2D.tsx` 中可点击 `<g>` 缺少无障碍交互属性及 `noArrayIndexKey`）：
   - 为交互式 `<g>` 补齐标准无障碍属性：`role="button"`、`tabIndex={0}`、`aria-label={...}` 及 `onKeyDown`（支持 `Enter` / `Space` 触发选中）；
   - 将索引 key 替换为稳定复合 key（如 `${place.id}-rect-${rect.x0}-${rect.z0}-${rect.x1}-${rect.z1}` 或带稳定序号键）。
2. 运行 `pnpm --filter @senkiro/station-3d check && pnpm --filter @senkiro/station-3d typecheck && pnpm --filter @senkiro/station-3d build && pnpm --filter @senkiro/station-3d test`，确认 `31/31` 单测通过且 **0 错误 0 警告**。
3. 执行干净的新增提交 `fix(station-3d): M1 resolve Biome a11y/key checks for StationPlan2D`（直接新增提交，无需 `--amend`）。

---

### Milestone 2：`StationSceneController`（命令式 Three.js）+ `<StationExplorer />`

1. 只读参考 `git show lab/b-umeda-3d:labs/b-umeda-3d/src/Scene.tsx`（3 Draw Call `InstancedMesh` 命令式管线与 `render-on-demand`）及 `git show lab/c-shinjuku-3d:labs/c-shinjuku-3d/src/ui/scene/arch/...`（楼板开口护栏、梯段端部提示条、闸机阵列、站台门与终端车挡）和 `sceneTheme.ts`（深色石墨 `#262b33` 与浅色配置）。
2. 实现纯命令式类 `StationSceneController`：
   - 接收挂载容器 `HTMLElement`，内部管理 `Scene`、`PerspectiveCamera`、`WebGLRenderer`、Orbit/平移/缩放交互及射线拾取；
   - **严格按需渲染（`render-on-demand`）**：静止状态下禁止持续 `requestAnimationFrame` 空转，仅在交互拖拽、聚焦动画或状态变更时重绘；
   - 暴露方法：`setDataset`、`setActiveLevel`、`setExploded`、`setSelection`、`setRoute`、`setTheme`、`setLocale`、`focusPlace`、`resetView`、`dispose`（销毁全部 geometry / material / renderer 释放显存）；
   - 在 jsdom / 无 WebGL 上下文环境优雅降级（暴露只读状态/统计方法且不抛未捕获异常），确保组件单元测试顺畅执行。
3. 实现薄 React 桥接组件 `<StationExplorer />`：
   - Props 接口对齐下游 Web 与 Phase 5 Expo `"use dom"` 嵌入：`dataset: StationHubDataset`、`planNorth?: 'x-' | 'x+' | 'z-' | 'z+'`、`locale?: Locale`、`theme?: 'light' | 'dark'`、`selectedId?: string | null`、`onSelect?: (id: string | null) => void`、`onNavigateExternalLine?: (lineId: SkId<'line'>) => void`；
   - 整合 3D 视口 / `<StationPlan2D />` 横向分栏切换、楼层控制器（`All` / 单层 / `Explode`）、起终点寻路与 `step_free` 无台阶开关、选中设施详情卡、官方构内图/时刻表外链（`externalLinks`）与 `SourceRecord` 溯源弹窗。
4. 编写 `StationSceneController`（含按需渲染与 `dispose`）及 `<StationExplorer />`（枢纽切换、楼层切换、无台阶寻路、三语/深浅色切换）单元测试，跑通本包 `check / build / test` 后执行 M2 `git commit`。

---

### Milestone 3：`@senkiro/data-stations`（梅田 7 站 + 新宿 10 站）与全仓验收

1. **新建 `packages/data-stations`**（配置 `package.json` 依赖 `@senkiro/contracts: "workspace:*"`、devDependencies 含 `@senkiro/station-3d: "workspace:*"`，配齐 `tsconfig.json`、`tsconfig.build.json`、`vitest.config.ts`，执行 `pnpm install --offline` 链接 workspace 依赖）。
2. **数据源只读提取与 v1.0 转换**：
   - 梅田数据来源：`git show lab/b-umeda-3d:labs/b-umeda-3d/data/processed/station.json`、`services.json`、`exits.json`、`line-styles.json` 与 `data/sources.json`（及 `data/manual/namesZh.ts` 三语名称）。
   - 新宿数据来源：`git show lab/c-shinjuku-3d:labs/c-shinjuku-3d/data/processed/station.json` 与 `data/sources.json`。
   - 严格按照 `docs/dispatch/reports/p0-s2-station-3d.md` §6 第 4 条映射规则转换：
     - Lab C 垂直起止点转为 `landing` place + `passage` link，相邻楼层停靠间建一条垂直 `link`；`exit-only` 闸机转为 `direction: 'forward'`（paid→unpaid）；出口转为 `entrance` place + `passage` link；
     - Lab B `zone: 'paid'` 按归属站转换为 `paid:<station-operator-slug>`；
     - 使用 `@senkiro/contracts` 的 `parseLegacyLabId(id, scope, options)`（`umeda` / `shinjuku` 作用域，**`sk:gate:` 与 `sk:passage:` 必须显式传 `{ entity: 'link' }`**，检测 `sk:area:x` vs `sk:platform:x` 映射后的 `place` ID 碰撞并消解）；非铁路运营方楼层（如 Busta、公共地下通路）`operatorId` 设 `null`；
     - Lab B 站台线路关联结合 `services.json` 映射为 `StationPlace.tracks: PlatformTrack[]`，无官方方向文字时 `towards` 保持全 `null`。
3. **官方 KSJ N02-24 坐标主控裁定（直接写入，严禁修改坐标或设 `null`）**：
   - 将下列官方 `SourceRecord` 加入 `umeda` 与 `shinjuku` 数据集的 `sources`，并把 `'sk:source:jp:mlit-ksj-n02-24'` 追加到所有车站及复合体的 `provenance.sourceIds`：
     - `id`: `'sk:source:jp:mlit-ksj-n02-24'`
     - `title`: `'国土数値情報 鉄道データ（N02・令和6年度 / 2024年版）'`
     - `publisher`: `'国土交通省（MLIT）'`
     - `url`: `'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02.html'`
     - `retrievedAt`: `'2026-11-21'` · `sourceDate`: `'2024'`
     - `license`: `'公共データ利用規約（第1.0版）/ CC BY 4.0 互換'`
     - `licenseUrl`: `'https://nlftp.mlit.go.jp/ksj/other/agreement.html'`
     - `commercialUse`: `'yes'` · `redistribution`: `'yes'` · `shareAlike`: `false`
     - `attributionText`: `'出典：国土数値情報（鉄道データ N02-24）（国土交通省）を加工して作成'`
   - **梅田复合体与 7 站精确坐标 `[lon, lat]`（已从 `N02-24_Station.geojson` 提取核验）**：
     - 复合体 `sk:complex:kansai:osaka-umeda`：`[135.49725, 34.70158]`（`wardOrCity: '大阪市北区'`）
     - JR 大阪（`ksj: "007068,007069"`, `ksjGroup: "007068"`）：`[135.494912, 34.702479]`
     - Osaka Metro 梅田（`ksj: "007065"`, `ksjGroup: "007065"`）：`[135.497685, 34.70313]`
     - 阪急 大阪梅田（`ksj: "007048,007049"`, `ksjGroup: "007048"`）：`[135.498332, 34.705578]`
     - 阪神 大阪梅田（`ksj: "007071"`, `ksjGroup: "007071"`）：`[135.497253, 34.701503]`
     - Osaka Metro 東梅田（`ksj: "007074"`, `ksjGroup: "007074"`）：`[135.499825, 34.70056]`
     - JR 北新地（`ksj: "007085"`, `ksjGroup: "007085"`）：`[135.497103, 34.69837]`
     - Osaka Metro 西梅田（`ksj: "007080"`, `ksjGroup: "007080"`）：`[135.495645, 34.69944]`
   - **新宿复合体与 10 站精确坐标 `[lon, lat]`（已从 `N02-24_Station.geojson` 提取核验）**：
     - 复合体 `sk:complex:kanto:shinjuku`：`[139.70061, 35.69011]`（`wardOrCity: '東京都新宿区'`）
     - JR 新宿（`ksj: "003701,003693"`, `ksjGroup: "003700"`）：`[139.70061, 35.68976]`
     - 京王 新宿（`ksj: "003700"`, `ksjGroup: "003700"`）：`[139.69858, 35.68883]`
     - 小田急 新宿（`ksj: "003683"`, `ksjGroup: "003700"`）：`[139.69965, 35.69136]`
     - 京王新線・都営新宿線 新宿（`ksj: "003700,003708"`, `ksjGroup: "003700"`）：`[139.698615, 35.68843]`
     - 都営大江戸線 新宿（`ksj: "003715"`, `ksjGroup: "003700"`）：`[139.69935, 35.687625]`
     - 西武新宿（`ksj: "003648"`, `ksjGroup: "003648"`）：`[139.70004, 35.69605]`
     - 東京メトロ 丸ノ内線 新宿（`ksj: "003672"`, `ksjGroup: "003700"`）：`[139.70068, 35.69246]`
     - 東京メトロ 新宿三丁目（`ksj: "003684,003689"`, `ksjGroup: "003689"`）：`[139.70353, 35.69149]`
     - 都営 新宿三丁目（`ksj: "003687"`, `ksjGroup: "003689"`）：`[139.70558, 35.69054]`
     - 都営 新宿西口（`ksj: "003669"`, `ksjGroup: "003669"`）：`[139.69931, 35.6925]`
4. **导出与全量不变量验收**：
   - `packages/data-stations` 导出 `umedaHubDataset`、`shinjukuHubDataset`（纯 `StationHubDataset`），以及带 `planNorth` 的 `{ dataset, planNorth: 'z-' | 'x-' }` 封装 `umedaHub` / `shinjukuHub`；
   - 编写单测跑通 `validateStationHubDataset` 及两座枢纽**全节点对**（`standard` + `step_free`）寻路不变量（绝不穿过 `'roadway'`，绝不跨越未核实跨社闸内边，不可达诚实返回 `reachable: false`）；
   - 在工作树根 `E:\Workteree\SENKIRO\p0-station-3d` 设置 `TURBO_FORCE=true` 运行：
     `pnpm check && pnpm build && pnpm test`
     确保全仓 **0 错误 0 警告全绿通过**。
   - 更新 `docs/dispatch/reports/p0-s2-station-3d.md` 为 `READY_FOR_MERGE`（附完整 `git diff --name-only 4baebcb...HEAD`、真实测试数字与 `StationHubDataset.planNorth` 契约上提请求）并提交！
````
