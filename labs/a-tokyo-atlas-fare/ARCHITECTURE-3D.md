# ARCHITECTURE-3D — Tokyo Metropolitan 3D Railway Atlas

本文档说明 `labs/a-tokyo-atlas-fare/` 升级后的三维都市与铁路网络程序化生成架构，面向未来迁移至大阪、名古屋等其他日本都市圈的可扩展复用设计。

## 1. 总体模块分层

```text
data/processed/atlas.json (CC BY / Public Data License · 唯一铁路主实体)
data/processed/osm-vertical.json (ODbL 1.0 独立纵断层)
public/data/urban-chunks/ (ODbL 1.0 独立都市 GIS 2km×2km 空间分块)
        │
        ▼
src/three/geoProjection.ts        ← 统一局部米制平面投影 (1 unit = 1m, 可参数化 Origin)
src/domain/elevationSolver.ts     ← 纯 TS 3D 垂向求解器 (高度层 + 连续插值 + 交叉避碰 + 洞口)
        │
        ▼
src/three/generators/
  ├─ cityTerrainGenerator.ts      ← 基础地面、真实 OSM 河川/护城河/水域、公园、主干道与交叉口
  ├─ buildingGenerator.ts         ← 空间分块流式加载 + 3 级 LOD (LOD0 轮廓挤出/退台 + LOD1 InstancedMesh) + 9 座地标
  ├─ railTrackGenerator.ts        ← 3D 梯形道床 + 双线/四轨金属钢轨 + InstancedMesh 枕木 + 路线色边条 + 运价双路径
  ├─ viaductGenerator.ts          ← 连续混凝土箱梁高架桥面 + 防护栏 + 避开交叉口桥墩 + 高架站台雨棚
  └─ tunnelGenerator.ts           ← 圆形盾构/矩形明挖半透明隧道壳 + 隧道洞口 + 地下站厅/竖向换乘井/概念出入口
        │
        ▼
src/three/Metropolitan3DScene.ts  ← Three.js 场景、OrbitControls 阻尼与俯仰限制、地下透视/剖切平面、沿线追踪
src/ui/Tokyo3DCanvas.tsx          ← 重点枢纽快跳、地下分层 HUD、剖切滑块、沿线追踪器、实时分块/LOD 遥测
```

## 2. 统一空间坐标系（`src/three/geoProjection.ts`）
- 以东京站（`139.7671°E, 35.6812°N`）为局部切平面原点 `(0, 0, 0)`，右手坐标系：`+X` 东、`+Y` 上、`-Z` 北（`1 unit = 1 meter`）。
- 建筑、道路、河川、地面/高架/地下铁路严格共享同一投影转换 `lonLatToWorld` ↔ `worldToLonLat`，确保 2D MapLibre 与 3D Three.js 切换时地理范围、所选车站/线路、运营商筛选与运价路径无缝保持。
- `ProjectionOrigin` 已参数化，迁移到大阪（梅田/大阪站原点）或名古屋（名古屋站原点）只需更换 `origin` 参数与区域分块数据。

## 3. 垂向层级体系与空间自洽求解（`src/domain/elevationSolver.ts`）
- **示意相对高度层**（明确标注为示意单位，非真实测绘米数）：
  - `L+2 (+20)` 高层高架/新干线 · `L+1 (+10..+14)` 标准高架（如**银座线涩谷 3F `+14`**、中央线东京 `+14`） · `L0 (0)` 地面 · `L-1 (-10)` 浅层明挖地铁 · `L-2 (-20)` 中层地下 · `L-3 (-30)` 深层地下 · `L-4 (-40)` 超深盾构（如都营大江户线 `-38`）。
- **数据依据分级**：每个节点与区段显式标记 `heightBasis`（`manual-verified-relative` / `osm-derived-schematic` / `inferred-schematic`），严禁将推断层级冒充官方实测深度。
- **重点枢纽多层级验证**（已由 `tests/unit/elevationSolver.test.ts` 自动化断言）：
  - **涩谷**：银座线 3F (`+14`, 高架) > 京王井之头 (`+7`) > JR 山手线 (`+2`) > 半藏门/田园都市 (`-18`) > 副都心/东横 (`-30`)。
  - **新宿**：西武新宿 (`+7`, 独立复合体) > JR 地面大走廊 (`0`) > 京王 (`-9`) > 丸之内 (`-12`) > 都营新宿 (`-22`) > 都营大江户 (`-38`, 圆形盾构)。
  - **东京・大手町**：中央线高架 (`+14`) > 东海道/东北新干线 (`+10`) > 东海道/东北本线 (`+6`) > 丸之内 (`-12`) > 东西 (`-18`) > 千代田 (`-23`) > 三田 (`-29`) > 半藏门 (`-34`)。
- **连续插值与无穿模避碰**：相邻区段共享车站标高满足 $C^0$ 连续；所有非共站点的二维交叉区段自动检测垂向净空，不足 `6.5` 单位时对低优先级线路施加端点归零的平滑高斯垂向净空曲线（绝不把平面交叉错误转化为轨道连接）。

## 4. 都市建筑分块流式加载与多级 LOD（`scripts/build-urban-chunks.mjs` + `buildingGenerator.ts`）
- 从真实 OSM 东京 23 区数据（扫描 503,636 栋原始建筑、5,734 条主干道、2,741 条水体/公园）经可复现脚本构建为 **130 个 `2km × 2km` 空间分块**（共 **24,216 栋真实建筑**，其中 **15,063 栋保留真实简化平面轮廓**，自动剔除 563 栋与地面/高架铁路走廊冲突的体块），总计仅 `3.78 MB`。
- **LOD0（近景 `< 2400m`）**：按真实多边形轮廓程序化挤出，按建筑类型（高层办公退台与塔冠、商业裙房、车站公建体块、住宅机房）差异化建模，并叠加程序化 Canvas 立面纹理，按类型合批为每分块 ≤ 4 个 Draw Call。
- **LOD1/LOD2（中远景 `≥ 2400m`）**：每分块 1 个 `InstancedMesh`（基于最长边对齐的真实有向包围盒 OBB）配合视锥剔除与按需异步加载。
- **9 座程序化地标**：东京塔、东京晴空塔、东京都厅双塔、Mode 学园茧塔、涩谷 Scramble Square、涩谷 Hikarie、东京站丸之内红砖站舍、六本木森大厦、阳光 60 均由纯代码程序化拼装生成，无外部成品城市模型导入。

## 5. 运价引擎保护
- JR 运价计算严格继续调用 `src/domain/fareEngine.ts` 与法定 `operatingKm`，绝不以三维样条长度替代营业公里；3D 视图中以橙/青双色悬浮光带回绘实乘路径与法定计费路径。
