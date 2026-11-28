# Dispatch Brief · P0-S2（Wave 1 并行 · 命令式 `Three.js` 车站 3D/2D 引擎统一与梅田/新宿双数据包）

> **执行轮次**：Wave 1（需在 `P0-W0` 合入 `integration/phase-0` 后启动；与 `P0-S1`、`P0-S3` 三路并行）  
> **推荐订阅模型**：GPT / Codex 或 Gemini  
> **基准分支**：`integration/phase-0`（已合入 `P0-W0`）  
> **新建分支**：`feat/p0-station-3d`  
> **建议工作树路径**：`E:\Workteree\SENKIRO\p0-station-3d`  
> **独占路径 `ownedPaths`**：
> - `packages/station-3d/**`
> - `packages/data-stations/**`
> - `pnpm-lock.yaml`（仅限上述 2 个包安装依赖时由 pnpm 自动更新；**严禁修改根 `package.json` 与其他根配置文件**）
> - `docs/dispatch/reports/p0-s2-station-3d.md`

---

## 📋 一键复制启动提示词（直接粘贴给新工作树内的 Agent）

````markdown
你正在独立 Git Worktree 中执行 SENKIRO 主线 Phase 0 Wave 1 并行任务 `P0-S2`。
请先完整阅读以下资料：
1. `docs/plan-v1.0.md`（§0.2 Lab B/C 成果、§0.3 命令式 Three.js 选型）
2. `docs/01-domain-contract-v1.0.md`（§5.2 `StationGraph` 与 `StationHubDataset` 契约）
3. `docs/lab-reports/scores.md`
4. `docs/dispatch/HANDOFF_PROTOCOL.md`
5. `packages/contracts/src/` 下的实际 TypeScript 定义

### 你的边界铁律
- **当前分支**：确认基于合入 `P0-W0` 后的 `integration/phase-0` 切出 `feat/p0-station-3d`（先运行 `pnpm install --frozen-lockfile` 继承 Wave 0 锁定环境）。
- **独占修改范围 `ownedPaths`**：仅允许创建/修改 `packages/station-3d/**`、`packages/data-stations/**`、`docs/dispatch/reports/p0-s2-station-3d.md`，以及本包依赖安装自动触发的 `pnpm-lock.yaml`。严禁修改根 `package.json`、`tsconfig.base.json`、`biome.json`、`packages/contracts/**`、`apps/web/**` 或他人包目录！
- **Wave 0 工具链与 TS 配置对齐（必读）**：
  - 根锁文件已锁定 `TypeScript 7.0.2`、`Biome 2.6.9`、`Vitest 5.1.2`、`Zod 4.6.7`。
  - `tsconfig.base.json` 已开启 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`verbatimModuleSyntax`、`rewriteRelativeImportExtensions` 且默认 `lib: ["ES2023"]`：请为 `packages/station-3d/tsconfig.json` 显式追加 `"lib": ["ES2023", "DOM", "DOM.Iterable"]` 与 `"jsx": "react-jsx"`，写内部相对导入使用 `.ts`/`.tsx` 后缀，并为两包各自配置 `tsconfig.build.json` 与 `vitest.config.ts`（接入根 `vitest.config.ts`）。
  - 直接复用 `@senkiro/contracts` 已落地的类型与辅助器：`StationHubDataset`、`StationPlace`、`StationLink`、`StationExternalLink`、`StationRouteQuery`、`StationRouteResult`（`StationRouteFound | StationRouteNotFound`，`distanceMeters: null`、`durationMinutes: null`）、`isPaidFareZone`、`parseLegacyLabId`（**重要**：转换 Lab B/C 历史 `passage` ID 时必须显式传 `{ entity: 'place' }` 或 `{ entity: 'link' }`，否则 `parseLegacyLabId` 会拒绝猜测！且不改写 slug 大小写）。
- **提取 Lab B / Lab C 资产的唯一合法方式**：
  - 使用 `git show lab/b-umeda-3d:labs/b-umeda-3d/<path>` 读取梅田最新基线（已含三语 `namesZh.ts` 与命令式 Three.js 合批渲染器）；
  - 使用 `git show lab/c-shinjuku-3d:labs/c-shinjuku-3d/<path>` 读取新宿完整 V1–V3 室内数据、寻路算法与 2D 横向分栏排布；
  - **严禁切分支、严禁修改 `labs/` 或 `labs/_worktrees/*` 内任何文件**！
- **核心架构硬约束**：**严禁安装或使用 `@react-three/fiber`、`@react-three/drei`**！全仓统一为 **原生命令式 `Three.js` + `InstancedMesh` + `render-on-demand`（按需渲染，静止零空转）+ 卸载完全 `dispose` 释放显存 + 薄 React 桥接组件 `<StationExplorer />`**。
- **Git 提交署名**：每次 `git commit` 末尾必须包含：
  `Co-authored-by: gemini-code-assist[bot] <176961590+gemini-code-assist[bot]@users.noreply.github.com>`

### 分里程碑执行要求
- **M1（`@senkiro/station-3d` 核心寻路、校验与 2D 横向分栏抽离）**：
  - 实现纯 TS 室内拓扑图构建、改札内外边界校验（绝不允许跨越未核实跨社闸内连络边、绝不穿过 `roadway`）、字典序无台阶优先寻路（`standard` 与 `step_free` 双模式）；
  - 融合 Lab B 共享比例尺与 Lab C 横向分栏排布算法，实现独立无状态 `<StationPlan2D />` React SVG 组件（支持楼层筛选、点击选中节点、高亮寻路路径、方向指北针与诚实 `UnknownValue` 呈现）；
  - 编写室内寻路与图校验单元测试，绿灯 `git commit`（M1）。
- **M2（原生命令式 `Three.js` 场景内核 + 薄桥接 `<StationExplorer />`）**：
  - 以 Lab B `Scene.tsx`（3 Draw Call `InstancedMesh` 命令式管线 + 按需渲染）为底座，吸收 Lab C 的精细建筑元素（楼板开口护栏、梯段端部提示条、闸机阵列、站台门与终端车挡）以及独立深浅色场景主题（石墨深色 `#262b33` 与浅色模式）；
  - 封装纯命令式类 `StationSceneController`（支持 `setDataset`、`setActiveLevel`、`setExploded`、`setSelection`、`setRouteHighlight`、`setTheme`、`setLocale`、`focusPlace`、`dispose`），静止状态下不得开启无意义的 `requestAnimationFrame` 空转；
  - 封装薄 React 桥接组件 `<StationExplorer />`：串联 `<StationPlan2D />`、命令式 3D 画布、楼层控制器、起终点寻路面板、设施详情与 `SourceRecord` 溯源弹窗，外部仅通过标准 Props（`dataset`, `locale`, `theme`, `selectedId`, `onSelect`, `onNavigateExternalLine?`）驱动，为 Phase 1/5（Web 与 Expo `"use dom"`）提供统一接口。
  - 绿灯 `git commit`（M2）。
- **M3（`@senkiro/data-stations` 梅田 & 新宿双数据包转化与全图不变量验收）**：
  - 将 `lab/b-umeda-3d` 梅田七站 + Whity 数据与 `lab/c-shinjuku-3d` 新宿八站 + 三丁目 + 西口数据规范化转换为符合 `StationHubDataset` v1.0 契约（含四段式 `SkId` 与完整 `SourceRecord` / `LocalizedNames`）的数据包，导出 `umedaHubDataset` 与 `shinjukuHubDataset`（及按需异步加载入口）；
  - 运行全对有序节点寻路不变量测试（涵盖梅田七站与新宿十层全节点对，标准模式与无台阶模式均零不变量报错）及 `<StationExplorer />` 切换枢纽/楼层/深浅色/三语的组件单测；
  - 在工作树根目录运行 `pnpm check && pnpm build && pnpm test`，确认全部通过、0 错误 0 警告；
  - 按 `docs/dispatch/HANDOFF_PROTOCOL.md` 撰写并提交 `docs/dispatch/reports/p0-s2-station-3d.md`（`READY_FOR_MERGE`）。
````

---

## 特别注意

- Lab C 的 `data/manual/*.ts` 规模较大，建议在 `@senkiro/data-stations` 中编写可复现转换/校验脚本并同步运行校验，切勿在未核实 `SourceRecord` 的前提下删减 provenance 追溯链。
- 严格把控主包渲染性能与显存释放，确保在 `dispose()` 后 Three.js `geometry`、`material`、`renderer` 完整销毁。
