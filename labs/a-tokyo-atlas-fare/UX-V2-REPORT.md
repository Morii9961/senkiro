# UX-V2-REPORT — SENKIRO Atlas v2: Camera Experience & Human-Centered UX

## 1. 一句话结果

在独立工作树分支 `camera_experience_ux`（目录 `labs/a-tokyo-atlas-fare/`）完成了 **SENKIRO 3D Tokyo Atlas v2 的统一五态摄像机状态机、符合桌面端直觉的人性化交互、四级避让空间标签系统、实体详情面板（含 Station Atlas 入口、线路覆盖与来源、虚拟列车卡）以及不遮挡主画面的模拟控制栏**，同时通过 **49/49 Vitest 单元测试**、**TypeScript + Vite 生产构建（0 errors）**、**13/13 Playwright Chromium WebGL 端到端交互测试**与 **6 张实机截图人工视觉检查**。

---

## 2. 运行环境与协调边界

- **工作树与分支**：`camera_experience_ux`（基线 `6001e82`）
- **操作系统 / 运行时**：Windows (x64) · Node.js `v24.15.0` · Chromium Headless (`1440×900`, `--use-gl=angle --use-angle=swiftshader --enable-webgl`)
- **Session 0 共享接口状态**：启动时共享接口文档尚未发布，已检查旧版 `cameraController.ts` / `Metropolitan3DScene.ts` / `Tokyo3DCanvas.tsx` 后，独立设计纯 TS 状态机（`src/domain/cameraModeStateMachine.ts`）与跨分支适配契约（`src/three/uxContracts.ts`）。
- **零几何重建守则**：未自行重建城市建筑、地形、隧道或高精度列车车厢几何；仅对地下轨道/隧道材质做写实克制调优，并在 `CityChunkManager` 增加只读 OBB 碰撞查询。

---

## 3. 范围完成情况与验收核对

### 3.1 五种视角与统一状态机（`src/domain/cameraModeStateMachine.ts` + `src/three/cameraController.ts`）

| 视角 / 能力 | 状态 | 实现说明 |
| --- | --- | --- |
| **City Overview（都市俯瞰）** | 完成 | 左拖地面平移、中/右拖 3D 旋转、滚轮阻尼缩放、双击射线聚焦、`R` 键 / `全览リセット` 一键回 23 区全览 |
| **Street-Level（街路レベル）** | 完成 | 平滑降低高度至街道/高架视角（`ALT ~30m`），接入 `CityChunkManager.resolveCameraCollision` 建筑/地标 OBB 防穿模，配方向罗盘、最近地标距离提示及返回全览入口 |
| **Underground Cutaway（地下剖切）** | 完成 | GPU 径向剖切井（可调半径 `350–2400m`、固定位置、外周地表透明度、隐藏建筑、水平断面 `clipY`、竖向夸张 `1.0×–2.5×`）、`L+2..L-4` 层级筛选、单线路高亮与他线淡化 |
| **Underground Explorer（地下漫游）** | 完成 | 相机进入真实地下隧道内部（起始面朝开放区间而非死胡同端壁）；`nearPlaneMin = 0.45m` 消除近裁剪穿墙；`terrainLayer.setUndergroundCeilingOcclusion(true)` 与写深度实心混凝土隧道保持正确遮挡不漏天空；随行冷白点光源照亮管片接缝；明确显示线路/深度层/最寄站/次站/方位，支持一键跳至近接交叉隧道及一键返回地上 |
| **Train Follow（虚拟列车追従）** | 完成 | 通过 `uxContracts.ts` 接入模拟列车（默认 `SyntheticTrainSimulationProvider` + 2-DC `TrainMarkerLayer` 轻量指示标），支持 `front`（车头）/ `side`（侧面）/ `rear`（车尾）/ `cab`（驾驶室前望）固定机位切换（按钮与 `1–4` 键）、多点弦向切线+指数阻尼弯道平滑、地下区间自适应剖切/入隧、`Esc` 或按钮随时退出 |

### 3.2 人性化桌面端交互

- **一致键位**：左键点击（`< 6px`）选择车站/线路/模拟列车；左键拖拽地面连续平移（与 2D MapLibre 一致）；中键/右键拖拽旋转或自由观察（屏蔽中键自动滚屏与右键菜单）；滚轮阻尼缩放（地下漫游时沿隧道推进）；双击平滑聚焦；提供显式「自由观察（`F` 键）」开关与「全览リセット（`R`）」「地上へ戻る（`Esc`）」安全退出路径。

### 3.3 分级地图标签系统（`src/domain/labelLayout.ts` + `src/three/labelSystem.ts` + `src/ui/MapLabelsOverlay.tsx`）

- 四级分级过滤：`overview`（城区与主要枢纽）→ `mid`（主要线路去重 + 关键站点 + 地标）→ `close / street_level`（站台/层位、地铁出入口设施、线路、模拟列车）→ `underground`（地下车站、隧道层位 `L-1..L-4`、改札内外换乘井）。
- 屏幕空间避让：按选中/悬停优先级排序，220×120 网格限密（每格 ≤ 2 个非选中标签）、HUD 上下安全边距（`top: 114px, bottom: 72px`）及 4 向微调避让。Playwright 实测验证 DOM 包围盒 **零重叠**。

### 3.4 详情面板与模拟控制栏（`src/ui/DetailPanel.tsx` + `src/ui/SimulationControlBar.tsx`）

- **车站详情**：日/英/假名与站号、运营商、所属线路、StationComplex 成员、`Interchange`（改札内/外/未知及步行分钟数）、Provenance 出典与 **SENKIRO Station Atlas 入口**（含垂直层级与 `labs/c-shinjuku-3d` 衔接说明，未收录站不编造构内细节）。
- **线路详情**：运营商、线路名与分类、站序及区间营业キロ、直通运营（有则展示、无则诚实告知）、**数据覆盖等级与 SourceRecord 来源**、3D 聚焦与模拟列车追随入口。
- **虚拟列车详情**：醒目标示 **`模擬運行 · SYNTHETIC SIMULATION（非実時）`**、车型（明确标为虚拟演示编组/待接入车型资产）、所属线路、模拟方向、运行/停站/暂停状态及四机位追随按钮。
- **模拟控制栏**：底部居中单行紧凑悬浮栏，涵盖播放/暂停、速度（`0.5×–4×`）、可见列车数（`4/8/12/18`）、列车选择器、显示/隐藏开关、列车追随、重置与退出，并可折叠，实测不遮挡地图主视图与遥测芯片。

### 3.5 地下写实与品牌克制风格

- 调整 `railTrackGenerator.ts` 与 `tunnelGenerator.ts` 地下材质：地下隧道默认呈预制混凝土灰、低饱和混凝土道床与金属钢轨，不再呈现为发光彩色管线网络；线路色仅用于细肩带识别、标签左边框与选中高亮。

---

## 4. 真实运行记录（全部在最终编辑后运行）

1. **Vitest 单元测试**（`labs/a-tokyo-atlas-fare/` 内运行 `npm test`）：
   - **退出码 `0`** · **4 test files passed, 49 passed (0 failed)**
   - 含新增 `tests/unit/cameraAndLabels.test.ts`（7 tests）：覆盖五态状态机切换与安全复位、各模式近裁剪/遮挡能力、四级标签分级与零重叠布局、`SyntheticTrainSimulationProvider` 单位切线平滑与诚实性标签，以及既有 `fareEngine.test.ts` (26)、`alignmentAndData.test.ts` (9)、`elevationSolver.test.ts` (7)。
2. **TypeScript 类型检查与生产构建**（`npm run build`：`tsc --noEmit && vite build`）：
   - **退出码 `0`** · `0` TypeScript errors · 5.81s 构建 `dist/` 成功。
3. **Playwright 端到端交互测试**（`$env:PW_PORT='18485'; npx playwright test`）：
   - **退出码 `0`** · **13 passed (2.1m, 0 failed)**
   - 测试 1–7 & 10 完整回归既有 2D MapLibre、搜索、过滤、覆盖面板、JR 运价规则与 Strip Map；
   - 测试 6、8、9、11、12、13 实测验证了 3D 渲染、地下剖切层级筛选与单线高亮、模拟控制栏与虚拟列车四机位追随、真地下隧道漫游（进入隧道 `y < -5`、`W` 键推进 `> 6m`、近接隧道跳转、一键返回地上 `y > 10`）、左拖平移/中拖旋转/街景罗盘高度/自由观察飞行/全览复位、以及全览与地下剖切下屏幕标签 DOM 包围盒 **零重叠**。
4. **实机 Chromium WebGL 截图捕获与人工核查**（`scripts/capture-ux-v2.mjs`，`0` console/page errors）：
   - [01-city-overview.png](file:///C:/Users/Morii/.gemini/antigravity/worktrees/SENKIRO/camera_experience_ux/labs/a-tokyo-atlas-fare/artifacts/ux-v2-screenshots/01-city-overview.png)：都市全览、四级避让城区/枢纽标签、底部单行模拟控制栏与右下方无重叠遥测。
   - [02-street-level.png](file:///C:/Users/Morii/.gemini/antigravity/worktrees/SENKIRO/camera_experience_ux/labs/a-tokyo-atlas-fare/artifacts/ux-v2-screenshots/02-street-level.png)：新宿街景近距高度（`ALT 29.6m`）、方向罗盘（`NE 25°`）、建筑防穿模与近景标签。
   - [03-underground-cutaway.png](file:///C:/Users/Morii/.gemini/antigravity/worktrees/SENKIRO/camera_experience_ux/labs/a-tokyo-atlas-fare/artifacts/ux-v2-screenshots/03-underground-cutaway.png)：涩谷径向剖切、写实混凝土隧道壳与单线高亮（副都心线）、清晰深度标签（`L-2`/`L-3`/`JY20`）。
   - [04-underground-explorer.png](file:///C:/Users/Morii/.gemini/antigravity/worktrees/SENKIRO/camera_experience_ux/labs/a-tokyo-atlas-fare/artifacts/ux-v2-screenshots/04-underground-explorer.png)：相机真实位于副都心线隧道内部（`y=-30`），预制混凝土管片环、钢轨与站台遮挡清晰，左下角提供明确位置与近接东横/田园都市线换乘按钮。
   - [05-train-follow.png](file:///C:/Users/Morii/.gemini/antigravity/worktrees/SENKIRO/camera_experience_ux/labs/a-tokyo-atlas-fare/artifacts/ux-v2-screenshots/05-train-follow.png)：虚拟列车侧面追随、左侧栏「模擬運行 · SYNTHETIC SIMULATION」列车详情卡与线路覆盖/来源。
   - [06-station-detail-atlas.png](file:///C:/Users/Morii/.gemini/antigravity/worktrees/SENKIRO/camera_experience_ux/labs/a-tokyo-atlas-fare/artifacts/ux-v2-screenshots/06-station-detail-atlas.png)：新宿车站详情、换乘信息、Provenance 与展开后的 Station Atlas 入口面板。

---

## 5. 与既有实现的变更及已知限制

1. **键位与模式切换规则调整（见 `DECISIONS.md` D-15）**：将 3D 鼠标键位由旧版「左拖旋转、中拖平移」改为与 2D MapLibre 一致的「左键点击选择、左拖平移、中/右拖旋转」，并在切换枢纽快捷按钮（如渋谷、新宿）时保持当前视角模式不强制跳入地下剖切，由顶部五态切换栏显式控制视角。
2. **Playwright 端口与默认行为**：`playwright.config.ts` 新增 `PW_PORT` 环境变量覆盖（默认仍为 `18473`），以便与并行工作树隔离运行端到端测试。
3. **待对接事项（与兄弟工作树联调）**：
   - `train_simulation_engine` / `japanese_rolling_stock_assets` 合入后，仅需实现 `src/three/uxContracts.ts` 中的 `TrainSimulationProvider` 并调用 `Metropolitan3DScene.setTrainSimulationProvider(...)` 即可替换 `SyntheticTrainSimulationProvider` 与轻量指示标，所有相机追随机位、模拟控制栏与虚拟列车详情卡无需重写。
   - `tokyo_environment_upgrade` / `underground_railway_geometry_system` 若扩展地形起伏（DEM）或隧道几何，可对接 `EnvironmentCollisionProvider` 与 `tunnelCorridors` 接口。
