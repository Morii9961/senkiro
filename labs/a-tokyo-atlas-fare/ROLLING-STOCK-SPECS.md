# ROLLING-STOCK-SPECS — SENKIRO Atlas v2 Japanese Rolling Stock 3D Asset System

本文档定义 `japanese_rolling_stock_assets` Worktree 交付的 **真实日本铁路车型三维资产系统（High-Fidelity Japanese Rolling Stock 3D Asset System）** 的车型规格、来源与许可、精度与已知简化说明，以及供 **Session 0（全局渲染器集成）** 与 **`train_simulation_engine`（虚拟列车模拟引擎）** 直接调用的统一 TypeScript / Three.js 车辆创建与动画接口。

---

## 1. 协作与文件所有权说明（Zero-Conflict 边界）

为保证与并行 Worktree（`train_simulation_engine`、`tokyo_environment_upgrade`、`underground_railway_geometry_system`、`camera_experience_ux` 及 Session 0）无缝合并：
- **未修改任何全局渲染器或既有业务代码**：`src/three/Metropolitan3DScene.ts`、`src/ui/Tokyo3DCanvas.tsx`、`src/ui/App.tsx`、`package.json` 保持 **0 修改**。
- **未引入任何额外 npm 依赖**：完全基于仓库既有的 `three@^0.187.0` 构建三维程序化网格、PBR 材质纹理解析器与 Khronos glTF 2.0 二进制 (`.glb`) 序列化/加载器。
- **本模块独占文件清单**：
  - `src/domain/rollingStock/`（纯 TypeScript 领域契约、官方核实规格、3D 弯道双转向架弦线定位与运动学求解器）
  - `src/three/rollingStock/`（Three.js 三档 LOD 车辆几何构建器、PBR 纹理与材质注册表、车门/车灯/方向/弯道动画控制器、`.glb` 序列化与 `GLTFLoader` 缓存管理器、独立 3D 预览场景）
  - `src/ui/rollingStock/` & `rolling-stock-preview.html`（独立交互式 3D 车辆检视工作台）
  - `public/assets/rolling-stock/`（9 个预构建 `.glb` 二进制模型文件、`manifest.json` 及真实运行截图 `screenshots/`）
  - `data/rolling-stock-catalog.json`（完整 JSON 资产目录与 `SourceRecord` 溯源记录）
  - `scripts/build-rolling-stock-glb.mjs`（可复现构建 `.glb` 资产与目录的脚本）
  - `tests/unit/rollingStock.test.ts` & `tests/e2e/rolling-stock.spec.ts`

---

## 2. 首批三款车型官方规格与外观特征核对

所有模型严格遵循 `src/three/geoProjection.ts` 的 **统一米制空间尺度（`1 unit = 1.0 meter`）**，严禁使用通用方盒改色冒充不同车型。三款车型从车体横断面轮廓、车长/车宽、轨距、车头造型、前照灯位置、车门数量、涂装色带方向到集电方式均完全独立建模：

| 属性 | 1. JR 东日本 E235 系 0 番台 (`jr-east-e235-0`) | 2. 东京 Metro 1000 系 (`tokyo-metro-1000`) | 3. 东京 Metro 17000 系 (`tokyo-metro-17000`) |
| --- | --- | --- | --- |
| **内部稳定 ID** | `sk:rolling-stock:jr-east-e235-0` | `sk:rolling-stock:tokyo-metro-1000` | `sk:rolling-stock:tokyo-metro-17000` |
| **适用线路 (`SkId<'line'>`)** | 山手线 (`sk:line:jr-east-yamanote`) | 银座线 (`sk:line:metro-ginza`) | 有乐町线 (`sk:line:metro-yurakucho`)<br>副都心线 (`sk:line:metro-fukutoshin`) |
| **连结面间长 (`couplerLengthM`)** | **20.00 m** (头车体 19.57m / 中间 19.50m) | **16.00 m** (头车体 15.52m / 中间 15.40m) | **20.00 m** (头车体 19.63m / 中间 19.50m) |
| **车体宽度 (`bodyWidthM`)** | **2.950 m（宽体鼓形断面 `wide_body_barrel`）** | **2.550 m（紧凑垂直断面 `compact_subway_flat`）** | **2.800 m（A-train 上部微收断面 `atrain_tapered`）** |
| **车顶高 / 地板高** | 3.620 m (受电弓折叠 3.98m) / 1.130 m | 3.465 m (**无车顶受电弓**) / 1.125 m | 3.635 m (受电弓折叠 4.02m) / 1.140 m |
| **轨距 (`trackGaugeM`)** | **1,067 mm** (1.067 m 窄轨) | **1,435 mm** (1.435 m 标准轨) | **1,067 mm** (1.067 m 窄轨) |
| **转向架与中心距** | DT80 / TR264 无摇枕转向架 · 中心距 **13.80 m** | SC101 操舵转向架（**带第三轨集电靴**）· 中心距 **10.60 m** | FS779 转向架 · 中心距 **13.80 m** |
| **电化与受电方式** | DC 1,500V 架空接触网（PS33H 单臂受电弓） | **DC 600V 第三轨受电（车顶无受电弓，转向架设集电靴）** | DC 1,500V 架空接触网（PT71 单臂受电弓） |
| **单侧车门数 (`doorsPerSide`)** | **单侧 4 门** (双扇对开 1.30m 宽) | **单侧 3 门** (双扇对开 1.30m 宽) | **单侧 4 门** (双扇对开 1.30m 宽 + 车端圆形舷窗) |
| **标准编组配置** | 11 编组 (6M5T) + 可变 N 编组 | 6 编组 (6M) + 可变 N 编组 | 10 编组 (4M6T) / 8 编组 (4M4T) + 可变 N 编组 |
| **车头核心特征 (`frontArchetype`)** | 垂直平头「数码画框 / スマホ顔」大面积黑玻前脸 + 四角圆弧莺绿 (`#80C241`) 外框 + **前窗上角矩形 LED 前照灯** + 顶部全彩点阵行先屏 + 银白防撞排障器 | 致敬 1927 年初代 1000 形的复古方正切角车头 + **深棕红车顶帽檐** + **中央外摆贯通门与竖向装饰立柱** + **下部左右纵向双联圆灯** | **大后掠角 3D 曲面黑玻流线型车头** + **左侧偏置贯通门（带圆形舷窗）** + 传承 7000/10000 系的**左右圆形环状 LED 前照灯 (`丸目`)** + 香槟金/深棕雕塑下裙板 |
| **车体涂装特征 (`liveryPattern`)** | Sustina 激光焊接无筋不锈钢拉丝车体 + **纵向车门莺绿渐变点阵色带**（无横向腰带）+ 幕板细莺绿带 | **全车柠檬黄 (`#F5B100`) 烤漆** + **复古棕红 (`#683024`) 拱形车顶** + **银座橙 (`#FF8C00`) 夹白/深棕细线水平腰带** | 铝合金双皮层拉丝车体 + **有乐町线金 (`#C8A96E`) 与副都心线棕 (`#8F5126`) 双色贯穿水平腰带与幕板带** |

---

## 3. 性能、三档 LOD 与 `.glb` 资产清单

### 3.1 三档 LOD 距离阈值与实测三角形面数
| 车型 | `LOD0 (High)` (`< 260m`) | `LOD1 (Medium)` (`260m – 950m`) | `LOD2 (Low)` (`≥ 950m`) | 远景面数削减率 (`LOD0 → LOD2`) |
| --- | --- | --- | --- | --- |
| **JR E235 系 0 番台** | 头车 `2,556` tris / 中间车 `2,540` tris | 头车 `1,180` tris / 中间车 `1,048` tris | 头车 `296` tris / 中间车 `176` tris | **-88.4% (头) / -93.1% (中)** |
| **东京 Metro 1000 系** | 头车 `2,656` tris / 中间车 `2,284` tris | 头车 `1,264` tris / 中间车 `968` tris | 头车 `344` tris / 中间车 `120` tris | **-87.0% (头) / -94.7% (中)** |
| **东京 Metro 17000 系** | 头车 `3,200` tris / 中间车 `2,724` tris | 头车 `1,632` tris / 中间车 `1,232` tris | 头车 `488` tris / 中间车 `152` tris | **-84.8% (头) / -94.4% (中)** |

### 3.2 预构建 Khronos glTF 2.0 (`.glb`) 二进制资产清单 (`public/assets/rolling-stock/`)
所有 `.glb` 文件均可由 `node scripts/build-rolling-stock-glb.mjs` 一键复现，并通过 Three.js 官方 `GLTFLoader` 解析验证：
- `jr-east-e235-0-lead.glb` (`144.6 KB`, 130 nodes, 76 meshes, 14 materials)
- `jr-east-e235-0-mid.glb` (`133.8 KB`, 123 nodes, 68 meshes, 12 materials)
- `jr-east-e235-0-consist.glb` (`417.6 KB`, 381 nodes, 218 meshes, 18 materials)
- `tokyo-metro-1000-lead.glb` (`139.1 KB`, 127 nodes, 70 meshes, 16 materials)
- `tokyo-metro-1000-mid.glb` (`116.0 KB`, 107 nodes, 56 meshes, 12 materials)
- `tokyo-metro-1000-consist.glb` (`388.2 KB`, 359 nodes, 194 meshes, 18 materials)
- `tokyo-metro-17000-lead.glb` (`153.4 KB`, 135 nodes, 72 meshes, 15 materials)
- `tokyo-metro-17000-mid.glb` (`128.7 KB`, 121 nodes, 61 meshes, 12 materials)
- `tokyo-metro-17000-consist.glb` (`429.9 KB`, 389 nodes, 203 meshes, 18 materials)

---

## 4. 统一车辆创建与动画接口（供虚拟列车模拟引擎与 Session 0 调用）

模拟引擎只需导入 `src/three/rollingStock/index.ts`：

```ts
import {
  createTrainConsist,
  createTrainConsistForLine,
  getRollingStockForLine,
  getRollingStockSpec,
  LIST_ROLLING_STOCK_SPECS,
  RollingStockAssetCache,
} from '../three/rollingStock/index.js';
```

### 4.1 按线路 ID 或车型 ID 创建多节列车编组
```ts
// 方式 A：直接传入 SENKIRO 线路 ID ('sk:line:jr-east-yamanote' | 'sk:line:metro-ginza' | 'sk:line:metro-yurakucho' | 'sk:line:metro-fukutoshin')
const yamanoteTrain = createTrainConsistForLine('sk:line:jr-east-yamanote', {
  carCount: 11,          // 支持任意 1..16 节编组（11 节自动匹配山手线官方 6M5T 编组）
  lodMode: 'auto',       // 'high' | 'medium' | 'low' | 'auto'（按相机距离自动切换三档 LOD）
  travelDirection: 'forward',
  worldScale: 1.0,       // 默认 1.0 (1 unit = 1m)，如在大尺度城市鸟瞰需放大可设 1.5..3.0
});

scene.add(yamanoteTrain.group);
```

### 4.2 弯道运行与多节车厢独立定位接口（支持两种调用模式）
- **模式 1：沿 3D 轨道点列自动计算弯道双转向架弦线朝向与坡度俯仰（推荐）**
  模拟引擎只需提供 3D 轨道折线点列（如 `SolvedSegment3D.points` 拼接而成的 `{ x, y, z }[]`）及头车前鼻当前行进里程 `headDistanceM`：
  ```ts
  // 自动计算每节车厢前后转向架在 3D 曲线上的支点坐标、车体弦线偏航角(yaw)/纵坡俯仰角(pitch)/超高横滚角(roll)、
  // 前后转向架相对车体的局部偏角(frontBogieLocalYawRad / rearBogieLocalYawRad)以及车间风挡连接幌折角！
  yamanoteTrain.placeAlongPolyline3D(trackPoints3D, headDistanceM, isClosedLoop);
  ```
- **模式 2：模拟引擎外部独立定位每节车厢**
  ```ts
  yamanoteTrain.setCarPose(carIndex, {
    position: { x, y, z },
    yawRad,
    pitchRad,
    rollRad,
    frontBogieLocalYawRad,
    rearBogieLocalYawRad,
  });
  ```

### 4.3 车门、车灯、行进方向与每帧更新接口
```ts
// 1. 车门开关动画（支持左侧 'left'、右侧 'right' 或双侧 'both' 独立控制）
yamanoteTrain.openDoors('left');            // 平滑开启左侧全部客室滑门（1.4s 三次缓动行程）
yamanoteTrain.closeDoors('left');           // 平滑关闭左侧车门
yamanoteTrain.setDoorState('right', 0.5, true); // 立即设置右侧车门开度为 50%

// 2. 行进方向切换（自动联动首尾两节头车的前照灯与红色尾灯互换！）
yamanoteTrain.setTravelDirection('reverse'); // 切换为后退：11号车亮白色前照灯，1号车亮红色尾灯
yamanoteTrain.setTravelDirection('forward'); // 切换为前进：1号车亮白色前照灯，11号车亮红色尾灯

// 3. 车灯与夜间客室透光开关
yamanoteTrain.setLights({
  headlights: true,
  taillights: true,
  destinationSign: true,
  interiorLights: isNightMode,
  brightness: 1.0,
});

// 4. 每帧更新（驱动平滑开关门、车轮随行驶距离滚动、以及按相机距离自动切换 LOD0/LOD1/LOD2）
yamanoteTrain.update(dtSec, {
  cameraPosition: camera.position,
  distanceDeltaM: speedMps * dtSec,
});
```

---

## 5. 来源、授权与模型简化说明（遵守诚实性硬规则）

1. **来源记录 (`ROLLING_STOCK_SOURCES`)**：
   - `src-jreast-e235-official`：JR 东日本官方车辆图鉴 E235 系主要诸元（J-TREC Sustina S24 规格）。
   - `src-tokyometro-1000-official`：东京 Metro 银座线 1000 系官方车辆诸元（日本车辆制造规格）。
   - `src-tokyometro-17000-official`：东京 Metro 有乐町线・副都心线 17000 系官方车辆诸元（日立制作所 A-train / 近畿车辆规格）。
   - `src-senkiro-procedural-rolling-stock-v2`：SENKIRO Lab 自研程序化三维车辆网格与 PBR 纹理生成系统（**MIT / CC BY 4.0 双重开源许可，`commercialUse: "yes"`, `redistribution: "yes"`**）。
2. **版权与商标合规**：
   - 100% 由本项目代码生成几何与程序化 PBR 纹理，**零第三方商业模型或照片贴图拷贝**。
   - 严格遵循 `docs/00-shared-contract.md` 第 6、7 条：**不在车体上绘制 JR 东日本或东京 Metro 的注册商标 Logo**。
3. **已知简化**：
   - 车厢内部座椅、扶手与吊环省略，以深色镀膜车窗玻璃及可开关的夜间暖色室内透光替代，避免单列 11 节编组产生数十万无效内饰演算面数。
   - 车底 VVVF 逆变器、SIV 辅助电源与制动风缸归纳为符合真实布置走线的代表性功能箱体与储风筒组合。
   - E235 系 10 号车（サハ E235-4600 番台）的特殊窗距与标准中间车统一；东京 Metro 1000 系以量产标准车（1101F–1138F）为准，未单独分叉 1139F/1140F 复古铆钉特别仕样车。
