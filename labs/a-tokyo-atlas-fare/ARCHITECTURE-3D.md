# ARCHITECTURE-3D — Tokyo Metropolitan 3D Railway Atlas (Phase 2)

本文档说明 `labs/a-tokyo-atlas-fare/` 经过第二阶段（P0–P7）全面优化后的三维都市与铁路网络程序化架构，视觉定位为 **Semi-Realistic Architectural Visualization（半写实建筑可视化）**，面向未来迁移至大阪、名古屋等其他日本都市圈的可扩展复用设计。

## 1. 总体模块分层

```text
data/processed/atlas.json         (CC BY / Public Data License · 唯一铁路主实体)
data/processed/osm-vertical.json  (ODbL 1.0 独立纵断层 · 动态拆包)
public/data/urban-chunks/         (ODbL 1.0 独立都市 GIS 145 块 2km×2km 空间分块 · 6.91 MB)
        │
        ▼
src/three/geoProjection.ts        ← 统一局部米制平面投影 (1 unit = 1m, 可参数化 Origin)
src/domain/elevationSolver.ts     ← 纯 TS 3D 垂向求解器 (高度层 + C0 连续插值 + 交叉避碰 + 洞口)
        │
        ▼
src/three/materials/
  ├─ facadeLibrary.ts             ← 6 类 PBR 程序化建筑立面/屋顶纹理库 (Albedo + Roughness + Bump + Night Emissive)
  └─ cutawayShader.ts             ← GPU 世界空间径向开削 Shader 注入 (支持 Mesh 与 InstancedMesh)
src/three/environment/
  ├─ skyEnvironment.ts            ← 程序化大气天空球 Shader + PMREM 环境反射贴图 + 线性大气雾 (昼/夜切换)
  └─ cutawayVisuals.ts            ← 地下开削地质剖面井壁 (L-1..L-4 深度标尺) + 井口压顶环 + 井底罗盘基准盘
src/three/generators/
  ├─ cityTerrainGenerator.ts      ← 严格不透明分层地表 (地块基底/东京湾/土地利用/河道护岸/林荫公园/铁路碎石走廊/人行道广场/三级路网)
  ├─ buildingGenerator.ts         ← 懒加载 LOD0 + 5.8km 显存回收 + 独立屋顶层 + 接地 AO + 13 座程序化东京地标
  ├─ railTrackGenerator.ts        ← 碎石道床/混凝土板 + 金属钢轨 + 枕木 + 接触网门架 + 3 级距离 LOD (含远景轻量骨架) + 运价双光带
  ├─ viaductGenerator.ts          ← 混凝土箱梁桥面 + 落地双柱门式桥墩 (延伸至 y=-1.25) + 高架站台雨棚
  └─ tunnelGenerator.ts           ← 预制混凝土管片纹理盾构/明挖隧道 + 4 层 InstancedMesh 批处理站台 (300+ DC → 4 DC) + 地铁出入口亭
        │
        ▼
src/three/cameraController.ts     ← 双模式空间相机 (地图浏览左旋/中右自由平移/双击焦点 + 自由探索 WASD/视角/上下飞行)
src/three/Metropolitan3DScene.ts  ← Three.js 场景总控、LogarithmicDepthBuffer、自适应近远裁剪、3 级铁路 LOD、性能遥测
src/ui/Tokyo3DCanvas.tsx          ← 5 大枢纽快跳、昼夜切换、地下开削 HUD (半径/竖向夸张/固定/一键回地面)、相机模式切换与实时遥测
```

## 2. 渲染稳定性与 P0 防闪烁机制
- **Logarithmic Depth Buffer**：在 `WebGLRenderer` 启用 `logarithmicDepthBuffer: true`，配合每帧动态自适应 `camera.near`（`4..75m`）与 `camera.far`（`28..150km`），彻底消除大尺度城市地表、海湾与远景多边形的深度精度冲突。
- **严格不透明地表通道 + 高程与 `polygonOffset` 双重分层**：
  - 正常地表模式下，全部地表、水域、公园、土地利用、人行道、道路与建筑均为 `transparent: false, depthWrite: true, FrontSide`，杜绝透明队列排序导致的楼体透穿与海面闪烁。
  - 垂直层级严格错开（基面 `-1.25` → 东京湾 `-0.95` → 土地利用 `-0.83..-0.76` → 护岸 `-0.65` → 内河水域 `-0.58..-0.49` → 公园 `-0.34..-0.22` → 铁路碎石走廊 `-0.14` → 人行道与站前广场 `-0.06` → 干线/次干道/支路 `+0.03..+0.16` → 高架路 `+7.4`），辅以递进 `polygonOffsetFactor`。
- **LOD 切换滞回带（Hysteresis）**：LOD0 进入阈值 `2050m`、退出阈值 `2600m`，视锥包围盒扩展 `0.65×`，避免分块边界闪进闪出。

## 3. 城市地表、建筑 PBR 材质与光影环境（P1–P3）
- **完整城市地表与街区覆盖**：新增 OSM 次干道/支路、土地利用街区（商业/居住/工业/铁路用地）、邻里公园与站前广场（共 **10,741 条道路、398 处公园、430 个土地利用地块、465 处广场、231 条铁路碎石带、1,008 处水体/河道**）。
- **诚实区分真实建筑与示意街区补全**：145 个分块共含 **48,696 栋建筑**，其中 **38,050 栋为真实 OSM 建筑**（`height=28,424`, `levels=5,263`, `inferred=4,363`），**10,646 栋为沿真实道路与土地利用地块方向生成的示意街区补全**（标记为 `hb="p"`，经 16m 空间排他网格严格避开全部道路、水体、东京湾、皇居外苑/公园、铁路走廊与已有建筑，且在遥测与清单中如实标示）。
- **6 类程序化 PBR 立面与独立屋顶**：幕墙玻璃办公、石材商业、日式阳台公寓、车站公建百叶、丸之内红砖、平屋顶防水层，每套均含 `map` + `roughnessMap` + `bumpMap` + 夜间 `emissiveMap`；LOD0 分离墙面与屋顶网格（消除屋顶贴图拉伸），并烘焙建筑底部接地环境光遮蔽（AO）与低饱和日式建材色差。
- **13 座程序化地标**：全面覆盖五大枢纽与核心天际线（东京塔、晴空塔、东京都厅双塔、新宿公园塔、茧塔、涩谷 Scramble Square、涩谷 Hikarie、涩谷 Stream、东京站丸之内红砖站舍、丸之内大厦、品川 Intercity A/B/C、六本木森大厦、阳光 60），全部应用真实米制 UV。
- **天光与反射**：程序化天空球 Shader + 实时生成的 `PMREMGenerator` 天空反射环境贴图 + `1536×1536` 软阴影（`normalBias = 1.6`）+ 线性远景大气雾 + 一键昼/夜照明切换。

## 4. 工程化 3D 铁路与 3 级距离 LOD（P4 + P7）
- **克制配色与工程细部**：地面线路铺设梯形碎石道床与接触网门架（`InstancedMesh`）；高架桥为混凝土箱梁加声屏障与落地双柱门式混凝土桥墩（锚定至 `y = -1.25` 杜绝悬空）；地下盾构与明挖隧道贴合预制混凝土管片接缝纹理；线路颜色收敛为道床/站台边缘的细识别色带，选中或地下模式时才增强高亮。
- **站台实例化批处理**：将原 300+ 独立站台 Mesh/Material 合并为 **4 个 `InstancedMesh`**（混凝土站台板 + 深灰雨棚 + 细识别色带 + 地面地铁出入口亭）并保留 `hit.instanceId` 精确点击拾取，立减 200–300+ Draw Call。
- **3 级铁路距离 LOD + 地表隐式遮挡剔除**：
  - `Near (< 1850m)`：完整钢轨（23 区内）、混凝土枕木、接触网门架、道床、高架桥墩。
  - `Mid (1850m–4800m)`：道床、识别色带、桥面与站台（剔除细钢轨、枕木、接触网与远桥墩）。
  - `Far (≥ 4800m)`：切换为轻量级全东京铁路骨架带（总三角形锐减 **88%**）。
  - 非地下模式下自动剔除不可见的地下隧道/地下轨道几何，开启地下开削后瞬时显现。
- **建筑懒加载 LOD0 + 5.8km 显存回收**：分块拉取后仅先构建轻量 `InstancedMesh`（LOD1），进入近景时按帧限速懒构建 LOD0，移出 `5.8km` 后自动 `dispose()` LOD0 GPU 几何缓冲区。

## 5. 真 3D 径向开削地下探索与双模式空间相机（P5 + P6）
- **GPU 径向开削（告别半透明建筑糊墙）**：开启地下探索后，通过 `onBeforeCompile` 在地表、水域、公园、道路与普通建筑上精确挖出可调半径（`350m–2400m`）的圆形开削井，井外都市建筑保持 100% 实心清晰，井内保留 13 座地标作半透明空间定位锚点，配地质剖面井壁（含 `L-1..L-4` 标尺）、竖向夸张（`1.0×–2.5×`，纯视觉绝不影响法定营业公里）与「一键返回地面视图」。
- **双模式相机控制器（`cameraController.ts`）**：
  - **地图浏览模式（默认）**：左键旋转、**中键按住拖动沿地面自由连续平移**（自动屏蔽浏览器中键自动滚屏并按高度自适应平移速度）、右键平移、滚轮阻尼缩放、**双击 3D 物体/地面平滑飞抵焦点**、一键重置。
  - **自由探索模式（可选切换）**：`WASD`/方向键水平飞行、鼠标拖拽调整 `yaw/pitch`（俯仰安全限幅 `±82°`）、`E/Space` 上升、`Q/Shift` 下降、三档速度（低/标/高）、防穿地边界保护，与地图浏览模式及 2D 地图零跳变无缝同步。

## 6. 运价引擎保护
- JR 运价计算严格继续调用 `src/domain/fareEngine.ts` 与法定 `operatingKm`，竖向夸张或 3D 几何长度绝不参与运价运算；3D 视图中以橙/青双色悬浮光带回绘实乘路径与法定计费路径。
