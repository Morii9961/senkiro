# DATA_CONTRACTS · 数据接口设计

> 范围：站台、线路、设施、楼层、车站通行网络、车辆、时刻系统，以及 UI 状态（选择、URL）。
> 规则：**只增不改**现有 `src/domain/types.ts` 的语义；新增字段一律**可空 + 来源**；手工事实继续录入 `data/manual/*.ts`，由 `npm run data:build` 生成 JSON，`data:check` 发现过期即失败。
> 契约来源：仓库根 `docs/00-shared-contract.md` §1–§5（不编造、null=未知、可追溯、synthetic 三处标注、无合法实时不得冒充）。

## 0. 通用规则

1. **每个新事实都带 `provenance`**（`sourceIds[] + dataNature + lastVerifiedAt`），来源须在 `data/manual/sources.ts` 登记 SourceRecord（含许可、可否再分发）。
2. **未知 = `null`**，UI 渲染 `UnknownValue`。不得用"看起来合理"的值填充。
3. **派生量不入手工数据**：由纯函数从模型算出，`dataNature` 视为 `derived`，在 UI 标「派生・示意」。
4. 坐标仍是示意单位；任何字段名带 `Meters/Seconds` 的必须有来源，否则 `null`。
5. 新增数据文件 → 新增校验（`validate()` 扩展或新校验函数）→ 新增反例测试。
6. 仓库内**不放图片/PDF/字体**；官方图只读事实、不入库；不入库的数据放 `data/raw/`（已被 git 忽略）。

## 1. 现有类型（不变，作为基线）

`Entity`（`id / names / externalIds / provenance / geometry_confidence / validFrom / validTo`）、`Operator`、`RailLine`（仅 `operatorId`）、`Station`（`operatorId / lineIds`）、`StationComplex`、`Interchange`、`Level`（`ordinal / label / stationId`）、`Place`（`kind: Platform|Concourse|Entrance|Landing`、`levelId`、`zone`、`stationId`、`manager`、`point/size`、`serviceLineIds?`、`boarding?`）、`Link`（`kind: Passage|Gate|Stairs|Elevator|Escalator`、`from/to`、`direction`、`declaredSpan`、`stepFree`、`connection`）、`DistrictSite`、`PlatformUpdate`。详见 `src/domain/types.ts`。

## 2. 线路与识别色（`data/manual/lines.ts`，新增）

不在 `RailLine` 里改字段，而新建并行表，避免触碰 Astra 的 `model.ts`：

```ts
export interface LineStyle {
  lineId: string                       // sk:line:…，必须存在于 model.lines
  color: { hex: string; sourceIds: string[]; dataNature: DataNature } | null   // null = 线色未核实
  /** 站号前缀文字，如有来源才写；不画官方圆形符号 */
  stationNumberPrefix: string | null
  /** 用于徽章文字的短名；null 则用 names 的 ja/en */
  shortName: { ja: string; en: string } | null
  kind: 'jr' | 'subway' | 'private' | 'other'
}
export const lineStyles: LineStyle[]
```

- 校验：`lineId` 唯一且存在；`color.hex` 匹配 `/^#[0-9a-f]{6}$/i`；有 `color` 则 `sourceIds` 非空且来源已登记；对比度函数给出徽章文字色。
- **来源要求**：线路色须来自可引用的公开资料（运营商线路图/标识规范页面或可信的百科条目），在 SourceRecord 写明读取日期；**读不到就保持 `null`**。不得凭记忆填色。图片不入库，只记录十六进制值与出处。
- 现状：12 条线无一有色（`CURRENT_STATE §3.5`），所以交付时允许大量 `null`，UI 走中性徽章。

## 3. 站台、方向与相邻站（`data/manual/services.ts`，新增）

```ts
export interface PlatformService {
  platformId: string                   // sk:platform:…（Place.kind==='Platform'）
  lineId: string                       // 必须 ∈ Place.serviceLineIds
  directions: PlatformDirection[] | null   // null = 方向/行先未核实
  track: { sides: (-1|1)[]; terminalEnd?: -1|1 } | null  // 与 Place.boarding 一致；以 Place.boarding 为准
  provenance: Entity['provenance']
}
export interface PlatformDirection {
  id: string                           // 'sk:direction:hk-3-kyoto'
  towards: { ja: string; en: string | null } | null   // 官方站台标识上的方面/终点文字，原文
  bound: 'up' | 'down' | 'inner' | 'outer' | 'other' | null
  terminusStationName: { ja: string; en: string | null } | null  // 仅文字；不建立外部站点 ID
  neighborStationName: { ja: string; en: string | null } | null  // 下一站（仅当来源给出）
  sourceIds: string[]
}
```

- `Station.neighbors` 不新增到 `Station` 类型；通过 `PlatformDirection.neighborStationName` 提供"相邻站"，缺失即未知。
- 来源：官方站台页/构内图的站台说明；与 `Place.serviceLineIds` 一致（校验：`lineId` ∈ 该站台 `serviceLineIds`）。
- 校验反例：方向引用不存在的站台、`lineId` 不在站台服务线路里、`towards` 为空字符串。

## 4. 出入口（`Entrance` 的补充，`data/manual/exits.ts`，新增）

```ts
export interface ExitInfo {
  placeId: string                      // 必须是 Place.kind==='Entrance'
  exitLabel: { ja: string; en: string | null } | null   // 出口编号/名称原文，如图上印刷的
  surfaceNote: { ja: string; en: string | null } | null // 地面位置说明，来源给出才写
  provenance: Entity['provenance']
}
```
现有只有 4 个 `Entrance` Place。**不要为了凑数量新增出口**；新增必须有来源且在 `exits.ts` 与 `model.ts` 同步。

## 5. 设施索引与派生关系（`src/domain/index.ts`，新增，纯函数）

```ts
export interface FacilityIndex {
  place(id: string): Place | undefined
  link(id: string): Link | undefined
  levelOf(id: string): { ordinal: number; label: string } | undefined
  stationOf(id: string): Station | undefined
  linesAtPlace(placeId: string): RailLine[]                 // serviceLineIds
  linksAt(placeId: string): Link[]                          // 图邻接
  gateView(linkId: string): GateView
  exitView(placeId: string): ExitView
  platformView(placeId: string): PlatformView
  verticalView(linkId: string): VerticalView
  ownersOf(target: SelectionTarget): Set<string>            // UX_SPEC §7，用于高亮
  relatedTargets(target: SelectionTarget): SelectionTarget[]// 关系列表与 related 高亮
}
export interface GateView {
  gate: Link; insideSide: Place; outsideSide: Place         // paid / unpaid
  operatorsAcross: [Operator | null, Operator | null]       // 跨运营商闸
  servedPlatforms: Place[]                                  // 从 paid 侧、不再过其他 Gate 可达（BFS），derived
  facilitiesOutside: Place[]                                // 非 paid 侧 2 跳内的 Entrance/Concourse
  stepFree: boolean | null
}
export interface PlatformView {
  platform: Place; station: Station; operator: Operator; lines: RailLine[]
  services: PlatformService[]                               // 无则 []
  nearestGates: Link[]; nearestVerticals: Link[]            // 图 2 跳内，derived
  transfers: { toPlatformId: string; gates: number; levelChanges: number; stepFreeKnown: boolean | null }[] // derived：同一 complex 内到其他线路站台，最多 8 个
}
export interface ExitView { entrance: Place; info: ExitInfo | null; nearestArea: Place | null; reachableLines: RailLine[] }
export interface VerticalView { link: Link; fromLevel: Level; toLevel: Level; servedPlatforms: Place[]; operatingDirection: 'both'|'forward'|'unknown' }
```

- `servedPlatforms / transfers / reachableLines` 全部 `derived`：用 `graph.ts` 的邻接做 BFS，**不新增事实**。UI 标「派生・示意」。
- 测试：对 7 站每个 Gate，`servedPlatforms` 与手工预期对照（至少 5 个代表性 Gate 的黄金用例）；`ownersOf(platform)` 与 `Scene` 的 `owners[]` 取值一致。

## 6. 通行网络与路线（`src/domain/graph.ts` 扩展）

现状已具备：节点=Place、边=verified Link、Gate 为唯一可跨付费边界的边、跨层需声明、字典序代价。**保持这些不变量。** 扩展：

```ts
export interface RoutePlan {
  steps: Step[]                         // 与现有 Step 相同
  summary: { gates: number; levelChanges: number; segments: number }   // 现有 cost()
  floorSpans: { fromLabel: string; toLabel: string; stepIndexes: number[] }[]  // 按楼层分组，供 UI
  unknownStepFree: string[]             // 路线中 stepFree===null 的 Link.id（逐条标注）
  distanceMeters: null                  // 恒为 null，直到出现有来源的距离数据
  durationSeconds: null                 // 同上
}
export type RouteFailure =
  | { reason: 'no-path' }
  | { reason: 'step-free-blocked'; firstBlockingLinkId: string; blocker: 'stairs'|'escalator-direction-unknown'|'unknown-step-free'|'unverified' }
export function planRoute(m: Model, start: string, end: string, opts?: { stepFreeOnly?: boolean }): RoutePlan | RouteFailure
```

- `planRoute` 内部复用 `route()`；`step-free-blocked` 的求法：先不带限制求路径，若有，则找首个 `stepFree!==true` 的边及其原因。
- 可选增强（任务 N-3）：`Link.waypoints?: Point[]`（示意折线，用于 3D 路线画弯；无则两端直连——**仅在同一个 Link 内**，不是两点间的"捷径"）。
- **一致性检查脚本**（沿用新宿思路）：`scripts/check-routes.ts`：全站两两端点路线复查（有路必须经 Link 序列、无路不画）、竖向设施跨度检查、"画出来的 = 图里的"（每个被 3D 绘制为路线的 Link.id 必须出现在 `RoutePlan.steps`）。
- **转弯节点**：UI 在折线顶点画点即可，数据里不存转向。

## 7. 车辆（`data/manual/vehicles.ts`，新增；阶段 4）

```ts
export interface VehicleSeries {
  id: string                           // sk:vehicle:<operator>-<slug>
  operatorId: string
  names: Entity['names']               // 系列名原文，如来源给出
  category: 'commuter' | 'rapid' | 'limited-express' | 'subway' | 'other' | null
  /** 外观：自有程序化设计。不复制官方涂装/符号；这里记录的是"示意配色"，不是官方涂装 */
  livery: { body: string; accent: string; stripe: string | null; nature: 'schematic' }
  proportions: { carLengthToWidth: number; carCountDefault: number | null }  // 示意比例，非实测
  formations: { cars: number; sourceIds: string[] }[]    // 已核实的编组；空数组=未知
  provenance: Entity['provenance']
}
export interface VehicleAssignment {
  lineId: string
  seriesId: string | null              // null = 未知，画中性泛用车体
  status: 'verified' | 'representative' | 'unknown'
  sourceIds: string[]
}
```

- 对应新宿 `VehicleAssignmentStatus`（`labs/c-shinjuku-3d/src/timetable/types.ts`）：`verified` = 来源确认；`representative` = 该线常见车型，仅示意；`unknown` = 无依据 → 泛用车体且卡片写「車種未確認」。
- **不允许"所有线路同一种泛用列车"**：至少区分 JR 近郊/环状、地铁（四条 Osaka Metro）、阪急（阪急式窄/长车体、尽端站）、阪神，**但每个"区分"都必须是 `representative` 或 `verified` 且有来源，否则就是 `unknown` 中性体**。程序化车体的比例与配色是示意设计，须在卡片注明「外観は模式表現」。
- 尺寸：全部是示意单位。沿用 `NOMINAL_CAR_LENGTH`（新宿 3.4）式常量，编组长度 = `cars × carLength`，不超过站台长度 − 边距；编组未知时按站台长度的 72% 绘制并标「編成未確認」。

## 8. 轨道与列车运行（`src/trains/`，新增；阶段 4）

### 8.1 轨道路径

```ts
export interface TrackPath {
  id: string                           // 'track:sk:platform:hk-3:-1'
  platformId: string
  side: -1 | 1                         // 与 Place.boarding.trackSides 一致
  polyline: [number, number, number][] // 世界坐标；由站台几何派生：站台轴向 ± 轨道偏移（Scene.tsx 已用 side*(breadth/2+0.54)）
  stopRange: [number, number]          // 站台内可停车区间（沿轴向）
  entrance: 'x-' | 'x+' | 'z-' | 'z+'  // 列车从站台哪一端驶入；来源缺失则 null → 不上轨
  terminal: boolean                    // 来自 Place.boarding.terminalEnd
  derivedFrom: 'platform-geometry'     // 声明为示意派生
}
export function deriveTrackPaths(m: Model): TrackPath[]
```

- **进出站方向无数据（除阪急尽端）→ `entrance` 取 `null`，该轨道不允许有列车**。有来源后才补。
- 校验：路径落在所属楼层、与站台 AABB 平行且在其外侧；与 `Scene.tsx` 绘制的钢轨位置一致（测试比对）。

### 8.2 运动模型（显示常量，不是运营数据）

`APPROACH_SECONDS / DEPART_SECONDS / SHORT_STOP_SECONDS / ASSUMED_DWELL_SECONDS / MIN_APPROACH_SECONDS / FOLLOW_GAP_SECONDS`（新宿 `simulate.ts` 同名）放 `src/trains/constants.ts`，注释声明"本原型的显示选择，不是运营数据"。位置函数：纯函数 `(plan, nowSeconds) -> {phase, s, speedFactor}`；阶段：`approaching → braking → doors-opening → doors-open → doors-closing → stopped → departing`。无随机、无延误推算。

## 9. 时刻系统（`src/timetable/`，新增；阶段 4）

### 9.1 记录（沿用新宿契约，字段名 snake_case 不变）

直接参照 `labs/c-shinjuku-3d/src/timetable/types.ts` 的 `TimetableRecord / TimetableSource / TimetableDataset / TimetableKind / TrainLiveState`（只读参考）。字段：`station_id, operator_id, line_id, platform_id, direction_id, service_date_type, trip_id, train_number, arrival_time_local, departure_time_local, destination_text, service_class, vehicle_series, formation_length, vehicle_assignment_status, source_id, valid_from, valid_until, remarks`。**梅田必须自建 `registry.ts`**：把梅田各站的 `station_id` 映射到 `sk:station:*`，各线的 `line_id` 映射到 `sk:line:*`，**不得沿用新宿的 ID/注册表**。

### 9.2 四类数据与模式（硬规则）

```ts
export type FeedMode =
  | { kind: 'off' }
  | { kind: 'timetable-sim'; dataset: TimetableDataset /* kind==='timetable' */ }
  | { kind: 'demo'; dataset: TimetableDataset /* kind==='demo-fixture'，source_id 前缀 'demo:' */ }
  | { kind: 'live'; /* 目前恒不可用 */ available: false; reason: 'no-licensed-feed' }
```

- **同一数据集不得混合 demo 与 timetable**（新宿 `validateDataset` 已实现，移植并加反例）。
- **`train_number` 只在来源给出时填写**；`trip_id` 是内部 ID，不显示。
- `vehicle_series` 为空时 `vehicle_assignment_status` 必须是 `unknown`。
- `platform_id` 为空 → 不上轨、不画车。
- 服务日按 JST；24:xx 表示跨午夜；本机时间只用作"现在"时钟，不作为列车位置证据。
- 日别：平日 / 土休日 / 每日，按 `service_date_type` 选取；不推断节假日。

### 9.3 数据入库纪律

| 数据 | 条件 | 去向 |
|---|---|---|
| 条款明确允许再分发（`redistribution:'yes'`） | SourceRecord 完整，`data:build` 检查通过 | `data/timetable/*.csv|json`（入库） |
| 条款不允许再分发 / 未知 | **用户明确同意"仅本地使用"** | `data/raw/timetable/`（git 忽略），界面标「仅本地（不可再分发，不在仓库中）」 |
| 无任何来源 | — | 不建模；只有 Demo Fixture（synthetic，`demo:` 前缀），默认关闭 |

**开发前必须先做**：重新检索 ODPT / 各运营商开放数据目录（梅田四家：JR 西日本、Osaka Metro、阪急、阪神），把检索日期、查询词、结果写进 `SOURCES.md` 与 `REPORT`；Astra 的"0 命中"只是 2026-11-21/22 的一次结果。**在用户回答"哪些数据允许本地使用"之前，只做 Demo Fixture 和接口，不抓取任何运营商官网时刻表。**

### 9.4 `TrainInstance`（模拟输出）

```ts
export interface TrainInstance {
  id: string; planId: string
  platformId: string; trackPathId: string
  lineId: string | null
  serviceClass: string | null; destinationText: string | null   // 原文，缺失为 null
  phase: TrainPhase; position: [number, number, number]; heading: [number, number, number]
  doorsOpen: boolean
  scheduledArrival: string | null; scheduledDeparture: string | null  // 'HH:MM'
  arrivalAssumed: boolean; shortStopAssumed: boolean           // 显示假定，卡片必须标注
  vehicle: { seriesId: string | null; status: 'verified'|'representative'|'unknown'; cars: number | null; livery: VehicleSeries['livery'] | null }
  liveState: 'scheduled'                                       // 目前唯一取值；其余保留给实时源
  feedKind: 'timetable-sim' | 'demo'
}
```

### 9.5 Provider 接口

保留 `src/providers/service.ts` 的 `ServiceProvider / ServiceFeed`（`unavailable | example | live`）。新增 `src/providers/timetable.ts`：`load(): Promise<{mode: FeedMode; issues: TimetableIssue[]}>`。校验有 `error` 的记录**不进入模拟**（warning 仅提示）。

## 10. UI 状态契约

```ts
export type SelectionKind = 'station'|'platform'|'gate'|'entrance'|'passage'|'vertical'|'concourse'|'line'|'train'
export interface SelectionTarget { kind: SelectionKind; id: string }   // id 为 sk:… ；train 为 TrainInstance.id
export interface ViewState {
  siteId: string | null; floor: number | null; spread: boolean; shell: boolean
  mode: '3d' | '2d'; detail: 'guide'|'facility'|'structure'; eye: string | null
  lang: 'ja'|'en'; dark: boolean
}
export interface UiState {
  selection: SelectionTarget | null; hover: SelectionTarget | null
  route: { from: string | null; to: string | null; stepFreeOnly: boolean; step: number }
  panel: 'search'|'route'|'trains'|'info'
  feed: FeedMode['kind']
}
```

**URL 序列化**（`src/state/url.ts`，纯函数，可单测，往返恒等）：`?site=&floor=&mode=&detail=&sel=<kind>:<id>&from=&to=&sf=1&step=&lang=&theme=&feed=`。未知参数忽略；非法值回退默认；`feed=demo` 必须带明显横幅。

## 11. 需要补的数据与现实取舍（给 Sol 的"数据缺口表"）

| 数据 | 状态 | 做法 | 没有时 UI 显示 |
|---|---|---|---|
| 线路识别色 | 全空 | 找公开可引用来源，登记后填 | 中性徽章 + 线名 |
| 站台方向/行先 | 全空 | 从官方站台页与构内图录入（`manual-verified`） | 「方面：未確認」 |
| 相邻站 | 全空 | 同上 | 未確認 |
| 出口编号/地面位置 | 仅 4 个 Entrance | 市图 A–G 涉及出口逐个核对后补 | 未確認 |
| 检票口无障碍细节（宽幅等） | 无 | 仅在来源明确时录入 | 未確認 |
| 距离/时间 | 无 | 不做 | 「未測定」 |
| 时刻表 | 无 | §9.3 流程 | 「データなし」/ Demo（需显式开启） |
| 车型/编组 | 无 | 来源核实后才登记，否则 unknown | 「車種未確認」 |
| 设施稼働（电梯是否在运行） | 无 | 无实时源 | 「稼働状況：未確認」 |
