# UX-V2-PLAN — SENKIRO Atlas v2: Camera Experience & Human-Centered UX

## 1. 目标与协作边界

本分支 (`camera_experience_ux`) 负责 **SENKIRO 3D Tokyo Atlas** 的统一摄像机状态机、人性化桌面端交互、分级空间标签系统、实体详情面板与虚拟列车模拟控制界面。

### 文件所有权与复用边界
- **不自行重建城市建筑、地形、隧道或高精度列车几何**：直接消费 `SolvedRailwayNetwork3D`、`CityChunkManager`、`CityTerrainLayer`、`TunnelAndStationLayer` 与 `RailTrackLayer`。
- **共享接口先导（`src/three/uxContracts.ts`）**：因 Session 0 共享接口文档尚未合入，本分支设计独立可插拔适配器接口（`TrainSimulationProvider`、`EnvironmentCollisionProvider`、`StationAtlasNavigator`、`CameraModeControllerAPI`），默认挂载轻量级 `SyntheticTrainSimulationProvider`（基于既有 3D 轨道样条的示意指示标，非重建列车模型），便于后续与 `train_simulation_engine`、`japanese_rolling_stock_assets`、`tokyo_environment_upgrade`、`underground_railway_geometry_system` 无缝对接。
- **地下视觉克制调整**：仅微调地下隧道/轨道的材质色相与自发光强度（默认写实混凝土与钢轨，线路色仅作细识别带与选中高亮）。

---

## 2. 架构设计（纵向切片）

1. **统一五态摄像机状态机（`src/domain/cameraModeStateMachine.ts`）**：
   - 五种核心视角：`city_overview`（三维都市鸟瞰）、`street_level`（近景城市观察）、`underground_cutaway`（地下结构分析）、`underground_explorer`（真正的地下漫游）、`train_follow`（虚拟列车跟随）。
   - 统一管理 `freeLookEnabled`（自由观察）、`followAngle`（`front` / `side` / `rear` / `cab`）、`lastSurfaceMode` 与安全退出/复位转换（`RETURN_TO_SURFACE`、`RESET_OVERVIEW`、`EXIT_TRAIN_FOLLOW`）。
2. **三维交互与防穿模控制器（`src/three/cameraController.ts` + `Metropolitan3DScene.ts`）**：
   - **桌面端一致键位**：左键点击选择实体、左键拖拽平移（地图常规操作，与 2D MapLibre 一致）；中键/右键拖拽旋转或自由观察；滚轮阻尼缩放（地下漫游时沿隧道推进）；双击射线聚焦；提供显式「自由观察」切换、`WASD/QE` 飞行、`R` 全览复位、`Esc` 退出/返回地表。
   - **防穿模与正确遮挡**：接入加载分块建筑/地标 AABB 碰撞推离；`street_level` 限制最小离地高度并附方位罗盘与最近地标提示；`underground_explorer` 将相机约束于真实隧道净空包络内、`near = 0.45m` 防近裁剪穿墙、隧道材质切为写深度实心衬砌并保持地上遮挡；`train_follow` 采用多点前瞻切线平滑弯道。
3. **分级屏幕空间标签系统（`src/domain/labelLayout.ts` + `src/ui/MapLabelsOverlay.tsx`）**：
   - 城市全览（城区与主要枢纽）→ 中距离（主要线路去重、关键站点、地标）→ 近距离（站台/层位、出入口、线路、列车）→ 地下（地下车站、隧道层位 `L-1..L-4`、交叉换乘井）。
   - 2D 屏幕包围盒优先级贪心避让 + 多偏移探测，杜绝同位置文字密集堆叠。
4. **详情面板与模拟控制栏（`DetailPanel.tsx`、`SimulationControlBar.tsx`、`CameraModeHud.tsx`）**：
   - 车站详情补齐 **Station Atlas 入口**（纵断层剖面与复杂换乘核查面板 + 外部 Station Atlas 模块对接点）；线路详情补齐 **数据覆盖与 SourceRecord 来源**；新增 **虚拟列车详情**（车型、线路、模拟方向、模拟状态、跟随按钮、醒目「模拟运行 · SYNTHETIC」标识）。
   - 底部紧凑**模拟控制栏**（播放/暂停、速度、可见数量、列车选择、显示/隐藏、重置/退出），不遮挡地图核心区。

---

## 3. 验证与交付

- **单元测试（Vitest）**：摄像机状态机转换、安全边界/退出/复位；标签分级过滤与零重叠布局算法；模拟适配器诚实性校验。
- **端到端交互测试（Playwright）**：五种视角切换、桌面端键位（左拖平移、中拖旋转、双击聚焦、自由观察）、地下漫游进入与一键返回地表、列车跟随固定机位切换、模拟控制栏操作、分级标签无重叠与实体详情（含 Station Atlas 入口与虚拟列车）。
- **真实截图与独立报告**：输出各视角真实 Chromium WebGL 截图与 `UX-V2-REPORT.md`。
