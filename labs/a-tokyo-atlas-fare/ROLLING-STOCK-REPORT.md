# ROLLING-STOCK-REPORT — SENKIRO Atlas v2 High-Fidelity Japanese Rolling Stock

## 1. 一句话结果
在独立 Git Worktree (`japanese_rolling_stock_assets`) 中完成了 **JR 东日本 E235 系 0 番台（山手线）**、**东京 Metro 1000 系（银座线）** 与 **东京 Metro 17000 系（有乐町线・副都心线）** 三款高辨识度日本铁路车型的三维程序化建模、PBR 材质贴图、Khronos glTF 2.0 (`.glb`) 二进制资产生成、三档 LOD 切换、车门/车灯/方向/弯道双转向架弦线动画接口与独立 3D 检视工作台；全量单元测试（**4 files, 47/47 PASS**）、TypeScript 严格静态检查与生产构建（**`npm run build` 0 errors**）以及端到端 WebGL 渲染与 8 张真实运行截图验证全部通过，且对全局渲染器 (`Metropolitan3DScene.ts`) 和既有业务代码保持 **零侵入、零冲突**。

---

## 2. 运行环境
- **操作系统**：Windows 11 (64-bit)
- **Git Worktree / 分支**：`C:/Users/Morii/.gemini/antigravity/worktrees/SENKIRO/japanese_rolling_stock_assets` (`japanese_rolling_stock_assets` 分支，基于 `6001e82`)
- **技术栈**：TypeScript 5.8 (`strict: true`) · Three.js `0.187.0` · React `19.1.0` · Vite `6.4.6` · Vitest `3.2.7` · Playwright (`channel: 'chrome'`, WebGL ANGLE/SwiftShader)
- **新增外部 npm 依赖**：**0 个**（完全复用仓库既有依赖）

---

## 3. 核心要求与验收完成情况

| 验收项 / 核心要求 | 状态 | 实现与验证说明 |
| --- | --- | --- |
| **禁止使用通用方盒改色冒充不同列车** | **完成** | 三款车型各自拥有独立的横断面几何 (`wide_body_barrel` 2.95m 宽体鼓形断面 vs `compact_subway_flat` 2.55m 垂直断面+棕红拱顶 vs `atrain_tapered` 2.80m A-train 斜收断面)、独立车长 (20.0m vs 16.0m)、独立轨距 (1,067mm vs 1,435mm)、独立车门数 (单侧 4 门 vs 3 门)、独立集电设备 (PS33H/PT71 单臂受电弓 vs 第三轨集电靴+无受电弓车顶) 及专属 3D 车头几何。 |
| **1. JR 东日本 E235 系 0 番台（山手线）** | **完成** | 还原 Ken Okuyama「数码画框 / スマホ顔」平头大黑玻前脸 + 四角圆弧莺绿 (`#80C241`) 外框 + 前窗上角矩形 LED 前照灯 + 顶部全彩点阵行先屏 + 银白防撞排障器；Sustina 无筋不锈钢拉丝车体 + **纵向车门莺绿渐变点阵色带**（无横向腰带）+ 幕板细绿带；DT80/TR264 转向架、AU737 双空调、PS33H 单臂受电弓；支持 11 车官方满编组 (`6M5T`) 及可变编组。 |
| **2. 东京 Metro 1000 系（银座线）** | **完成** | 还原 16.0m × 2.55m 紧凑标准轨 (`1,435mm`) 车体、单侧 **3 门**布局、致敬 1927 年初代 1000 形的**全车柠檬黄 (`#F5B100`) 涂装 + 复古棕红 (`#683024`) 车顶与前帽檐** + 银座橙/白/深棕腰带、中央外摆贯通门与竖向装饰立柱、下部左右纵向双联圆灯；**车顶无受电弓**，SC101 转向架侧面装备黄色**第三轨集电靴**；支持 6 车官方满编组 (`6M`)。 |
| **3. 东京 Metro 17000 系（有乐町・副都心线）** | **完成** | 还原 20.0m × 2.80m 日立 A-train 铝合金断面、**大后掠角流线型 3D 曲面黑玻车头**、助士席侧偏置贯通门（带圆形舷窗）、传承 7000/10000 系的**左右双圆形环状 LED 前照灯 (`丸目`)**、香槟金/深棕雕塑前裙板、**有乐町金 (`#C8A96E`) + 副都心棕 (`#8F5126`) 双色贯穿水平腰带与幕板带**、车端圆形舷窗；支持 10 车 (`4M6T`) 与 8 车 (`4M4T`) 官方满编组。 |
| **三种车型远距离也能明显区分** | **完成** | 经 `03-three-series-far-distance.png` (150m+ 远景) 与 `LOD2` 实测验证：远景下 E235 呈现「不锈钢宽体 + 4 条纵向绿门带 + 绿框平头」，1000 系呈现「全柠檬黄短车体 + 棕红车顶 + 16m 紧凑比例」，17000 系呈现「大倾角黑玻流线头 + 双金棕水平贯穿腰带」。 |
| **模型尺寸与统一空间尺度兼容** | **完成** | 严格对齐 `src/three/geoProjection.ts` 的 `1 unit = 1.0 meter` 米制世界坐标（轨面顶 `y = 0`），同时在 `TrainConsistInstance.setWorldScale(scale)` 提供无损比例缩放接口。 |
| **模块化与多节列车编组** | **完成** | 统一封装头车 (`lead_front`)、带弓动力中间车 (`intermediate_m`)、无弓拖车 (`intermediate_t`) 与旋转 180° 的尾车 (`lead_rear`)，自动装配车间风挡连接幌 (`Gangway_Rear`) 与柴田式密接车钩。 |
| **车门与车灯/方向动画接口** | **完成** | 支持左门 (`'left'`)、右门 (`'right'`)、双侧 (`'both'`) 独立平滑对开滑动（1.4s 三次缓动曲线，尾车自动映射左右侧保证全列同侧开门）；支持前照灯（白）、尾灯（红）、行先屏、夜间客室透光开关；切换 `setTravelDirection('forward' \| 'reverse')` 自动互换首尾头车的白亮前照灯与红亮尾灯；车轮随行驶距离自动滚动。 |
| **弯道运行与独立定位控制** | **完成** | `src/domain/rollingStock/articulation.ts` 提供纯 TS 3D 样条曲线双转向架支点弦线求解器：自动计算每节车厢在 3D 曲线/坡道上的前后转向架中心坐标、车体弦线偏航角 (`yawRad`)、纵坡俯仰角 (`pitchRad`)、超高横滚角 (`rollRad`)、前后转向架相对车体的局部转角 (`frontBogieLocalYawRad` / `rearBogieLocalYawRad`) 与车间连接幌折角。 |
| **三档 LOD 切换、材质复用与 GLB 压缩** | **完成** | 单例 `RollingStockMaterialRegistry` 跨编组复用 PBR 材质与 `DataTexture`；支持 `high` (`LOD0`, `< 260m`)、`medium` (`LOD1`, `260m–950m`)、`low` (`LOD2`, `≥ 950m`) 及 `auto` 相机距离自动切换（`LOD0 → LOD2` 三角形锐减 **85%–94%**）；预生成 9 个标准 Khronos glTF 2.0 (`.glb`) 二进制文件（单车 `116–153 KB`）。 |

---

## 4. 真实运行记录与测试摘要

1. **GLB 资产构建与 `GLTFLoader` 解析校验**：
   - 命令：`node scripts/build-rolling-stock-glb.mjs`
   - 结果：**9/9 `.glb` 二进制文件生成并通过 Three.js 官方 `GLTFLoader` 逆向解析校验**，输出 `data/rolling-stock-catalog.json` 与 `public/assets/rolling-stock/manifest.json`。
2. **TypeScript 严格类型检查与生产构建**：
   - 命令：`npm run build` (`tsc --noEmit && vite build`)
   - 结果：**0 errors**，成功构建 `dist/index.html` 与独立预览入口 `dist/rolling-stock-preview.html` (`155.84 kB`, gzip `47.23 kB`)。
3. **Vitest 单元测试**：
   - 命令：`npm test` (`vitest run`)
   - 结果：**4 test files, 47/47 PASS**
     - `tests/unit/rollingStock.test.ts` (**5/5 PASS**)：核验三车型官方尺寸与非方盒差异化特征、来源溯源、多节编组与三档 LOD 面数预算、左右车门平滑动画与方向切换头尾灯联动、3D S 型弯道双转向架弦线偏角与纵坡俯仰角求解、Khronos glTF 2.0 (`.glb`) 序列化与 `GLTFLoader` 解析。
     - 既有回归：`fareEngine.test.ts` (26/26 PASS)、`alignmentAndData.test.ts` (9/9 PASS)、`elevationSolver.test.ts` (7/7 PASS)。
4. **Playwright WebGL 端到端渲染与真实截图采集**：
   - 命令：`node scripts/verify-and-screenshot-rolling-stock.mjs`
   - 结果：**PASS (0 console errors, 0 page errors)**，实测生成 8 张 `1440×900` 真实 WebGL 运行截图于 `public/assets/rolling-stock/screenshots/`：
     1. `01-three-series-front-lineup.png`：三款车型车头并列对比（17000 系流线斜黑玻+圆眼头灯 vs 1000 系复古柠檬黄中央贯通门+棕红车顶 vs E235 系莺绿外框平面黑玻+上角矩形灯）。
     2. `02-three-series-side-proportions.png`：三款车型侧面比例、门数（4 门 vs 3 门）、车长（20m vs 16m）与涂装色带（纵向绿门带 vs 全黄+橙白腰带 vs 双色金棕水平带）对比。
     3. `03-three-series-far-distance.png`：150m+ 远距离视认性对比，验证三款车型在远景依然一目了然。
     4. `04-e235-yamanote-closeup-doors-open.png`：JR 东日本 E235 系 0 番台（山手线）近景与双侧车门 100% 开启状态。
     5. `05-metro1000-ginza-closeup-third-rail.png`：东京 Metro 1000 系（银座线）6 编组近景、第三轨集电靴与无受电弓棕红车顶。
     6. `06-metro17000-yurakucho-fukutoshin-curve.png`：东京 Metro 17000 系（有乐町・副都心线）6 编组在 3D S 型弯道上的车头特写与转向架追随。
     7. `07-night-mode-direction-reversed-lights.png`：夜间照明模式 + 行进方向反转 (`Dir:reverse`) 下尾车点亮白色圆眼头灯、全列开启暖色室内窗光。
     8. `08-multi-car-curve-consist-overview.png`：6 节多车编组 (`120m`) S 型曲线全景及 glTF 2.0 (`.glb`) 资产二进制校验面板。
