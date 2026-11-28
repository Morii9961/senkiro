# SENKIRO 全域领域契约规范 v1.0（Domain Contract v1.0）

> **文档版本**：`v1.0` · 2026-11-28  
> **适用范围**：SENKIRO 主线 Monorepo（`packages/*`、`apps/*`）及后续全部 Phase 0–6 开发  
> **前序基准**：升级并取代原型阶段契约 [00-shared-contract.md](./00-shared-contract.md)；与 [plan-v1.0.md](./plan-v1.0.md) 保持 100% 一致。  
> **权威实现包**：`@senkiro/contracts`（`packages/contracts`）。所有跨包类型、ID 校验、三语回退与诚实性守卫均以本规范为准。

---

## 1. 不可妥协的诚实性与开源铁律（Hard Invariants）

1. **禁止编造任何铁路事实**：不得编造站点、线路、站号、番线、出入口、营业キロ、票价、时刻、列车位置、车型编组或法规条文。未知字段一律写 `null`，前端通过 `<UnknownValue />` 等显式组件诚实呈现「未知 / 未核实」。
2. **每条可见实体必可溯源**：所有业务实体均携带 `provenance: Provenance`（`sourceIds[]`、`dataNature`、`lastVerifiedAt`），且每条 `sourceId` 均可在 `SourceRecord` 注册表中查到发布方、URL、获取日期与许可矩阵（`commercialUse`、`redistribution`、`shareAlike`）。
3. **非 `OK` 运价金额恒为 `null`**：`FareQuote.status` 为 `NOT_APPLICABLE | MISSING_DATA | UNSUPPORTED | STALE_RULE | ERROR` 之一时，`totalAmountYen` 必须为 `null`，严禁输出估算或部分拼接的精确日元金额；`breakdown` 必须为空数组 `[]`。
4. **合成与推算数据醒目标注**：`dataNature === 'synthetic'` 或时刻表精度为 `frequency` / `demo_synthetic` 时，数据层、领域层与 UI 层必须三处同步标明，不可误认为官方实时或逐班精确数据。
5. **数字纪念车票防伪冒硬锁**：`CommemorativeTicket` 仅限非有效收藏卡，渲染器必须强制绘制 `SAMPLE · 記念用 · 乗車不可` 水印（受代码与单测硬守卫保护），**严禁生成任何可被设备识别的 QR 码、一维条码或磁条编码**。
6. **四维个人足迹防误计原则**：
   - 坐过线路部分区段（`RideSegment`）绝不计为 100% 完乘；完乘度严格按已乘 `TrackSegment` 实际覆盖计算。
   - 列车经过但未实际上下车或换乘的站（`visitKind: 'passed_through'`）绝不计入 `VisitedStation` 到访统计，亦不触发 `MunicipalityVisit` 行政区点亮。
7. **ODbL Share-Alike 物理隔离**：源于 OpenStreetMap（ODbL 1.0，`shareAlike: true`）的数据（如 `TrackVerticalAttribute`、`urban-chunks` 建筑分块）必须存于物理独立文件/数据集，仅通过稳定的 `SkId` 在视图或展示层按需关联，严禁污染 CC BY / 商业主数据集。

---

## 2. 一级多语言规范（`zh-CN / ja / en`）

自 Phase 0 起确立 **简体中文 / 日语 / 英语** 三语一级标准（决策 D-05）：

```ts
export type Locale = 'zh-CN' | 'ja' | 'en';

export interface LocalizedNames {
  ja: string | null;
  ja_kana: string | null;
  en: string | null;
  zh: string | null; // 简体中文；未核实译名必须保持 null，绝不机翻编造
}

export interface ResolvedLocalizedName {
  text: string;
  resolvedLocale: Locale | 'unknown';
  isFallback: boolean;
}
```

### 纯函数 `resolveLocalizedName(names: LocalizedNames, preferred: Locale)` 回退规则
1. 若 `preferred === 'zh-CN'`：优先 `names.zh` → 回退 `names.ja`（`isFallback: true`）→ 再回退 `names.en`（`isFallback: true`）。
2. 若 `preferred === 'ja'`：优先 `names.ja` → 回退 `names.en`（`isFallback: true`）→ 再回退 `names.zh`（`isFallback: true`）。
3. 若 `preferred === 'en'`：优先 `names.en` → 回退 `names.ja`（`isFallback: true`）→ 再回退 `names.zh`（`isFallback: true`）。
4. 若全部为 `null` 或空白字符串，返回 `{ text: '—', resolvedLocale: 'unknown', isFallback: true }`（UI 层结合具体语种展示未知文案）。

---

## 3. 全局稳定实体 ID 规范（`SkId`）

### 3.1 标准四段式格式

正式主线统一采用四段式小写 slug：

```text
sk:<entity>:<scope>:<slug>
```

- **`<entity>`（`EntityIdPrefix`）**：
  `operator | line | segment | station | complex | interchange | level | place | gate | link | service | trip | stoptime | through | rule | product | quote | pass | vehicle | ride | ticket | municipality | source`
- **`<scope>`**：小写字母/数字/连字符（`^[a-z0-9-]+$`），表示所属区域、运营商或枢纽作用域。常用示例：
  - 运营商级/全局：`jp`、`jr-west`、`jr-east`、`hankyu`、`keihan`、`osaka-metro`、`toei`
  - 区域级：`kansai`、`kanto`、`chubu`
  - 枢纽级：`umeda`、`kyoto`、`shinjuku`、`tokyo`、`namba`
- **`<slug>`**：小写字母/数字/连字符（`^[a-z0-9-]+$`），在 `<entity>:<scope>` 内全局唯一。

**标准示例**：
- `sk:operator:jp:jr-west`
- `sk:line:kansai:jr-west-kyoto`
- `sk:station:kansai:jr-west-osaka`
- `sk:station:kansai:hankyu-osaka-umeda`
- `sk:complex:kansai:osaka-umeda`
- `sk:complex:kansai:kyoto`
- `sk:place:umeda:jr-osaka-1f-midosuji-gate`
- `sk:station:kanto:jr-east-shinjuku`
- `sk:vehicle:kansai:jr-west-223-2000`
- `sk:source:jp:mlit-ksj-n02-24`

### 3.2 正则与 Lab 历史三段式兼容

- 正式校验正则：`^sk:(operator|line|segment|station|complex|interchange|level|place|gate|link|service|trip|stoptime|through|rule|product|quote|pass|vehicle|ride|ticket|municipality|source):[a-z0-9-]+:[a-z0-9-]+$`
- **向后兼容辅助器**：`packages/contracts` 提供 `parseLegacyLabId(rawId, defaultScope, options?)`，用于从 Lab A/B/C 三段式 ID（`sk:<type>:<slug>`）平滑规范化迁移至 v1.0 四段式，新写入主库与 SQLite 的数据一律只允许 v1.0 四段式 `SkId`：
  - **无歧义别名映射（`LEGACY_ENTITY_ALIASES`）**：`platform | concourse | landing | entrance | area` → `place`；`vertical | elevator | escalator | stairs` → `link`。
  - **歧义或非实体前缀拒绝自动猜测**：`passage`（在不同 Lab 中有时表示区域 `place`、有时表示连接 `link`）、`physical_track`、`direction`、`context`、`update`、`block` 必须由调用方显式传入 `options.entity`，否则抛 `SkIdError`。
  - **严格保留原大小写**：不静默将 slug 转小写或改写标点，防止误合并不同原型实体（校验仍要求 `[a-z0-9-]+`）。

---

## 4. 通用基础字段（`BaseEntity` 与 `SourceRecord`）

```ts
export type DataNature =
  | 'official'
  | 'licensed-third-party'
  | 'derived'
  | 'manual-verified'
  | 'synthetic'
  | 'unknown';

export type LicensePermission = 'yes' | 'no' | 'conditional' | 'unknown';

export interface SourceRecord {
  id: SkId<'source'> | string;
  title: string;
  publisher: string;
  url: string | null;
  retrievedAt: string;           // ISO-8601 date
  sourceDate: string | null;     // 原件印制或发布日期
  license: string;
  licenseUrl: string | null;
  commercialUse: LicensePermission;
  redistribution: LicensePermission;
  shareAlike: boolean | 'unknown';
  attributionText: string;
  notes: string;
}

export interface Provenance {
  sourceIds: string[];
  dataNature: DataNature;
  lastVerifiedAt: string | null; // ISO-8601 date
  note?: string;
}

export interface BaseEntity<T extends EntityIdPrefix = EntityIdPrefix> {
  id: SkId<T>;
  externalIds: Record<string, string>; // 如 { odpt: "...", ksj: "...", osm: "..." }
  names: LocalizedNames;
  provenance: Provenance;
  validFrom: string | null;      // 业务生效日期，未知填 null
  validTo: string | null;        // 业务失效日期，现行未知填 null
}
```

---

## 5. 五张严格分离但同源对齐的领域图

### 5.1 图 1 · 轨道拓扑图（`TrackGraph`）

表示物理线路、运营商归属、实体区段几何与复合换乘群：

- **`Operator`**：`category: 'jr' | 'metro' | 'toei' | 'private' | 'third_sector' | 'monorail' | 'tram'`、`brandColor: string`、`coverageStatus: 'full' | 'partial' | 'none'`、`coverageNotes: string`。
- **`RailLine`**：`operatorId: SkId<'operator'>`、`color: string`、`stationCodePrefix: string | null`、`lineClass: 'shinkansen' | 'trunk' | 'local_line' | 'metro' | 'private' | 'unknown'`、`stationIds: SkId<'station'>[]`、`coverageStatus`。
- **`TrackSegment`**：`fromStationId`、`toStationId`、`railLineIds[]`、`operatorId`、`geometry: [number, number][]`（`[lon, lat]`）、`operatingKm: number | null`、`distanceNature: DataNature`、`lineClass`、`isShinkansen: boolean`、`parallelConventionalLineId: SkId<'line'> | null`、`fareZoneTags: string[]`（替代旧东京布尔字段，例如 `'suburban:tokyo'`、`'suburban:osaka'`、`'tariff:keihanshin'`）。
- **`TrackVerticalAttribute`**（ODbL 物理隔离附加层）：`trackSegmentId: SkId<'segment'>`、`verticalClass: 'elevated' | 'at_grade' | 'underground' | 'unknown'`、`verticalOrder: number | null`、`elevationM: number | null`、`provenance`。
- **`Station`**：`operatorId`、`railLineIds[]`、`stationComplexId: SkId<'complex'> | null`、`stationCode: string | null`、`coordinates: [number, number]`、`municipalityCode: string | null`、`wardOrCity: string | null`、`fareZoneTags: string[]`。
- **`StationComplex`**：`stationIds: SkId<'station'>[]`、`coordinates: [number, number]`、`wardOrCity: string | null`、`explicitlyExcluded: Array<{ name: string; stationId?: SkId<'station'>; reason: string }>`（防止如「JR 京都 vs 河原町」「新宿 vs 西武新宿」误合并）。
- **`Interchange`**：`fromStationId`、`toStationId`、`stationComplexId`、`gateType: 'in_gate' | 'out_of_gate' | 'unknown'`、`walkingMinutes: number | null`、`stepFree: boolean | null`、`notes: string | null`。

### 5.2 图 2 · 车站室内三维空间图（`StationGraph`）

融合 Lab B（梅田命令式合批）与 Lab C（新宿 10 层与 2D 横向分栏）的统一枢纽模型，驱动 `<StationExplorer />` 与 2D/3D 无台阶寻路：

- **置信度与付费区词表**：
  - `GeometryConfidence = 'verified' | 'schematic' | 'unknown'`
  - `ExistenceConfidence = 'verified' | 'unverified'`
  - `ConnectionConfidence = 'verified' | 'inferred'`
  - `StepFree = boolean | null`
  - `FareZone = 'unpaid' | 'roadway' | \`paid:${string}\``（如 `'paid:jr-west'`、`'paid:osaka-metro'`）
  - `PlanPoint = { x: number; z: number }`、`PlanRect = { x0: number; z0: number; x1: number; z1: number }`
- **`StationLevel`**（`BaseEntity<'level'>`）：`complexId: SkId<'complex'>`、`stationId: SkId<'station'> | null`、`operatorId: SkId<'operator'> | null`、`label: string`（如 `"B1F"`）、`ordinal: number`（全站唯一垂直基准）、`elevation: number`、`elevationNote: string`。
- **`StationPlace`**（`BaseEntity<'place'>`）：`complexId`、`levelId: SkId<'level'>`、`stationId: SkId<'station'> | null`、`kind: 'platform' | 'concourse' | 'passage' | 'entrance' | 'landing'`、`fareZone: FareZone`、`manager: 'railway' | 'commercial' | 'public-road' | 'unknown' | null`、`footprint: PlanRect[]`、`anchor: PlanPoint`、`existence: ExistenceConfidence`、`geometryConfidence: GeometryConfidence`、`asOf: string | null`、`tracks?: PlatformTrack[]`、`terminus?: SourcedFact<{ end: 'x-' | 'x+' | 'z-' | 'z+' }>`、`leadsTo?: LocalizedNames`。
  - `PlatformTrack`：`number: string`、`services: Array<{ railLineId: SkId<'line'>; towards: LocalizedNames }>`、`side?: 'z-' | 'z+' | 'x-' | 'x+' | null`、`platformDoors?: SourcedFact<{ status: 'installed' | 'planned' | 'none'; since: string | null }>`。
- **`StationLink`**（`BaseEntity<'link'>`）：`complexId`、`kind: 'passage' | 'gate' | 'stairs' | 'escalator' | 'elevator'`、`fromPlaceId: SkId<'place'>`、`toPlaceId: SkId<'place'>`、`direction: 'both' | 'forward' | 'unknown'`、`connection: ConnectionConfidence`、`stepFree: StepFree`、`hasSteps: boolean | null`、`gateKind?: 'ticket' | 'transfer'`、`position?: PlanPoint`、`hoursNote?: string | null`、`declaredSpan?: [SkId<'level'>, SkId<'level'>] | null`。
- **`StationExternalLink`**：`{ kind: 'official_floor_map' | 'official_timetable' | 'operator_info' | 'accessibility_info' | 'other'; label: LocalizedNames; url: string; operatorId: SkId<'operator'> | null; stationId: SkId<'station'> | null; sourceId: string | null }`（只指向官方页面外链，不复制原文内容）。
- **`StationHubDataset`**：打包导出某枢纽的完整自包含数据结构：`{ complex, operators, lines, stations, levels, places, links, externalLinks?: StationExternalLink[], sources, disclaimer: LocalizedNames }`。
- **寻路策略与结果（`StationRouteQuery / StationRouteResult`）**：
  - `StationRouteQuery`：`{ complexId, fromPlaceId, toPlaceId, mode: 'standard' | 'step_free', allowInferred?: boolean }`。
  - `StationRouteStep`：`{ index, linkId, kind, fromPlaceId, toPlaceId, fromLevelId, toLevelId, stepFree, connection }`。
  - `StationRouteFound`：`{ reachable: true, mode, steps: StationRouteStep[], levelSequence: SkId<'level'>[], gatePasses, levelChanges, inferredLinkCount, unconfirmedStepFreeCount, distanceMeters: number | null, durationMinutes: number | null }`（尚无实测距离与耗时来源前，`distanceMeters` 与 `durationMinutes` 恒为 `null`）。
  - `StationRouteNotFound`：`{ reachable: false, mode, reason: 'unknown-place' | 'unreachable' | 'step-free-unavailable', detail: string, steps: [] }`，绝不穿过 `'roadway'` 或未核实的跨社闸内连接。

### 5.3 图 3 · 运营服务图（`ServiceGraph`）

- **`ServicePattern`**（`BaseEntity<'service'>`）：`operatorId`、`railLineIds[]`、`serviceCategory: string`（如 `新快速`、`特急`、`普通`）、`stopStationIds[]`、`throughServiceId: SkId<'through'> | null`。
- **`Trip`**（`BaseEntity<'trip'>`）：`servicePatternId`、`trainNumber: string | null`（严禁内部 `tripId` 冒充正式列车番号）、`direction`、`calendarId: string`、`vehicleSeriesId?: SkId<'vehicle'> | null`、`schedulePrecision: 'timetable' | 'frequency' | 'demo_synthetic'`。
- **`StopTime`**（`BaseEntity<'stoptime'>`）：`tripId`、`stationId`、`sequence: number`、`arrivalTime: string | null`（支持跨日 `24:35`）、`departureTime: string | null`、`platformNumber: string | null`。
- **`ThroughService`**（`BaseEntity<'through'>`）：`boundaryStationId`、`fromRailLineId`、`toRailLineId`、`operatorIds[]`、`serviceDescription`、`notes`。
- **`OperationalStatus`**（`R-07` 诚实降级结构）：`lineId`、`status: 'normal' | 'delayed' | 'suspended' | 'unavailable'`、`message: LocalizedNames | null`、`observedAt: string | null`、`sourceId: string | null`、`dataNature: DataNature`。无授权数据源时固定返回 `'unavailable'`。

### 5.4 图 4 · 运价与通票规则图（`FarePassGraph`）

- **`FareRule`**（`BaseEntity<'rule'>`）：`ruleId`、`operatorScope`（如 `'jr-west'`、`'jr-east'`、`'kansai-private'`）、`articleRef`、`officialUrl`、`category`（`'base_fare' | 'specific_section' | 'suburban_area' | 'shinkansen_equivalence' | 'local_line_conversion' | 'cross_company' | 'surcharge' | 'pass'`）、`summary`、`preconditions[]`、`exceptions[]`。
- **`TicketType`**：`'ordinary_paper' | 'ic_card'`。
- **`SurchargeType`**：`'none' | 'limited_express_non_reserved' | 'limited_express_reserved' | 'green_car' | 'gran_class' | 'privace' | 'premium_car' | 'kintetsu_limited_express' | 'hinotori'`。
- **6 态结果与可辨识联合（`FareQuote = PricedFareQuote | UnpricedFareQuote`）**：
  - `PricedFareQuote`：`status: 'OK'`、`totalAmountYen: number`、`breakdown: FareBreakdownItem[]`（非空且各明细求和等于 `totalAmountYen`）；
  - `UnpricedFareQuote`：`status: 'NOT_APPLICABLE' | 'MISSING_DATA' | 'UNSUPPORTED' | 'STALE_RULE' | 'ERROR'`、`totalAmountYen: null`、`breakdown: []`（编译期与运行时双锁，可通过 `createUnpricedFareQuote()` 与 `assertHonestFareQuote(draft)` 校验）；
  - 未校验草稿使用 `FareQuoteDraft`；公共字段含 `actualPath: ResolvedPath | null`、`billedPath: ResolvedPath | null`、`pathsDiffer: boolean`、`pathDiffSummary: string | null`、`explanation: FareExplanationStep[]`、`ruleVersionUsed: string | null`、`isSyntheticTariff: boolean`、`tariffDisclaimer: string | null`。
  - `ResolvedPath` 以 `commonFareZoneTags: string[]` 替代旧东京布尔字段；`FareQuoteRequest.routePreference` 为 `'shortest' | 'shinkansen' | \`pack:${string}\``，禁止在核心契约硬编码地域旁路名。
- **区域插件化接口**：
  - `TariffProvider`：`{ id, operatorScope, ruleVersion, validFrom, validTo, isSynthetic, disclaimer, lookupBaseFare(input: TariffLookupInput): TariffLookupResult }`（返回 `{ status: 'OK', amountYen, ruleId } | { status: UnpricedFareQuoteStatus, amountYen: null, reason }`）。
  - `RegionalFareRulePack`：`{ id, region, operatorScopes, ruleVersion, validFrom, validTo, rules, fareZoneTags, tariffProviders, appliesTo(context: FareRulePackContext): boolean, evaluate(context: FareRulePackContext): FareRulePackOutcome }`（按区域/运营商挂载近郊区间、第69条、特定运賃与座席附加规则，彻底消除引擎内的地域硬编码）。
- **`PassProduct` & `PassEligibility`**（`BaseEntity<'pass'>`）：`issuerOperatorId`、`validityDays`、`coveredSegmentIds` / `coveredLineIds`、`excludedTrainCategories[]`（如 Nozomi/Mizuho 限制）、`requiresSupplementFor[]`、`officialPriceYen: number | null`、`rulesSummary`。

### 5.5 图 5 · 个人旅程与同构同步图（`JourneyGraph`）

服务于 `packages/local-db`（同构 SQLite）与 `packages/journey-store`（Phase 3+）：

- **`RideRecord`**（`BaseEntity<'ride'>`）：`travelDate: string`、`originStationId: SkId<'station'>`、`destinationStationId: SkId<'station'>`、`segmentIds: SkId<'segment'>[]`、`lineId: SkId<'line'> | null`、`vehicleSeriesId: SkId<'vehicle'> | null`、`trainNumber: string | null`、`farePaidYen: number | null`、`notes: string | null`、`createdAt: string`、`updatedAt: string`。
- **`RideSegment`**：`rideId: SkId<'ride'>`、`segmentId: SkId<'segment'>`、`direction: 'forward' | 'reverse' | 'unknown'`、`operatingKm: number | null`。
- **`VisitedStation`**：`rideId: SkId<'ride'>`、`stationId: SkId<'station'>`、`visitKind: 'boarded' | 'alighted' | 'transferred' | 'passed_through'`（**统计到访站数时 SQL `WHERE visit_kind != 'passed_through'`**）。
- **`MunicipalityVisit`**：`municipalityCode: string`、`names: LocalizedNames`、`prefectureCode: string`、`firstVisitedAt: string`、`triggeredByRideId: SkId<'ride'>`（仅由实际上下/换乘站触发）。
- **`VehicleSeries`**（`BaseEntity<'vehicle'>`）：`operatorId`、`seriesCode: string`、`inServicePeriod: string | null`、`carCountOptions: number[]`、`assignedLineIds: SkId<'line'>[]`、`factConfidence: 'verified' | 'representative' | 'unknown'`。
- **`CommemorativeTicket`**（`BaseEntity<'ticket'>`）：`rideId: SkId<'ride'> | null`、`templateId: 'jnr-seiji' | 'showa-b-ticket' | 'kansai-maroon'`、`displayOrigin: LocalizedNames`、`displayDestination: LocalizedNames`、`travelDate: string`、`seatClassLabel: string | null`、`nonValidWatermark: 'SAMPLE · 記念用 · 乗車不可'`（**字面量强制校验**）、`allowsBarcode: false`（**类型级恒定 `false`**）。
- **`SyncOpLogEntry`**（HLC 幂等同步日志表结构）：
  ```ts
  export interface SyncOpLogEntry {
    opId: string;
    hlc: string;                 // Hybrid Logical Clock: <iso_or_ms>-<counter>-<nodeId>
    entityType: 'ride' | 'ride_segment' | 'visited_station' | 'municipality_visit' | 'ticket';
    entityId: string;
    op: 'upsert' | 'delete';
    payloadJson: string | null;  // delete 时可为 null
    syncedAt: string | null;     // 本地未同步为 null
    createdAt: string;
  }
  ```

---

## 6. 全局 URL 深链与模块联动契约（`AppSearchParams`）

由 `TanStack Router` + `Zod` 强类型驱动，保证 Web 与移动端（Expo `"use dom"`）深链一致：

```ts
export type AppRegion = 'kansai' | 'kanto';
export type AppModule = 'atlas' | 'route' | 'tickets' | 'journey' | 'profile';
export type AppTheme = 'light' | 'dark';

export interface AppSearchParams {
  region: AppRegion;               // 默认 'kansai'
  module: AppModule;               // 默认 'atlas'
  station?: SkId<'station'>;
  complex?: SkId<'complex'>;
  line?: SkId<'line'>;
  hub?: 'umeda' | 'kyoto' | 'shinjuku';
  level?: string;                  // 枢纽楼层 ID 或 label
  selection?: string;              // 站内选中的 place/link ID
  from?: string;                   // 换乘起点（站或站内节点）
  to?: string;                     // 换乘终点
  stepFree?: boolean;              // 无台阶模式
  lang: Locale;                    // 默认 'zh-CN'
  theme: AppTheme;                 // 默认 'dark' 或按系统偏好
}
```
