# ROLLING-STOCK-PLAN — SENKIRO Atlas v2 High-Fidelity Japanese Rolling Stock

## 1. 目标与边界
在独立 Git Worktree (`japanese_rolling_stock_assets`) 中构建 SENKIRO Atlas v2 的真实日本铁路车型三维资产系统。严格遵守协作边界：**不修改全局渲染器 (`Metropolitan3DScene.ts`)、主应用 (`App.tsx`) 或模拟引擎，不引入额外 npm 依赖**，确保与 Session 0 及其他并行 Worktree 零冲突合并。

## 2. 首批三款车型与核心视觉特征（严禁方盒改色）
| 车型 ID | 名称与适用线路 | 官方主要规格 (1 unit = 1m) | 独特几何与涂装特征 |
| --- | --- | --- | --- |
| `jr-east-e235-0` | **JR 东日本 E235 系 0 番台**<br>山手线 (`sk:line:jr-east-yamanote`) | 车长 20.0m (头车体 19.57m / 中间 19.50m) · 宽 **2.95m (宽体鼓形断面)** · 高 3.62m · 轨距 1,067mm · 单侧 **4 门** · 标准 11 编组 · 架空线 1500V DC | 垂直平头「数码画框」黑玻前脸 + 莺绿 (`#80C241`) 倒角外框 + 上角矩形 LED 前照灯 + 顶部点阵行先屏；Sustina 不锈钢无筋车体 + **纵向车门莺绿渐变点阵色带**（无横向腰带）+ 幕板细绿带；PS33H 单臂受电弓 + AU737 双空调。 |
| `tokyo-metro-1000` | **东京 Metro 1000 系**<br>银座线 (`sk:line:metro-ginza`) | 车长 **16.0m** (紧凑标准轨断面) · 宽 **2.55m** · 高 3.465m · 轨距 1,435mm · 单侧 **3 门** · 标准 6 编组 · **第三轨 600V DC（车顶无受电弓）** | 致敬 1927 年初代 1000 形复古切角方正车头 + 中央贯通门立柱装饰 + 下部左右纵向双联前照/尾灯；**全车柠檬黄 (`#F6B400`) 涂装 + 复古棕红 (`#6E3428`) 车顶** + 银座橙/白/深棕腰带；SC101 转向架带**第三轨集电靴**。 |
| `tokyo-metro-17000` | **东京 Metro 17000 系**<br>有乐町线 (`sk:line:metro-yurakucho`)<br>副都心线 (`sk:line:metro-fukutoshin`) | 车长 20.0m (头车体 19.63m / 中间 19.50m) · 宽 **2.80m** · 高 3.635m · 轨距 1,067mm · 单侧 **4 门** · 标准 10/8 编组 · 架空线 1500V DC | **大倾角流线型 3D 曲面黑玻车头** + 偏置左贯通门圆形舷窗 + 传承 7000/10000 系的**标志性双圆形环状 LED 前照灯 (`丸目`)** + 香槟金/深棕雕塑下裙板；铝合金拉丝车体 + **有乐町金 (`#C1A470`) 与副都心棕 (`#9C5E31`) 双色横向贯穿腰带与肩带**。 |

## 3. 模块化架构与文件所有权
1. `src/domain/rollingStock/`（纯 TS 零依赖领域层）：
   - `types.ts`：车型规格、编组定义、LOD 预算、Provenance 来源、动画与位姿契约。
   - `specs.ts`：三款车型经官方公开资料核实的尺寸、转向架中心距、车门布局、来源与已知简化说明。
   - `articulation.ts`：3D 轨道样条多节列车定位与弯道双转向架弦线朝向求解器（计算前后转向架支点、车体俯仰/偏航角、转向架相对转角与车轮滚动角）。
2. `src/three/rollingStock/`（Three.js 资产与动画接口层）：
   - `materials.ts`：共享 PBR 材质与程序化高分辨率纹理库（不锈钢发丝纹、柠檬黄烤漆、莺绿渐变点阵门带、金棕双色腰带、车窗反射与夜间自发光、LED 行先屏）。
   - `components.ts`：通用精细子部件生成器（窄轨/标准轨+集电靴转向架、PS33H/PT71 单臂受电弓、风挡连接幌、柴田式密接车钩、车顶空调与车底逆变器箱）。
   - `builders/e235Builder.ts`, `builders/metro1000Builder.ts`, `builders/metro17000Builder.ts`：三款车型专属的高(`LOD0`)、中(`LOD1`)、低(`LOD2`) 三档精度头车与中间车网格构建器（含独立可动左右车门扇 `Door_L_*` / `Door_R_*` 与独立前照灯/尾灯节点）。
   - `RollingStockFactory.ts` & `glbLoader.ts`：统一车辆/编组创建接口、动画控制器（车门平滑开关、方向切换联动头尾灯、弯道独立定位、三档 LOD 自动/手动切换）、GLB 资产加载与缓存管理。
   - `RollingStockPreviewScene.ts`：独立三维检视与弯道运行演示场景。
3. `public/assets/rolling-stock/` & `scripts/build-rolling-stock-glb.mjs`：
   - 可复现生成标准 glTF 2.0 `.glb` 二进制模型文件与 `manifest.json`。
4. `rolling-stock-preview.html` & `src/ui/rollingStock/RollingStockStudio.tsx`：
   - 独立交互式预览工作台（支持三车同屏远/近对比、单车精细检视、编组长度切换、左右车门开关、行进方向与头尾灯切换、LOD0/1/2 强制或自动切换、弯道运行模拟、GLB 校验面板）。

## 4. 验证与交付里程碑
- **M1**：完成领域规格、弯道运动学求解器与材质/部件库。
- **M2**：完成 E235 系、1000 系、17000 系三档 LOD 专属几何构建器、统一动画接口与 `.glb` 资产导出脚本。
- **M3**：完成独立 3D 预览工作台、Vitest 单元测试、Playwright 端到端测试与真实运行截图采集，输出 `ROLLING-STOCK-SPECS.md` 与 `ROLLING-STOCK-REPORT.md`。
