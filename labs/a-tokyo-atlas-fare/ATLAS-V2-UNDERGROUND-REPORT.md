# SENKIRO Atlas v2 — Underground Railway Geometry & Tunnel System Report

**Branch / Worktree**: `underground_railway_geometry_system` (base `6001e82`)
**Scope**: Complete procedural 3D underground railway modeling system replacing translucent line-tinted tubes with enterable dual-surface solid tunnels, enlarged underground station caverns, neutral realistic underground railway infrastructure, subterranean lighting, spatial chunking, and Camera / Virtual Train query contracts.
**Coordinate Discipline**: Strictly reuses `src/three/geoProjection.ts` (`TOKYO_ORIGIN`, `+X East`, `+Y Up`, `-Z North`, `1 unit = 1m`) and `src/domain/elevationSolver.ts` (`SolvedRailwayNetwork3D`) — zero conflicting global coordinate systems introduced, and global `cameraController.ts` was NOT rewritten.

---

## 1. 模块清单与架构分层

```text
labs/a-tokyo-atlas-fare/src/
├── domain/underground/                  # 纯 TypeScript（零 React/Three.js 依赖，可复用、可单测）
│   ├── tunnelTypes.ts                   # 断面、限界、TrackFrame3D、观察位、碰撞禁入体、剖切状态与 UndergroundRailwayQueryAPI 契约
│   ├── tunnelProfileSpecs.ts            # 盾构圆/矩形盒/单双线/岛式&侧式站台洞室/过渡连接段 24 顶点统一断面 + 列车限界数学校验
│   └── tunnelCenterlineBuilder.ts       # 统一拓扑中心线平滑加密、端点折返修剪、欧氏站台避碰裁剪、洞口与观察位生成
├── three/underground/                   # Three.js 实体建模、材质、照明与分块渲染
│   ├── tunnelMaterials.ts               # 中性写实 PBR 混凝土管片/浇筑墙/磨损接缝/道床/钢轨/设施纹理 + 洞内深度衰减 Shader
│   ├── tunnelShellBuilder.ts            # 真实双面实心壳体（独立内衬 FrontSide + 外壳 FrontSide + 环形端盖 + 镂空洞门 + 站台大空间）
│   ├── undergroundTrackBuilder.ts       # 无砟道床、标准/窄轨钢轨、短轨枕实例化、检修步廊、电缆槽、第三轨/刚性接触网、灯具与信号机
│   ├── tunnelLightingSystem.ts          # 零每帧分配的相机跟随 6 光源 PointLight 池（吸附最近真实灯具锚点）
│   ├── lineOverlayHighlight.ts          # 独立运营线路色彩信息高亮层（默认关闭，实体轨道保持中性写实色）
│   └── UndergroundRailwaySystem.ts      # 按区段分块、视锥+距离剔除、懒构建细部、完整实现 UndergroundRailwayQueryAPI
└── three/
    ├── generators/railTrackGenerator.ts # 地上/高架区段精确裁剪至 y = -2.4m 洞口交点，与地下轨道零重叠零 Z-fighting
    ├── generators/tunnelGenerator.ts    # 移除旧半透明纸壳与实心封堵洞门及穿模地下站台板，保留地面/高架站台与换乘指示
    └── Metropolitan3DScene.ts           # 接入 UndergroundRailwaySystem、入洞自动降 near 至 0.25m、锁定 1:1 竖向比例、暴露 __SENKIRO_UNDERGROUND__
```

---

## 2. 试点验收区间与 6 项验收标准核验

**主试点区间（100% OSM 地下证据 + 人工核实相对高程）**：
- **东京地铁银座线**：`渋谷 → 表参道 → 外苑前 → 青山一丁目`（高架 3F `+14m` → 镂空混凝土洞口 `y = -2.4m` → 明挖双线矩形隧道 `-10m` → 扩大地下站台洞室 `表参道` / `外苑前` → 第三轨供电）
- **涩谷/表参道深层对照**：**副都心线** `渋谷 → 明治神宮前`（`L-3 / -30m` 盾构圆形预制管片隧道 + 刚性接触网）与 **半藏门线** `表参道 → 青山一丁目`（`L-2 / -18m`）
- **交叉验证区间**：**丸之内线** `東京 → 大手町 → 淡路町 → 御茶ノ水`（大手町多层立体交叉 + 神田川洞口）

| 验收项 | 结果 | 核验证据 |
| --- | --- | --- |
| **1. 隧道内部可观察** | **PASS** | 实拍截图验证银座线矩形隧道、表参道地下站台大空间、副都心线圆形盾构、丸之内线矩形隧道均可进入并清晰观察纵深。 |
| **2. 轨道及周边设施可辨认** | **PASS** | 钢轨（1435mm/1067mm）、无砟整体道床、实例化短轨枕、双侧混凝土检修步廊与护栏、墙侧多层电缆槽、第三轨防护罩 / 顶部刚性接触网与悬吊架、顶灯、中柱、轨旁信号机与应急标牌全部清晰可辨，且保持写实中性色。 |
| **3. 相机进入后无错误空洞或透明面** | **PASS** | 独立内衬 (`FrontSide`) + 外壳 (`FrontSide`) + 环形壁厚端盖（0.38–0.62m），单测数学校验 100% 内衬法线朝内、外壳法线朝外；入洞自动将 `camera.near` 降至 `0.25m` 防止近裁切墙；修剪 GIS 端点折返并做欧氏站台避碰裁剪，消除区间穿入站台洞室问题。 |
| **4. 与地面、高架轨道坐标一致** | **PASS** | 复用统一 `TOKYO_ORIGIN` 与 `SolvedRailwayNetwork3D`，在 `y = -2.4m` 精确线性插值交点衔接 `RailTrackLayer` 与 `UndergroundRailwaySystem`（双线中心距统一 `±1.85m`、轨顶高程统一 `+0.48m`），涩谷洞口实拍验证高架/地面轨道连续贯通进入隧道。 |
| **5. 能容纳后续虚拟列车** | **PASS** | 单测 `validateTrainClearance` 覆盖 8 种断面 × 标准轨/窄轨 × 第三轨/刚性接触网，数学验证日本地铁动态车辆限界（车宽 `2.95m`、车顶 `3.95m`、受电弓 `4.42m` + 安全余量 `>= 0.18m`）与内衬、站台、步廊、中柱零干涉；提供 `sampleTrackFrame(segmentId, distM, trackIndex)` 供列车直接贴轨运行。 |
| **6. 无明显 Z-fighting 或深度错误** | **PASS** | 地面/地下轨道在 `y = -2.4m` 严格分段无重叠，内外墙厚度 `>= 0.38m`，道床/钢轨/步廊/站台间留足物理间隙，配合 `logarithmicDepthBuffer: true` 与自适应近裁剪面，7 组实拍截图无闪烁与深度撕裂。 |

> **诚实性声明**：所有地下垂直深度仍来自既有示意分层（`L-1..-4`），全链路类型与 UI 均显式标注 `depthReliability: 'schematic'`（模式相対深度），不冒充官方竣工埋深测绘数据。

---

## 3. 实测性能记录（Playwright Headless Chrome · SwiftShader 软件 WebGL · `1440×900`）

通过 `node labs/a-tokyo-atlas-fare/scripts/eval-underground.mjs` 实测优化前后对比（硬件 GPU 浏览器下通常可达 30–60 FPS）：

| 视图场景 | 优化前 DC / Tris | **最终版 DC** | **最终版 Tris** | **SwiftShader FPS** | 地下块/灯光遥测 |
| --- | --- | --- | --- | --- | --- |
| **00 地面基准 (`surface-baseline`)** | 154 / 721k | **154** | **721k** | **2.9** | `visChunks=0, caverns=0`（不可见隧道 0 绘制） |
| **01 涩谷地下开削 (`shibuya-cutaway`)** | 532 / 1,962k | **394** (-26%) | **1,796k** | **1.4** | `visChunks=12, caverns=10` |
| **02 银座线矩形隧道内部 (`ginza-box`)** | 1,673 / 2,598k | **371** (-78%) | **1,758k** | **0.7** (3.5×) | `det=5, lights=6, interior=true` |
| **03 表参道地下站台大空间 (`omotesando`)** | 1,658 / 2,639k | **287** (-83%) | **1,555k** | **0.8** (4.0×) | `caverns=3, lights=6` |
| **04 副都心线盾构圆隧道 (`fukutoshin`)** | 1,381 / 2,539k | **244** (-82%) | **1,516k** | **1.0** (3.3×) | `det=3, lights=6` |
| **05 银座线涩谷洞口 (`shibuya-portal`)** | 1,943 / 2,563k | **359** (-82%) | **1,596k** | **0.8** (2.7×) | `portals=48` |
| **06 顶板剖切+线路叠层 (`roof-cutaway`)** | 1,093 / 2,528k | **464** (-58%) | **1,808k** | **1.0** (3.3×) | `roofCut=true, lineOverlay=true` |
| **07 丸之内线矩形内部 (`marunouchi`)** | 881 / 1,922k | **349** (-60%) | **1,337k** | **1.3** (4.3×) | `det=9, lights=6` |

- **Console Errors**: `0`
- **Page Errors**: `0`
- **核心优化手段**：按区段分块（303 个 `TunnelChunk` + 301 个 `StationCavern`）+ 视锥与距离双重剔除（封闭洞内 `420m` 裁剪，配合 `235m` 深度衰减）+ 封闭入洞时自动跳过不可见地表建筑与地形绘制 + 重复设施全 `InstancedMesh` + 零每帧几何重建。

---

## 4. 自动化构建与测试结果

- **TypeScript + Vite 生产构建** (`npm run build`): **PASS**（0 TS 错误）
- **Vitest 单元测试** (`npm test`): **4 files, 49/49 PASS**（含新增 `tests/unit/undergroundGeometry.test.ts` 7 项核心几何/限界/法线/洞口连续/站台避碰单测）
- **Playwright E2E 交互测试** (`npm run test:e2e`): **13/13 PASS**（全量跑通 Tests 1–12 零回归，修复 `exitTunnelInterior()` 返回地面相机抬升后定向复跑 Test 13 通过，0 Console/Page Errors）

---

## 5. 与总协调 Session 0（`docs/atlas-v2/CONTRACTS.md`）对齐接口清单

本分支已导出完整接口 `UndergroundRailwayQueryAPI`（定义于 `src/domain/underground/tunnelTypes.ts`，实现于 `UndergroundRailwaySystem`，挂载于 `Metropolitan3DScene.getUndergroundAPI()` 与 `window.__SENKIRO_UNDERGROUND__`），待与 Session 0 对齐：

1. **相机 Session 对接**：
   - `getEnterableSegments()` / `getCuratedViewpoints()` / `getStationCavernBounds(stationId)`
   - `sampleTrackFrame(segmentId, distanceM, trackIndex?)`（中心线坐标、`tangent/right/up` 正交标架、坡度 `grade`、深度可信度）
   - `projectPointToNearestTunnel(worldPos, maxDistM?)`（最近区段投影与 `insideClearance` 判定）
   - `getClearanceConstraint(segmentId)`（安全相机包络与中柱/步廊/站台禁入盒）
   - `setSectionCutState({ mode, revealAllRoofs, hideOuterShellForSegmentIds, revealRoofForSegmentIds, lineOverlayVisible })`
2. **环境升级 Session（`tokyo_environment_upgrade`）对接**：
   - `getPortalCutoutHints()` 返回全部 48 个洞口的 `{ centerX, centerZ, dirX, dirZ, lengthM, widthM }`，供地表地形在洞口斜坡段精准开口，无需依赖径向开削即可直接从地上驶入洞口。
3. **虚拟列车 Session 对接**：
   - `sampleTrackFrame(segmentId, distM, 0 | 1)` 直接返回精确轨顶坐标（`TOR = centerline.y + 0.48m`，双线 `±1.85m`）与前向切线，所有隧道断面均已通过 `2.95m × 4.42m + 0.18m` 动态限界验证。
