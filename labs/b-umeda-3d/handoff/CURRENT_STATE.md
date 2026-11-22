# CURRENT_STATE · 梅田站 3D 现状审计

> 审计对象：分支 `lab/b-umeda-3d` 提交 `d6cc1df`（Astra 的最新提交）。
> 审计方式：通读 `src/`、`data/manual/`、`tests/`、`REPORT.md`，并在干净工作树里**真实运行**（`npm install`、`npm run build`、`npm test`、Vite 开发服务器 + 内置浏览器实操）。
> 凡写"实测"的结论来自运行；凡写"读码"的来自代码阅读；没有任何结论仅凭截图。
> GPT 的检出 `E:/SENKIRO/labs/_worktrees/umeda-b` 审计时 `git status` 为干净、HEAD 同为 `d6cc1df`，**没有任何结论依赖未提交改动**（交接前请 Sol 先 `git status` 确认，见 SOL_HANDOFF §3）。

## 0. 一句话结论

Astra 把"空间"做得很好：七座车站 + Whity 的建筑剖面、检票口/电梯/楼梯的几何、可走的通行图、逐段路线导览都**真实可用**。
缺的是"信息系统"这一层：没有搜索、没有线路配色、没有行车方向/目的地、没有列车，标签和详情卡是第一版水平，**选中一个对象时 3D 场景毫无反应**。
最大的工程隐患是：**任意一次 React 状态变化都会把整个 3D 场景拆掉重建**（实测，见 §3.1），不先治好这件事，列车动画无从谈起。

## 1. 实测的运行结果

| 项 | 结果 | 来源 |
|---|---|---|
| `npm install` | 63 个包，0 报错 | 实测（Node 24.15.0） |
| `npm run build` | 通过：`data:check` + `tsc --noEmit` + `vite build`；主 JS 831.98 kB（gzip 232.49 kB），另有 628.94 kB 的 `shop-windows.jpg`；Vite 提示 chunk > 500 kB | 实测 |
| `npm test` | Vitest 14/14，Playwright 4/4（22.3 s）全部通过；控制台无报错 | 实测 |
| 3D 总览 | 3 个 draw call、97,270 个三角面（`canvas[data-calls]` / `data-triangles`） | 实测 |
| 总览标签 | DOM 中共 101 个 `.pin`，当前可见 26 个；字号 11px | 实测（`document.querySelectorAll('.pin')`） |
| 开发服务器 | `vite --port 5291` 可正常打开；点击站台标签、选楼层 2F/B1F、切 2D、开路线导览均正常 | 实测 |
| 性能数字 | Astra 在 REPORT 里报告的软件渲染约 3.3 帧/秒**没有重测**，沿用其记录 | 沿用 REPORT.md |

未运行：`node scripts/measure.mjs`、移动端真机、GPU 帧率。

## 2. 架构地图（读码）

```
data/manual/{model.ts,district.ts,sources.ts}   手工录入的唯一事实来源（带 SourceRecord）
   └─ npm run data:build → data/processed/station.json + data/sources.json + SOURCES.md
src/domain/types.ts      Entity / Place / Link / Level / Station / RailLine / PlatformUpdate …
src/domain/graph.ts      validate()  route()  cost()   纯函数，无 React
src/model.ts             把 manual/model 暴露成 station、nodes(Map)、floors(Map)、sites、inSite()
src/Scene.tsx (1001 行)  three.js 场景：一个 InstancedMesh 装下所有几何 + DOM 标签 + 指针拾取
src/main.tsx  (775 行)   整个 App：所有状态都是 App 里的 useState，没有 store、没有 URL 状态
src/FloorPlan.tsx        2D SVG 平面（只读，无点击）
src/Guide.tsx            "モデル情報"抽屉 + 示例叠加开关
src/architecture.ts / buildings.ts / surfaces.ts / signage.ts / shopWindows.ts   建筑生成器（Astra 的核心资产，**勿动**）
src/providers/service.ts 运行情报接口：live 恒为 unavailable；example 为 synthetic 夹具
```

数据规模（`data/processed/station.json`，实测统计）：4 家运营商、7 座车站、12 条线、20 个 Level（归并为 6 个展示层）、171 个 Place（47 Concourse / 24 Platform / 96 Landing / 4 Entrance）、194 条 Link（15 Gate、129 Passage、35 Elevator、14 Stairs、1 Escalator）、6 个 context（5 站 + Whity）。

关键机制：

- **一个 `InstancedMesh`**（`Scene.tsx:783`）装下全部几何；每个实例对应的"所有者 ID"记在并行数组 `owners[]`（`Scene.tsx:106,306,917`）。拾取 = 射线打到实例 → `owners[instanceId]` → `onInspect(id)`。这个 `owners[]` 恰好是做**按对象高亮**的现成抓手（见 UX_SPEC §7）。
- **标签是 DOM `<span class="pin">`**，由 `label()`（`Scene.tsx:336`）创建，`draw()`（`Scene.tsx:165–201`）每帧投影定位。
- **ID 体系**：`sk:<type>:<slug>`。Place 的 id 即对象 id；Link（含 Gate）的 id 即设施 id；站台/检票口没有独立"Gate 实体"——Gate 只是 `kind:'Gate'` 的 Link。

## 3. 功能逐项审计

状态图例：**✅ 已实现且可用** · **🟡 已实现但体验不足** · **🧩 只有 UI，没有实际业务逻辑** · **⬜ 尚未实现** · **🔗 依赖外部数据**

### 3.1 渲染与场景

| 功能 | 状态 | 依据与说明 |
|---|---|---|
| 七站 + Whity 的建筑剖面、站台/轨道/钢架/电梯/楼梯/检票口几何 | ✅ | 实测。Astra 的核心成果，保留。 |
| 楼层隔离（全階/3F/2F/中2F/1F/B1F/B2F）、階層分解、建築断面开关 | ✅ | 实测。展示层是跨车站按 ordinal 归并的"示意层"，不是统一海拔（DECISIONS 已说明）。 |
| 乘客目線（站台/Whity 内部视点） | ✅ | 读码 + Playwright 覆盖。固定机位，只能环顾，不能走动。 |
| **场景重建策略** | 🟡 **严重** | 读码 `Scene.tsx:987–989`：`useEffect(() => update.current?.(props), [props])`，`props` 每次渲染都是新对象 → **App 任何状态变化都调用 `rebuild()`**：销毁并重新生成全部矩阵、DOM 标签、站牌、商铺窗。实测：仅点击"?"打开说明对话框，旧的标签 DOM 节点全部被摘除（`oldLabelDetached: true`）、渲染帧号变化。后果：选中高亮若走重建会卡；列车每帧更新更不可能。**这是 Sol 的第一道必修门。** |
| 按需渲染（静止不画） | ✅ | 读码：`controls.change → draw`，无常驻 rAF。列车动画需要新增受控的 rAF 时钟。 |
| 深色/浅色 | 🟡 | 只有 UI 层 CSS 变量换色；3D 场景背景透明，材质色不随主题变。 |
| 构建体积 | 🟡 | 主包 832 kB、未做分包；`shop-windows.jpg`（AI 生成的匿名橱窗贴图，628 kB）**已入库**——与"仓库里不放图片"的项目约定存在张力，见 §6 待用户决定。 |

### 3.2 选择、点击、联动（任务书 §四、§五）

| 功能 | 状态 | 依据与说明 |
|---|---|---|
| 3D 点击拾取（标签点击 + 射线） | 🟡 | 读码 `Scene.tsx:882–918`、实测。标签命中优先，其次射线；能拿到 owner id。 |
| 选中后 3D 高亮 / 其余淡化 | ⬜ | 实测：点"大阪 3·4番のりば"后场景无任何视觉变化；`selected` 色只用于路线当前步。 |
| 选中后镜头聚焦 | ⬜ | 实测：镜头不动。镜头聚焦只发生在"路线逐段导览"。 |
| 选择状态是否统一 | 🟡 | `picked`（点选）、`trip.start/end`（路线端点）、`step`（导览步）、`siteId`（站选择器）、`Guide` 里自己的 `placeId`（"施設と資料"下拉）是**五套互不相通的状态**。"モデル情報"里选的设施不会在 3D 里出现。 |
| 点击站台/检票口/通道/楼梯的详情卡 | 🟡 | 见 §3.4。只有一个通用的悬浮小卡。 |
| 2D 平面图点击 | ⬜ | `FloorPlan.tsx` 无任何 `onClick`；只有 `<title>` 悬停提示。 |
| 搜索 | ⬜ | 全站没有搜索。起终点只能从列出 100+ 个地点的 `<select>` 里选。 |
| URL 深链 / 分享 | ⬜ | 所有状态在 React `useState`，刷新即丢。 |

### 3.3 标签系统（任务书 §三）

| 功能 | 状态 | 依据与说明 |
|---|---|---|
| 标签生成 | 🟡 | 读码 `Scene.tsx:408–607, 697–770`：站名牌（priority −1/−2）、楼层角标（0）、站台号（1）、改札/Concourse 名（2）、路线步骤（−2…0）。没有统一的标签数据模型，生成逻辑散落在几何循环里。 |
| 分级 | 🟡 | 只有"priority ≤ 1 常显 / 2 需 zoom>1.35 / 其他需 zoom>2.3 或单层视图"两道硬阈值（`Scene.tsx:183–185`），没有回差，阈值附近会闪烁；没有"站名 → 线路 → 设施 → 构件"四级。 |
| 屏幕空间避让 | 🟡 | 只比较 `|Δy|<24px` 且 x 区间重叠的"先到先得"（`Scene.tsx:190–194`）：不看优先级差距以外的上下文，不尝试位移，不画引导线。实测：总览中阪急 9 条站台只显示 1/3/9，其余被吞；B1F 单层视图里多个"改札内"标签挤成一团、文字小而难读（800×600 视口截图）。 |
| 建筑遮挡 | ⬜ | 完全不做。只靠"同一时刻只显示当前层/当前步涉及的层"回避。 |
| 越界处理 | 🟡 | 超出屏幕即隐藏（`x > width/2+4` 等），不钳制到边缘。 |
| 视觉规范 | 🟡 | 11px 白底小标签；站名牌深底 13px；站台标签左侧竖条色是**硬编码三色**（`Scene.tsx:521–528`，`#b44041/#b95436/#537986`），不是线路色，也没有数据来源。 |
| 站名标签点击歧义 | 🟡 | 读码+实测：站名牌 `JR 大阪駅` 的 owner 是 `sk:platform:jr-11`，点它会打开 11 号站台卡——站名与站台混为一谈。 |

### 3.4 详情面板（任务书 §四）

位置：`main.tsx` 内联的两个 `.place-card`（Link 版、Place 版），悬浮在 3D 画布左上角。

| 项 | 状态 | 实际内容 |
|---|---|---|
| 站台卡 | 🟡 | 楼层 · 区域（闸内/闸外·管理方）、站台名、线路名（`serviceLineIds`）、两个按钮「ここから/ここまで」、折叠的"資料・精度"。**缺**：运营公司、行车方向/目的地、相邻站、换乘线路、关联检票口与楼梯电梯、运行信息区。 |
| 检票口/通道/楼梯/电梯卡（通用 Link 卡） | 🟡 | 楼层 A → 楼层 B、名称、"A ↔ B"、方向是否确认、来源折叠。**缺**：关联线路与站台、通往设施、无障碍字段（数据有 `stepFree` 但不展示）、换乘方向。 |
| 出入口卡 | ⬜ | 只有 4 个 `Entrance` 地点，走通用 Place 卡；没有出口编号/地面位置/可达线路。 |
| 卡片遮挡画布 | 🟡 | 实测：卡片叠在 3D 左上角，会盖住站名牌与站台。 |
| 数据来源 | ✅ | 每个对象的 `provenance.sourceIds` → 来源标题/日期/链接，折叠显示。这一点做得对，保留。 |
| 无数据字段显式标"不可用" | ⬜ | 现在是"不画"而不是"画出并标未知"。 |

### 3.5 数据关联

| 关系 | 状态 | 说明 |
|---|---|---|
| 站台 ↔ 车站 ↔ 运营商 | ✅ | `Place.stationId` → `Station.operatorId`。 |
| 站台 ↔ 线路 | ✅ | `Place.serviceLineIds`（仅登记确认的关联；`jr-11` 没有）。 |
| 检票口/楼梯/电梯/通道 ↔ 两端 Place | ✅ | `Link.from/to`，带 `connection:'verified'` 与 `stepFree`。 |
| 检票口 ↔ 线路/站台 | 🟡 | 数据里没有直接字段，但可经图**派生**（Gate 两端 → paid 侧 Place → stationId → lineIds）。尚未做，UI 未暴露。 |
| 换乘关系 | 🟡 | 只有一个 `Interchange` 记录（JR↔御堂筋线）。其余换乘只能经寻路图得到。 |
| 线路识别色 | ⬜ | `RailLine` 类型**没有颜色字段**；12 条线无一登记颜色。 |
| 行车方向 / 主要目的地 / 相邻站 | 🔗⬜ | 类型与数据均无；需有来源的人工录入（官方站台页、站内图）。 |
| 出入口编号 / 地面位置 | 🔗⬜ | 只有 4 个 Entrance；市图 A–G 涉及的出口未编号建模。 |
| 距离 / 耗时 | ⬜（有意） | Astra 明确"没有步行距离与耗时"。**保持**，除非有数据依据。 |

### 3.6 站内导航（任务书 §六）

| 功能 | 状态 | 依据与说明 |
|---|---|---|
| 通行图 | ✅ | `graph.ts`：节点 = Place，边 = verified Link；Gate 是唯一可跨付费边界的边；校验拒绝跨运营商闸内直连、拒绝未声明跨层。 |
| 寻路 | ✅ | `route()`：代价字典序（改札数 → 换层次数 → 段数），不输出距离/时间；方向未知的扶梯不可寻路。读码 + Vitest。 |
| 无台阶模式 | ✅（偏保守） | `liftsOnly` 只放行 `stepFree === true`；**94+4 条 `stepFree:null` 的通道被一并排除**（资料空白不当作可通行），所以此模式下可达的端点比实际少。这是有意的诚实取舍，但 UI 没有解释"为什么没有路线"。 |
| 起终点选择 | 🟡 | 两个长 `<select>` + 6 个预设（`tours`）+ 站台卡上的按钮。无搜索、无"我的位置"概念。 |
| 3D 路线显示 | 🟡 | 实测：只显示当前步涉及的两层，当前步橙色加粗、箭头；**没有跨层的整条路线总览**（点"全経路"回到全层，但路线只以被高亮的设施体现，无连续折线）。 |
| 楼梯/扶梯/电梯/转弯点强调 | 🟡 | 当前步的设施高亮并带标签；没有"转弯节点"概念，没有楼层变化的醒目提示（只有步骤列表右侧小字 `1F → B1F`）。 |
| 逐段镜头 | ✅ | 读码 `Scene.tsx:810–842`：楼梯类从下端平台仰视，其他按 span 取景。无缓动动画（直接跳）。 |
| 无障碍路线 | 🟡 | 见上；"数据允许时"原则已遵守，缺少对"未知"路段的逐条标注。 |
| 路线面板版面 | 🟡 | 实测 800×600：面板标题被导航标签条盖住一半（"乗り換えをたどる"被裁切）。 |

### 3.7 列车、时刻、车型（任务书 §七）

| 功能 | 状态 | 依据与说明 |
|---|---|---|
| 列车模型 / 车型资产 | ⬜ | `src/` 中除 `buildings.ts` 里一句"train shed"注释外，没有 train / vehicle / timetable 任何代码。 |
| 轨道路径 | ⬜ | 站台旁有示意道床/钢轨/轨枕几何（`Scene.tsx:448–507`），但**不是**可供列车行驶的路径数据；无轨道拓扑、无进出站方向。阪急 9 条尽端股道有 `terminalEnd`，其余没有进出站方向信息。 |
| 时刻表 / 列车模拟 | ⬜ | 无。 |
| "运行示例" | 🧩 | `exampleService`：**一条** 2000-01-01 的 synthetic `PlatformUpdate`（御堂筋线 1 号站台 +3 分）。默认关闭，开启时站台标签与角标写明"EXAMPLE MODE"。诚实标注到位，但它不是列车系统，只是演示叠加协议的存在。 |
| 实时运行情报 | 🔗 | `liveService.read()` 恒返回 `unavailable / no-licensed-feed`。UI 显示"リアルタイム配信なし"。正确的诚实处理。 |
| ODPT / 官方开放时刻 | 🔗 | REPORT：对 ODPT CKAN 五个关键词查询均返回 0 个匹配。**这是 2026-11-21/22 的一次检索结果，不是永久结论**——Sol 在做时刻表前应重新检索并登记结果（见 DATA_CONTRACTS §8）。 |

### 3.8 视图与 UI 框架

| 功能 | 状态 | 依据与说明 |
|---|---|---|
| 2D/3D 切换 | 🟡 | 实测可用。2D 是每层独立 SVG，B2F 分成多块面板；但**无文字标注**（只有圈内编号与图下图例）、无线路色、无选择联动、无点击。 |
| 车站选择器（左上 `▸ 駅・地下街を選択`） | ✅ | 实测可用；选站会重置选择与楼层。 |
| 日/英、深浅色、键盘、触屏 | ✅ | 读码 + Playwright。`names.zh` 全为 null，**无中文界面**（任务书未要求）。 |
| 布局 | 🟡 | 一个 775 行的组件承载全部状态和 JSX，每个控件是原子 `<button>`；窄屏时抽屉放下半屏。无设计 token 文件，颜色散落在 `style.css`（1105 行）。 |
| 品牌 | 🟡 | 头部写"SENKIRO Lab"，色板为深绿/米色；与新宿站（Lab C）的 `theme.ts` 调色体系不同，没有共享的线路标识组件。 |

### 3.9 测试

- `tests/topology.test.ts`（14 项）：ID/来源/层/付费边界校验的反例、两条关键路线顺序、五站可达性、示例与实时分离。**质量好，保留并扩展。**
- `tests/browser/station.spec.ts`（4 项）：生产构建上的 WebGL、导览、楼层、2D、移动端、地区切换，并监控控制台报错。
- 缺：无任何 UI 组件单测；无标签布局测试（因为布局散在 `draw()` 里，不可测）；无"选择状态一致性"测试；无截图回归。

## 4. 保留 / 局部重构 / 可重写

| 区域 | 建议 | 理由 |
|---|---|---|
| `data/manual/*`、`src/domain/*`、`tests/topology.test.ts` | **保留并只增不改** | 事实与校验是全项目最硬的资产。新增字段一律可空 + 来源。 |
| `architecture.ts`、`buildings.ts`、`surfaces.ts`、`signage.ts`、`shopWindows.ts` | **不动** | Astra 的建筑表现。任务书明确禁止重建。 |
| `Scene.tsx` 几何循环（`rebuild` 内生成矩阵的部分） | **保留逻辑**，把它搬进"几何构建"模块 | 复杂且已验收。 |
| `Scene.tsx` 的 props→rebuild 绑定、标签、拾取、相机 | **局部重构** | 拆成：geometry（有 key 才重建）/ appearance（高亮、淡化，改实例色）/ labels（独立模块）/ camera（带缓动）。 |
| `main.tsx` 的 `App` | **重构** | 抽出 `src/state/`（selection、view、route），组件拆文件。不改默认行为直到对应任务验收。 |
| `Guide.tsx` | **并入详情面板与"情報"页** | 它的"施設と資料"下拉与选择状态重复。 |
| `FloorPlan.tsx` | **增强而非重写** | 复用分块布局；补标签、选择、线路色。 |
| `style.css` | **分层：先抽 tokens，再逐步改组件样式** | 不一次性重写。 |

## 5. 与新宿站（Lab C）的差距

参考实现位于 `E:/Workteree/SENKIRO/shinjuku-3d-indoor-nav-3f3cce/labs/c-shinjuku-3d`（分支 `claude/shinjuku-3d-indoor-nav-3f3cce`，只读）。梅田缺的恰好是新宿已有的：

| 能力 | 新宿位置 | 梅田现状 |
|---|---|---|
| 四级标签 + 回差 + 同义折叠 | `src/ui/scene/labels.ts`、`src/ui/Scene3D.tsx` | 两档阈值，无回差 |
| 设施卡片（站台/检票口/出入口/竖向设施分型） | `src/ui/panels/FacilityCard.tsx` | 通用小卡 |
| 线路徽章与芯片 | `src/ui/atoms.tsx`（`LineBadge`、`FloorChip`） | 无 |
| 镜头位姿与缓动 | `src/ui/scene/camera.ts`、`Scene3D.tsx`（`easeInOut`） | 无缓动 |
| 路线图 + 站内导航 | `src/domain/route.ts`、`src/ui/panels/RoutePanel.tsx` | 已有（更保守） |
| 时刻表契约 / 校验 / 注册表 | `src/timetable/*`、`data/timetable/README.md` | 无 |
| 列车模拟与车辆库 | `src/trains/*`、`src/ui/trains/*` | 无 |
| 2D 分栏平面 | `src/ui/Plan2D.tsx`、`src/ui/planLayout.ts` | 有基础版 |
| 数据纪律（来源/本地私有/Demo 隔离） | `V3-REPORT.md` §23–§26 | 有来源纪律，无时刻表纪律 |

**警告**：Lab C 的 V3-REPORT §24 自己记录了"时刻表数据已知不准或未核实的地方"，JR 数据仅本地。梅田不得把新宿的数据逻辑当作已验证事实搬运，只借**结构与纪律**。

## 6. 需要用户拍板的事项（不要由 Sol 擅自决定）

1. **`src/shop-windows.jpg`（628 kB，AI 生成的匿名橱窗贴图）已提交入库。** 项目约定"仓库里不放图片"，而本图不是运营商图像/Logo。是保留、改为程序化生成、还是移出仓库，请用户定。
2. **时刻表数据策略**：哪些运营商允许"仅本地使用"？（新宿站先例：JR 东日本条款谢绝再分发，用户当时决定本地私用、绝不提交。）阪急/阪神/JR 西/Osaka Metro 须逐个核对条款。
3. **线路识别色**从哪里取：必须有可引用来源并登记 SourceRecord；找不到来源就保持 `null`，使用中性徽章。
4. **是否需要中文界面**（目前 `names.zh` 全 null；任务书没要求）。

## 7. 对既有"已知缺陷"的复核

REPORT §7 列出的限制（示意间距、闸机数量、门机、Whity 租户、乘客相机固定等）经读码均属实，此处不重复。新增的、REPORT 没写的缺陷：整场景随 React 状态重建（§3.1）、站名标签 owner 指向站台（§3.3）、五套互不相通的选择状态（§3.2）、无台阶模式不解释"无路线"原因（§3.6）、面板标题在窄屏被裁切（§3.6）。
