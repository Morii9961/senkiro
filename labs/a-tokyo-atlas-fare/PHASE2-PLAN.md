# PHASE2-PLAN — Tokyo 3D Urban Railway Atlas 第二阶段全面优化计划

## 0. 现有实现技术审计与根因定位

对 `labs/a-tokyo-atlas-fare/src/three/`、`src/domain/elevationSolver.ts`、`scripts/build-urban-chunks.mjs` 与 `src/ui/Tokyo3DCanvas.tsx` 逐行审计后，定位各问题确切根因如下：

1. **P0（地表与水域闪烁）**：
   - `cityTerrainGenerator.ts` 将 `groundMaterial`、`waterMaterial`、`parkMaterial`、`roadMaterial`、`elevatedRoadMaterial` 在正常日间地表模式下也全部设为 `transparent: true`（`opacity: 0.95–1.0`），导致它们全部进入 Three.js 透明队列并按网格包围球中心 `(0,0,0)` 排序，旋转/平移时绘制顺序翻转闪烁。
   - `Metropolitan3DScene.ts` 相机 `near=4, far=90000`（未开启 `logarithmicDepthBuffer`），在 6 km 视距下单比特深度精度仅约 `0.54 m`，远大于当前层间高差（`bay=-0.22`, `water=-0.14`, `river=-0.12`, `park=-0.06`, `road=0.08`, `intersection=0.11`），必然产生严重 Z-fighting；且同一合并网格内存在共面重叠的 OSM 公园/道路/水体。
   - `buildingGenerator.ts` 所有建筑材质默认 `transparent: true, opacity: 0.94`，且 LOD0/LOD1 在 `2400 m` 处无滞回（hysteresis）硬切换，缩放边界处易闪现。
2. **P1（大面积空白灰地）**：
   - `build-urban-chunks.mjs` 仅保留外围 210 栋/块且仅抓取了 `levels >= 8` 的建筑，缺少二级街路、街区用地地块（`landuse`）、站前广场、铁路站场路基与道旁人行道结构。
3. **P2（建筑灰白单调）**：
   - 仅有 4 张低对比平铺纹理，缺少 roughness/bump PBR 差异、低饱和日系建筑色彩变化、屋顶构造与五大枢纽（新宿/涩谷/东京/品川/池袋）精细地标/站房。
4. **P3（光照雾化发灰）**：
   - 纯色背景 + 过重指数雾 `FogExp2(0.000042)` 冲淡建筑立体感，缺少天空渐变穹顶、`PMREMGenerator` 环境反射、阴影 `normalBias` 与建筑底缘接触 AO。
5. **P4（铁路浮空彩带感）**：
   - 轨道两侧 0.8 m 宽发光路线色条与高亮纯色车站方盒喧宾夺主，缺乏远/中/近三级铁路细节 LOD（远景骨架 → 中景桥轨站 → 近景钢轨/枕木/架空接触网门架）与真实混凝土隧道/道床质感。
6. **P5（地下透视全体半透明杂乱）**：
   - 开启地下模式时所有 4,000+ 建筑统一变为 `opacity: 0.32`，形成重叠轮廓糊片。需要真正的 **3D 区域剖切（GPU 径向剖切窗口 + 剖切边界环 + 剖切区内淡出无关建筑仅留地标锚点 + 垂直比例夸张 + 一键返回地表）**。
7. **P6（相机受限）**：
   - `OrbitControls` 默认未绑定中键连续平移，无双击对象飞跃聚焦，无自由探索模式（WASD + 鼠标视角 + 升降 + 速度调节 + 边界防穿地）及统一相机状态同步。
8. **P7（性能度量缺失）**：
   - 缺少实时 `FPS`、`Draw Calls`、`Triangles`、加载耗时度量与远块 LOD0 内存回收。

---

## 1. 五阶段文件级实施计划

- **阶段一（P0 渲染稳定性）**：`src/three/generators/cityTerrainGenerator.ts`、`src/three/Metropolitan3DScene.ts`、`src/three/generators/buildingGenerator.ts`
- **阶段二（P1+P2+P3 城市地表、街区、PBR 建筑立面与光照环境）**：`scripts/fetch-urban-raw.mjs`、`scripts/build-urban-chunks.mjs`、`src/three/materials/facadeLibrary.ts`（新增）、`src/three/generators/cityTerrainGenerator.ts`、`src/three/generators/buildingGenerator.ts`、`src/three/Metropolitan3DScene.ts`、`src/three/types.ts`、`src/ui/Tokyo3DCanvas.tsx`
- **阶段三（P4 实体铁路工程结构与三级距离 LOD）**：`src/three/generators/railTrackGenerator.ts`、`src/three/generators/viaductGenerator.ts`、`src/three/generators/tunnelGenerator.ts`、`src/three/Metropolitan3DScene.ts`
- **阶段四（P5 3D 地下剖切浏览模式重设计）**：`src/three/generators/cityTerrainGenerator.ts`、`src/three/generators/buildingGenerator.ts`、`src/three/generators/tunnelGenerator.ts`、`src/three/Metropolitan3DScene.ts`、`src/ui/Tokyo3DCanvas.tsx`、`src/ui/styles.css`
- **阶段五（P6+P7 相机导航重设计、性能调优与最终回归）**：`src/three/cameraController.ts`（新增）、`src/three/Metropolitan3DScene.ts`、`src/ui/Tokyo3DCanvas.tsx`、`tests/e2e/atlas-fare.spec.ts`、`REPORT.md`、`ARCHITECTURE-3D.md`
