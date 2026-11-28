# Dispatch Report · P0-S2 (station-3d)

- **Status** `READY_FOR_MERGE`
- **Branch** `feat/p0-station-3d`
- **Base Commit** `4baebcb`
- **Validated code commit** `a277df9b47daa68d230096545c056dbe654b2613`。随后提交本报告。
- **Models** Claude Opus 5.5（M1 初始实现），Codex（M1 收尾至 M3）

## 1. Owned Paths Check

通过。提交路径均在两个独占包、本报告以及离线安装更新的锁文件内。Lab B 和 Lab C 资产通过 `git show <lab-branch>:<path>` 读取。

`git diff --name-only 4baebcb...HEAD` 完整输出如下。

```text
docs/dispatch/reports/p0-s2-station-3d.md
packages/data-stations/package.json
packages/data-stations/scripts/common.mjs
packages/data-stations/scripts/lab-b.mjs
packages/data-stations/scripts/lab-c.mjs
packages/data-stations/scripts/manifest.mjs
packages/data-stations/scripts/migrate.mjs
packages/data-stations/src/index.ts
packages/data-stations/src/shinjuku-links.ts
packages/data-stations/src/shinjuku-places.ts
packages/data-stations/src/shinjuku.ts
packages/data-stations/src/umeda.ts
packages/data-stations/tests/hubs.test.ts
packages/data-stations/tsconfig.build.json
packages/data-stations/tsconfig.json
packages/data-stations/vitest.config.ts
packages/station-3d/package.json
packages/station-3d/src/graph/build.ts
packages/station-3d/src/graph/policy.ts
packages/station-3d/src/graph/validate.ts
packages/station-3d/src/i18n.ts
packages/station-3d/src/index.ts
packages/station-3d/src/plan2d/StationPlan2D.tsx
packages/station-3d/src/plan2d/layout.ts
packages/station-3d/src/route/search.ts
packages/station-3d/src/scene/StationSceneController.ts
packages/station-3d/src/scene/geometry.ts
packages/station-3d/src/theme.ts
packages/station-3d/src/ui/StationDetails.tsx
packages/station-3d/src/ui/StationExplorer.tsx
packages/station-3d/src/ui/UnknownValue.tsx
packages/station-3d/tests/explorer.test.tsx
packages/station-3d/tests/fixtures.ts
packages/station-3d/tests/plan2d.test.tsx
packages/station-3d/tests/render.tsx
packages/station-3d/tests/route.test.ts
packages/station-3d/tests/scene.test.ts
packages/station-3d/tests/validate.test.ts
packages/station-3d/tsconfig.build.json
packages/station-3d/tsconfig.json
packages/station-3d/vitest.config.ts
pnpm-lock.yaml
```

## 2. Milestones Completed

- [x] **M1** `2f22d12` 修复 `StationPlan2D` 的 7 条 Biome 诊断。SVG 设施支持 Tab、Enter 和 Space，Escape 清除选中。矩形和轨道使用稳定键，SVG 语义规则的例外记录在对应元素处。
- [x] **M2** `e2daee5` 新增原生 Three.js 场景控制器。使用 OrbitControls、单一不透明 `InstancedMesh` 和射线拾取。状态变更、拖动和定位动画触发绘制，静止时无待执行帧。卸载释放实例缓冲、共享几何和材质、渲染器及上下文。楼板开口护栏、梯段端部提示条和闸机阵列为示意造型。站台门与车挡由相应的数据字段控制。
- [x] **M2** `<StationExplorer />` 整合 3D 与横向分栏平面图、楼层筛选与展开、起终点寻路、设施详情、官方外链和来源弹窗。无 WebGL 时回退到平面图。Props 支持三语、深浅色及由外部控制选中状态。
- [x] **M3** `a277df9` 导出 `umedaHubDataset`、`shinjukuHubDataset`、`umedaHub` 和 `shinjukuHub`，两个枢纽均可通过包子路径动态导入。保留主控给定的 N02-24 坐标、KSJ ID、组 ID 与来源记录。

| 枢纽 | 车站 | 楼层记录 | 地点 | 连接 | 来源 | 双模式有序节点对 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 梅田 | 7 | 20 | 171 | 194 | 36 | 58,482 |
| 新宿 | 10 | 31 | 521 | 678 | 36 | 542,882 |

`pnpm --filter @senkiro/data-stations migrate:labs` 从本地 Lab ref 重建已提交的数据模块。安装和编译直接使用这些模块。Lab C 连续垂直停靠点逐段相连，已记录的跨层直达保留 `declaredSpan`，两处出口专用闸机按闸内到闸外通行。梅田仅有番线组级证据的服务保留原番线组，缺少方向文案时使用全空的 `LocalizedNames`。

## 3. Verification Results

- M1 包内 `pnpm exec biome check --error-on-warnings .` 复现原始 7 条错误，修复后 0 错误、0 警告。包级 `check`、`typecheck`、`build` 和 `test` 均通过，3 个测试文件、31 项测试。
- M2 包级 `check`、`typecheck`、`build` 和 `test` 均通过，5 个测试文件、39 项测试。M3 收尾增加 1 项真实 Three.js 射线拾取单测，最终车站引擎共 40 项。
- `pnpm install --offline` 通过并生成新包的 workspace 锁定条目。pnpm 输出一条可选 peer `jsdom` 的兼容性提示，`station-3d` 的直接开发依赖和 jsdom 单测均正常使用。
- 最终在指定工作树根设置 `TURBO_FORCE=true` 和工作树内的 `TURBO_CACHE_DIR`，运行 `pnpm check && pnpm build && pnpm test`，退出码 0。Biome 检查 71 个文件，0 错误、0 警告。3 个包通过类型检查和构建。14 个测试文件共 123 项通过，分为 `contracts` 75 项、`station-3d` 40 项、`data-stations` 8 项。首次全仓运行使用 Turbo 的默认共享缓存，最终验收使用指定工作树自己的缓存。
- `validateStationHubDataset` 对两个数据集均返回零问题。独立遍历核对全部 601,364 个有序节点对与寻路模式组合，逐步检查连接、方向、付费区边界和无台阶条件，并核对不可达时的 `reachable: false` 及原因。车道节点也禁止作为起终点。
- 3D 生命周期测试使用 jsdom 和模拟 WebGL 渲染器。真实 GPU 绘制性能、浏览器画面和 Expo WebView 留待下游实机验收。

## 4. Contract Requests

请在主控契约加入可选的 `StationHubDataset.planNorth?: PlatformSide`。方位取值为 `'x-' | 'x+' | 'z-' | 'z+'`，缺省代表未核实。目前由枢纽包装对象传给平面图，梅田为 `'z-'`，新宿为 `'x-'`。上提后，下游可直接从数据集获得平面方位。

Expo 阶段可在消费端的默认导出入口声明 `'use dom'`，并在该入口衔接异步 native actions。共享包提供普通 React DOM 组件及约定的 Props。[Expo DOM components 文档](https://docs.expo.dev/guides/dom-components/)

## 5. Open-Source & Honesty Self-Check

- [x] 提交内容为规范化数据、来源记录、官方链接、迁移脚本、引擎与测试。原始构内图、受限时刻表、API 密钥和 `data/raw/` 均未进入提交。
- [x] 17 个车站和两个复合体均引用 `sk:source:jp:mlit-ksj-n02-24`。室内形状与高度使用 Lab 示意坐标，寻路距离与用时保持 `null`。
- [x] 组件测试使用明确标为 `synthetic` 的设施。正式包仅发布采纳的室内图及其来源。
