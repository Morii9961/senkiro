# DECISIONS — SENKIRO Lab · Tokyo Atlas & Fare

本文件记录 `labs/a-tokyo-atlas-fare/` 的关键架构与数据决策（决定 / 备选 / 理由）。

---

## D-01：主网络数据源选择与 ODbL 物理隔离
- **决定**：核心网络数据（`data/processed/atlas.json`）仅使用非 share-alike 的开放数据与人工核实事实数据：**国土数値情報 鉄道データ N02-24（公共データ利用規約 1.0 / CC BY 4.0 互換）** + **ODPT 公開都営 GTFS（CC BY 4.0，免密钥）** + **人工核实官方元数据**。OpenStreetMap（Overpass API，ODbL 1.0，share-alike）派生的纵断属性单独存放于 `data/processed/osm-vertical.json`，且在前端构建中通过动态 `import()` 独立拆包，仅在用户开启「立体ビュー (3D)」时按需加载。
- **备选**：直接以 OSM 作为唯一底图与铁路几何主数据源，将所有字段合入单一 `atlas.json`。
- **理由**：OSM 受 ODbL 1.0 share-alike 条款约束，若混入主数据库会导致未来 SENKIRO 的专有增强数据或商业化图层面临衍生库开源传染风险。分离文件 + 独立拆包满足合规要求且可随时替换为非 ODbL 纵断来源。

## D-02：共享契约 `TrackSegment` 纵断字段扩展（Should #21）
- **决定**：在 `src/domain/types.ts` 中为 `TrackSegment` 定义可选扩展字段 `verticalClass`（`'elevated' | 'at_grade' | 'underground' | 'unknown'`）、`verticalOrder`（`number | null`）、`elevationM`（`number | null`）与 `verticalProvenance`，并以独立实体 `TrackVerticalAttribute` 存于 `data/processed/osm-vertical.json`，在视图层按 `trackSegmentId` 关联。
- **备选**：把 `verticalClass` 直接硬编码写进 `atlas.json` 的 `TrackSegment` 中。
- **理由**：既符合契约扩展规范，又确保主文件零 ODbL 污染；同时强制执行诚实性规则——未找到官方真实高程/深度资料时 `elevationM` 一律为 `null`，不将 OSM `layer` 猜测为地下/高架或真实米数。

## D-03：运价费率采用「规则验证演示模式（Synthetic）」并保留 Provider 扩展接口
- **决定**：定义纯 TypeScript 接口 `FareTariffProvider`（`src/domain/fareTariff.ts`），默认注入 `SyntheticDemoTariffProvider`（`isSynthetic: true`，在数据、代码、UI 三处醒目标注「示例数据，不可作为实际购票金额」），另提供 `MissingTariffProvider` 用于测试缺费率拒算。
- **备选**：从非官方博客爬取或硬编码全距离段 JR 票价表并作为官方现价展示。
- **理由**：2026年3月14日 JR 东日本实施大规模运价改定且跨社（JR 东日本＋JR 东海）采用通算加算方式，在无授权 API 情况下无法保证全距离段及跨社票价表的实时合法再分发。采用诚实的合成费率可完整验证所有法律规则、路径选择与状态码，同时未来只需替换 `FareTariffProvider` 即可接入駅すぱあと或官方授权数据源。

## D-04：三图分离（TrackGraph / ServiceGraph / FareRuleGraph）
- **决定**：在 `src/domain/graphs.ts` 中将物理轨道拓扑（`TrackGraph`）、运营服务与直通关系（`ServiceGraph`）、JR 计费规则图（`FareRuleGraph`）明确拆分为三个独立类，共享同一套 `sk:` 实体 ID。
- **备选**：在单一邻接表上加权跑最短路。
- **理由**：真实日本铁路中，山手线环状运行跨越了正式的 `山手線` + `東海道本線` + `東北本線`；千代田线直通 JR 常磐缓行与小田急但轨道所有权在绫濑/代代木上原分离；而计费路径又受第69条特定区間、第157条第2项近郊区間、第16条の2幹在同一視支配。三图分离避免了概念混杂，直接可复用至 SENKIRO 主工程。

## D-05：JR 运价切片与规则双版本（2026-03-14 改定前后）
- **决定**：自选 JR 切片覆盖东京 23 区核心环线（山手/中央/总武/赤羽/东北/东海道）、三条第69条迂回支线（尾久、埼京戸田公園、横须贺西大井）、东北新干线（东京—大宫）、跨社东海道新干线与东海道本线（东京—热海—三岛，JR 东海）、地方交通线（八高线 八王子—拝島，用于验证換算キロ拒算 `UNSUPPORTED`）、以及切片外常磐线（日暮里—金町，用于验证切片外拒算 `UNSUPPORTED`）。规则引擎按 `travelDate` 切换 `jr-fare-v2025`（`2020-04-01`..`2026-03-13`）与 `jr-fare-v2026`（`2026-03-14`..`2027-03-31`），超期返回 `STALE_RULE`。
- **备选**：仅实现单一时间版本或只做山手线内简单距离计算。
- **理由**：2026-03-14 改定使「东京—热海」东海道新干线与在来线由同一线路变为**别线扱い**，而东北新干线（东京—大宫）维持同一线路。双版本实现最直观地验证了规则版本化与条件谓词的价值。

## D-06：IC 卡（Suica 等）显式返回 `UNSUPPORTED`
- **决定**：在 UI 与领域引擎中保留 `ticketType: 'ic_card'` 选项，但执行时显式返回 `UNSUPPORTED`（不输出精确金额），并说明 IC 卡 1 円单位运价与自动检票机最短路径/大回り限制差异。
- **备选**：直接复用纸质普通乘车券规则计算 IC 票价。
- **理由**：IC 卡在大都市近郊区間内并不支持纸券式的任意大回り乘车且采用 1 円单位费率，直接套用纸券规则属于规则错误，违反诚实性要求。

## D-07：无密钥 ODPT 策略与诚实实时槽位
- **决定**：仓库根目录无 `.env.local` / `ODPT_CONSUMER_KEY`，静态对齐使用免密钥公开端点 `api-public.odpt.org` 的都营交通 GTFS（CC BY 4.0）；实时运行信息通过 `OdptRealtimeProvider` 适配器显式返回 `status: 'unavailable'`（「無実時データ」），绝不模拟列车位置。
- **备选**：使用前端动画模拟列车移动。
- **理由**：严格遵守共享契约第 1.6 条与第 6 条。

## D-08：底图与 Playwright 端口
- **决定**：采用免密钥、CC BY 4.0 互換的国土地理院「地理院タイル（淡色地図）」，离线时自动降级为纯色底图背景（MapLibre `background` 层）；Playwright `webServer` 端口选用 `18473`。
- **备选**：MapTiler/Mapbox（需密钥）或默认 `4173` 端口。
- **理由**：避免引入任何 API 密钥；实测 Windows 11 环境中 `4173` 落入系统保留端口区间导致 `EACCES`，改用 `18473` 后可稳定在本地与沙盒内完成全部端到端测试。

## D-09：升级独立 Three.js 3D 都市铁路生成系统与 2km 空间分块流式 LOD
- **决定**：将 3D 视图升级为独立 Three.js 程序化建模引擎（`src/three/` + `src/domain/elevationSolver.ts`），与 2D MapLibre 视图共享同一套 `AtlasDataset`、经纬度投影原点与交互状态；东京 23 区真实 OSM 建筑、道路与河川水域经流式脚本构建为 `public/data/urban-chunks/`（130 个 `2km×2km` 独立 ODbL 空间分块），实现近景轮廓挤出+退台合批（LOD0）与中远景有向包围盒 `InstancedMesh`（LOD1）+ 视锥剔除。
- **备选**：继续在 MapLibre 2.5D 中做平面折线拉伸，或导入外部成品城市 3D Tiles。
- **理由**：MapLibre 2.5D 无法表现真实地下空间、隧道纵断穿行、多层级地下换乘井与水平剖切平面，且不得通过导入现成整城模型规避自研程序化建模；纯自研 Three.js 分块+LOD 引擎满足城市尺度探索、地下透视与跨城（大阪/名古屋）迁移要求。

## D-10：示意垂向高度层级与交叉净空自动避碰
- **决定**：在 `src/domain/elevationSolver.ts` 中建立 `L+2 (+20)` 至 `L-4 (-40)` 示意相对高度体系，每条区段显式标记 `heightBasis`（`manual-verified-relative` / `osm-derived-schematic` / `inferred-schematic`），对重点枢纽（涩谷银座线 3F `+14`、新宿深层大江户线 `-38`、东京/大手町多层交错）录入已核实相对上下关系，并对所有非共站二维交叉自动施加端点归零的高斯净空避碰（`≥ 6.5` 单位）。
- **备选**：仅按 OSM `layer` 或单一固定深度放置所有地铁线。
- **理由**：确保空间结构自洽、相邻区间 $C^0$ 连续且无地下交叉穿模，同时绝不把推断高度伪装为官方实测深度。

## D-11：P0 地表与建筑严格不透明通道 + Logarithmic Depth Buffer
- **决定**：在普通地表模式下将全部地表层与建筑材质设为 `transparent: false, depthWrite: true`，同时在 `WebGLRenderer` 启用 `logarithmicDepthBuffer: true`、分层高程与 `polygonOffset` 梯度、以及 LOD0 切换滞回带（`2050m/2600m`）。
- **备选**：关闭地表 `depthTest` 或维持建筑半透明材质。
- **理由**：关闭深度测试会导致严重前后遮挡错乱；此前建筑与地表默认 `transparent: true` 是引发旋转闪烁与摩天楼透穿的直接根源，切换至严格不透明通道彻底根治闪烁且不牺牲深度排序正确性。

## D-12：P1/P2 真实 OSM 街区补全诚实标识与纯代码 PBR 立面库
- **决定**：扩充真实 OSM 次干道/支路、土地利用街区与品川/池袋建筑轮廓（真实 OSM 建筑升至 38,050 栋），并在 OSM 缺漏高度标签的居住/商业地块沿真实路网方向程序化补全 10,646 栋低中层街区建筑，统一标为 `hb="p"` 并严格避让道路、水体、东京湾、皇居/公园与铁路走廊；同时以 `facadeLibrary.ts` 生成 6 类 PBR 程序化立面与独立平屋顶网格。
- **备选**：仅渲染稀疏的高层 OSM 建筑（导致大片灰地），或导入外部整城三维模型。
- **理由**：在零外部成品模型、严守数据诚实性的前提下，消除了大面积无结构灰色空地并显著提升半写实建筑层次。

## D-13：P4/P7 3 级铁路距离 LOD、站台 InstancedMesh 批处理与懒加载 LOD0 回收
- **决定**：将 300+ 独立站台 Mesh 合并为 4 个 `InstancedMesh`（支持原生 `instanceId` 拾取）；建立 Near/Mid/Far 3 级铁路 LOD（远景切为全城轻量骨架带，非地下模式剔除被遮挡的地下轨道/隧道）；建筑分块采用按需懒构建 LOD0 + 超出 `5.8km` 自动回收显存。
- **备选**：始终全量渲染 32k 枕木、全部四轨钢轨与 300+ 独立站台。
- **理由**：实测基线全景高达 `3.49M` 三角形与 `644` Draw Call；优化后全景三角形骤降 **88%**、Draw Call 骤降 **80%**，同时极大改善中远景全东京路网可读性。

## D-14：P5 GPU 世界空间径向开削地下探索与 P6 双模式空间相机
- **决定**：以 `onBeforeCompile` 世界空间径向开削替代全城建筑半透明糊墙，配合地质剖面井壁、地标锚点与视觉专用竖向夸张；以独立 `SpatialCameraController` 统一「地图浏览（中键/右键自由地面平移 + 双击焦点）」与「自由探索（WASD + 视角 + Q/E 飞行）」。
- **备选**：保留整城 16% 透明灰楼，或仅保留默认 `OrbitControls`。
- **理由**：径向开削彻底解决了地下多层地铁与地表灰色建筑重影混淆的问题；中键连续平移与自由探索模式打破了固定目标点旋转的束缚，显著提升城市尺度浏览体验。


