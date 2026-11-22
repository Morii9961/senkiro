# PHASE 2 REPORT — SENKIRO Tokyo 3D Urban Railway Atlas

本报告记录 **SENKIRO — Tokyo 3D Urban Railway Atlas 第二阶段全面优化（P0–P7）** 按 5 个阶段顺序推进的完整工程实现、实测前后性能对比、五大枢纽可视化审计、回归验证结果与未解决事项。

---

## 1. 分阶段执行与本地提交总览（分支 `lab/a-tokyo-atlas-fare`）

| 阶段 | 优先级 | 核心目标 | 本地 Commit | 关键修改 / 新增文件 |
| --- | --- | --- | --- | --- |
| **Stage 1** | **P0** | 根治地表/水域/公园/建筑闪烁与 LOD 跳变，搭建性能遥测与视觉评估管线 | `a0e62fc` | `cityTerrainGenerator.ts`, `buildingGenerator.ts`, `Metropolitan3DScene.ts`, `types.ts`, `Tokyo3DCanvas.tsx`, `index.html`, `scripts/eval-stage.mjs`, `PHASE2-PLAN.md` |
| **Stage 2** | **P1 + P2 + P3** | 完整城市地表与三级路网/广场/街区补全 + 6 类 PBR 程序化立面与独立平屋顶 + 13 座东京地标 + 天空球/PMREM/阴影/昼夜模式 | `955a259` | `scripts/fetch-urban-raw.mjs`, `scripts/build-urban-chunks.mjs`, `src/three/materials/facadeLibrary.ts`, `src/three/environment/skyEnvironment.ts`, `cityTerrainGenerator.ts`, `buildingGenerator.ts`, `Metropolitan3DScene.ts`, `Tokyo3DCanvas.tsx`, `public/data/urban-chunks/*` |
| **Stage 3** | **P4** | 工程化 3D 铁路结构（碎石道床、接触网门架、落地双柱门式桥墩、混凝土管片隧道）、克制线路识别色带、300+ 站台合批为 4 个 `InstancedMesh`、3 级距离 LOD 与地表隐式地下剔除 | `dd85a26` | `railTrackGenerator.ts`, `viaductGenerator.ts`, `tunnelGenerator.ts`, `Metropolitan3DScene.ts`, `types.ts`, `Tokyo3DCanvas.tsx` |
| **Stage 4** | **P5** | 真 3D GPU 世界空间径向开削地下探索系统（告别全城半透明灰楼糊墙）、地质剖面井壁与深度标尺、13 座地标空间定位锚点、竖向夸张 (`1.0×–2.5×`)、一键返回地面视图 | `9dd1c53` | `src/three/materials/cutawayShader.ts`, `src/three/environment/cutawayVisuals.ts`, `cityTerrainGenerator.ts`, `buildingGenerator.ts`, `Metropolitan3DScene.ts`, `Tokyo3DCanvas.tsx`, `types.ts`, `scripts/eval-stage.mjs` |
| **Stage 5** | **P6 + P7** | 双模式空间相机控制器（地图浏览中键连续地面自由平移 + 双击射线焦点 + 自由探索 WASD/视角/QE 飞行与零跳变状态同步）+ 建筑懒加载 LOD0 + 5.8km 显存回收 + 远郊细钢轨裁剪 + 12 条 E2E 回归与报告 | 本次提交 | `src/three/cameraController.ts`, `buildingGenerator.ts`, `railTrackGenerator.ts`, `Metropolitan3DScene.ts`, `Tokyo3DCanvas.tsx`, `tests/e2e/atlas-fare.spec.ts`, `ARCHITECTURE-3D.md`, `SOURCES.md`, `DECISIONS.md`, `REPORT.md`, `PHASE2-REPORT.md` |

---

## 2. 实测性能前后对比（Before vs After · P7）

测试环境：Playwright Headless Chrome (`1440×900`, `--use-gl=angle --use-angle=swiftshader` 纯 CPU 软件 WebGL 渲染，确保绝对可复现的相对倍率对比；在硬件 GPU 浏览器下帧率通常为 30–60 FPS）。全部数据均由 `scripts/eval-stage.mjs` 实时读取 `renderer.info.render` 与帧耗时得出：

### 2.1 加载与总体指标
| 指标 | Baseline (Phase 1.5) | Stage 1 (P0) | Stage 2 (P1–P3 高密建筑) | Stage 5 (P0–P7 最终版) | 对比变化 |
| --- | --- | --- | --- | --- | --- |
| 都市建筑总数 (145 分块) | 24,216 (全部 OSM) | 24,216 | 48,696 (38,050 OSM + 10,646 示意补全) | **48,696** (6.91 MB) | **+101%** 城市覆盖密度 |
| 道路 / 公园 / 土地利用 / 广场 | 5,574 / 151 / 0 / 0 | 5,574 / 151 / 0 / 0 | 10,741 / 398 / 430 / 465 | **10,741 / 398 / 430 / 465** | 完整城市街区与三级路网 |
| 都市资产首载耗时 (`loadTimeMs`) | 未埋点 | `3,426 ms` | `4,330 ms` | **`1,496 ms`** | **-65.5%** (懒加载 LOD0 提速 2.9×) |
| 3D 视图初始就绪 (`initialLoadMs`) | `8,659 ms` | `9,900 ms` | `9,281 ms` | **`6,197 ms`** | **-37.4%** |
| 控制台 / 页面报错数 | 1 (404 favicon) / 0 | 0 / 0 | 0 / 0 | **0 / 0** | 零报错 |

### 2.2 各视图实测 FPS / Draw Calls / Triangles 对比
| 视角 | 指标 | Stage 1 (优化前基线*) | Stage 2 (高密都市化后) | Stage 5 (最终版) | 优化幅度 (vs Stage 2) |
| --- | --- | --- | --- | --- | --- |
| **都心 23 区全景 (`overview`)** | FPS (SwiftShader) | 0.9 | 0.8 | **2.7** | **+237% (3.4×)** |
| | Draw Calls | 629 | 644 | **131** | **-79.7%** |
| | Triangles | 3,349k | 3,485k | **409k** (`Rail:far`) | **-88.3% (8.5× 削减)** |
| | 渲染建筑数 | 11,813 | 21,280 | **22,850** | +93% vs 基线 |
| **涩谷地表 (`shibuya-surface`)** | FPS / DC / Tris | 1.0 / 330 / 3,251k | 0.8 / 346 / 3,324k | **1.5 / 203 / 1,615k** | **DC -41% · Tris -51.4%** |
| **新宿地表 (`shinjuku-surface`)** | FPS / DC / Tris | 1.2 / 266 / 3,196k | 1.0 / 283 / 3,190k | **1.5 / 172 / 1,512k** | **DC -39% · Tris -52.6%** |
| **东京・大手町 (`tokyo-surface`)** | FPS / DC / Tris | 1.3 / 265 / 2,581k | 1.1 / 288 / 2,593k | **1.8 / 165 / 1,245k** | **DC -43% · Tris -52.0%** |
| **品川地表 (`shinagawa-surface`)** | FPS / DC / Tris | 1.4 / 227 / 3,102k | 1.1 / 254 / 3,168k | **1.6 / 167 / 1,534k** | **DC -34% · Tris -51.6%** |
| **池袋地表 (`ikebukuro-surface`)** | FPS / DC / Tris | 1.4 / 191 / 2,580k | 1.1 / 205 / 2,608k | **1.8 / 114 / 1,215k** | **DC -44% · Tris -53.4%** |
| **涩谷地下开削 (`shibuya-ug`)** | FPS / DC / Tris | 1.1 / 336 / 3,268k | 0.9 / 352 / 3,342k | **1.3 / 392 / 2,474k** | **Tris -26.0% + 真 3D 开削井** |
| **新宿地下开削 (`shinjuku-ug`)** | FPS / DC / Tris | — | — | **1.4 / 305 / 2,383k** | 完整大江户/丸之内/都营新宿立体交叉 |
| **东京・大手町地下 (`tokyo-ug`)** | FPS / DC / Tris | — | — | **1.6 / 321 / 2,327k** | 五线地铁交叉 + 红砖站舍透明锚点 |
| **新宿夜景 (`shinjuku-night`)** | FPS / DC / Tris | — | — | **1.7 / 172 / 1,512k** | 程序化自发光窗格与夜空 PMREM |

> \*注：Baseline 阶段未暴露 `renderer.info` Draw Calls/Triangles，Stage 1 在未改动任何几何数量的前提下仅修复 P0 闪烁并接入遥测，作为准确的优化前 GPU 负载基线。

---

## 3. 五大重点枢纽实测视觉审计结果

在 Stage 1–5 每阶段均通过真实浏览器截图人工逐帧审查以下区域：
1. **涩谷（Shibuya）**：
   - 地表：Shibuya Scramble Square、Shibuya Hikarie、Shibuya Stream 玻璃幕墙与周围真实 OSM 建筑严格对齐，平屋顶防水纹理与机房层次清晰，宫下公园林荫清晰，道路与人行道自然衔接。
   - 地下开削：圆形开削井彻底消除透明建筑重影；3 座地标保持清晰半透明空间定位锚点；银座线 3F 高架、JR 山手线地面、京王井之头、半藏门/田园都市线与深层副都心/东横线 5 层立体结构一目了然。
2. **新宿（Shinjuku）**：
   - 地表：东京都厅双塔、新宿公园塔三阶尖顶与茧塔轮廓鲜明；JR 大走廊碎石道床、金属钢轨与镀锌接触网门架清晰延伸；原霓虹色块站台全面收敛为深灰雨棚加细识别色带。
   - 地下开削与夜景：深层都营大江户线洋红盾构环线、丸之内线与都营新宿线空间纵断一目了然；夜间模式下西新宿高层呈现自然错落的暖白办公楼层灯光。
3. **东京・大手町（Tokyo / Otemachi）**：
   - 地表：东京站丸之内红砖站舍（拱窗与双八角穹顶）与丸之内大厦隔站前广场对望，皇居东御苑绿地严格受保护无示意补全侵入。
   - 地下开削：丸之内、东西、千代田、半藏门、都营三田五线地下枢纽与地面/高架 JR・新干线纵横交错极其清晰。
4. **品川（Shinagawa）**：
   - 扩充 9,824 条品川/池袋真实 OSM 建筑并增建品川 Intercity A/B/C 三塔地标（视野建筑数从 1,056 升至 3,438）；东海道新干线与在来线高架桥墩全部落地至基底无悬空，京急/JR 多轨清晰可辨。
5. **池袋（Ikebukuro）**：
   - 阳光 60 地标、池袋站百叶公建体块与周边高密日式阳台公寓街区自然融合，高架桥面与接触网清晰连贯，Draw Call 低至 `114`。

---

## 4. 全量自动化测试与回归结果

1. **TypeScript 静态检查 + 生产构建** (`npm run build`)：`0 errors`，生成 `dist/`（含独立拆包的 `osm-vertical` 与 145 个 ODbL 都市分块）。
2. **Vitest 单元测试** (`npm test`)：**3 files, 42/42 PASS**（`fareEngine.test.ts` 26/26，`alignmentAndData.test.ts` 9/9，`elevationSolver.test.ts` 7/7）。
3. **Playwright 端到端交互测试** (`npm run test:e2e`)：**12/12 PASS (1.1m)**：
   - 完整回归 2D MapLibre 渲染、日/英/假名搜索、运营商/切片筛选、覆盖面板与 ODbL 隔离、JR 运价计算/解释树/双路径高亮/2026-03-14 改定/地方交通线与非 JR 拒算、Strip Map、深浅色与双语切换、沿线追踪、2D↔3D 状态同步。
   - 新增 **Test 11**（GPU 径向开削半径、竖向夸张、固定开削位置、一键返回地面视图、昼夜切换，0 报错）与 **Test 12**（中键按住拖动连续地面平移实测目标位移动 `> 20m`、无缝切换自由探索模式并验证 `WASD + E` 空间飞行位移 `> 30m`、无报错切回地图浏览）。

---

## 5. 遗留事项与诚实说明

1. **真实地形高程（DEM）暂未接入**：当前采用统一平面基准 `y = 0` 与分层高程策略，尚未叠加涩谷谷地、山手台地等真实地表起伏（需在未来结合国土地理院 DEM 瓦片并联动道路/建筑贴地求解）。
2. **近景 `Rail:near` 三角形仍有进一步细分空间**：全景已从 `3.49M` 降至 `409k`（`-88.3%`），近景枢纽已从 `3.32M` 降至 `1.21M–1.61M`（`-52%`）；若未来按 `2km×2km` 空间网格对铁路道床/钢轨也做分块视锥剔除（当前按整条线路+层级合批），近景三角形可进一步压低至 `< 500k`。
3. **示意街区补全 (`hb="p"`) 与示意垂向层级 (`L+2..L-4`) 边界**：10,646 栋示意街区补全严格沿真实 OSM 道路/地块生成并避让基础设施，但属于示意体块而非真实测绘建筑；3D 轨道深度为相对示意层而非官方实测米数，界面持续通过顶部横幅与遥测如实标明。
4. **单站精细室内架构**：闸机、扶梯、站内商业通道等细部不在本都市总览图谱范围内，按项目定位留待独立的 `SENKIRO Station Atlas`。
