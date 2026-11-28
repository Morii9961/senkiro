# Phase 1 技术规范与关西实体注册表（`SENKIRO Atlas` Spec v1.0）

> **文档版本**：`v1.0` · 2026-11-28（Phase 1 · `P1-Coord` 冻结基准）  
> **适用范围**：`integration/phase-1` 阶段全量并行派单（`P1-S1`、`P1-S2`、`P1-S3`、`P1-W2`）  
> **上游契约**：[docs/01-domain-contract-v1.0.md](./01-domain-contract-v1.0.md)（`@senkiro/contracts` v1.0）与 [docs/plan-v1.0.md](./plan-v1.0.md) §3 Phase 1  
> **执行铁律**：本规范冻结的所有 `SkId`、复合体防误并边界、PMTiles 图层结构、许可隔离矩阵及跨包桥接接口为 Phase 1 三路零冲突并行的唯一共同契约。

---

## 1. 波次推进架构评估与工具链锁定

### 1.1 为何跳过 `P1-W0` 代码前置波次、直接三路并行

经核验 `main@0f7b764` 上的 `@senkiro/contracts`（`DOMAIN_CONTRACT_VERSION = '1.0'`，含 `P0-W2` 上提字段）与 `@senkiro/station-3d`：

1. **五图与诚实性契约已完备**：`TrackGraph`、`TrackVerticalLayer`、`ServiceGraph`、`ThroughService`、`OperationalStatus`（`unavailableOperationalStatus`）、`StationHubDataset`（含 `planNorth`、`StationExternalLink`）及 `assertOdbLIsolation` 已全部导出，无需改动 `packages/contracts/**`。
2. **深链与双向跳转接口已就绪**：`AppSearchParams` 已覆盖 `region`、`module`、`station`、`complex`、`line`、`hub`、`level`、`selection`、`from`、`to`、`stepFree`、`lang`、`theme`（含 `HUB_REGION`）；`<StationExplorer />` 已暴露 `onNavigateExternalLine?: (lineId: SkId<'line'>) => void`。
3. **跨包数据加载走既有 Slot 架构**：`apps/web` 已建立 `ShellSlotsProvider` + `DEFAULT_SHELL_SLOTS` 懒加载注册表模式。`P1-S2` 只需在 `apps/web/src/slots/slots.tsx` 新增 `atlasDataSource` 类型化槽位（仅引用 `@senkiro/contracts` 与本文 §5 约定的 `RegionalAtlasBundle` 纯结构），即可与 `P1-S1`（`@senkiro/data-kansai`）及 `P1-S3`（`@senkiro/data-stations/kyoto`）**零冲突三路同时开工**，最后由 Wave 2（`P1-W2`）完成槽位接线与 Exit Gate 1 验收。

### 1.2 锁定版本与构建工具链边界（全仓必守）

| 工具 / 依赖 | 锁定版本 / 约束 | Phase 1 强制要求 |
| --- | --- | --- |
| **Node.js / pnpm** | `Node >= 24.0.0` · `pnpm@10.33.0` | `pnpm-workspace.yaml` 默认禁止依赖 `postinstall` 脚本；**严禁引入需要原生编译或生命周期脚本的 npm 包**。 |
| **TypeScript** | `^7.0.2`（`tsconfig.base.json`） | `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`verbatimModuleSyntax`、`rewriteRelativeImportExtensions` 全开；相对导入必须带 `.ts` / `.tsx` 扩展名；新包须在 `tsconfig.json` 补齐 `DOM`（仅浏览器包）或 `ES2023` + `types: ["node"]`。 |
| **Biome** | `^2.6.9`（`biome.json`） | `noExplicitAny: error`、`noNonNullAssertion: error`（**禁用 `!` 后缀断言**）、`noConsole: error`、`noForEach: error`、`useBlockStatements: error`、`useImportType` / `useExportType: error`、单引号。 |
| **Vite** | `^8.4.0`（Rolldown） | 生产构建会裁剪无副作用 CSS 导入；`ui-kit` 需显式导出 CSS 子路径并在 `apps/web/src/main.tsx` 导入。 |
| **`maplibre-gl`** | **`^5.4.0`**（仅安装于 `apps/web`） | MapLibre GL JS v5 主线；**必须通过独立动态 chunk 懒加载**，严禁打入入口主块；须显式 `import 'maplibre-gl/dist/maplibre-gl.css'`；在无 WebGL（jsdom / 无头降级）时优雅退回提示而非崩溃。 |
| **`pmtiles`** | **`^4.3.0`**（`data-pipeline`、`data-kansai`、`apps/web`） | Protomaps 纯 ESM 包（零原生脚本）；Web 端通过 `new Protocol()` + `maplibregl.addProtocol('pmtiles', protocol.tile)` 加载静态 `.pmtiles`；构建期通过 `new PMTiles(...)` 回读校验瓦片头与块内容。 |
| **PMTiles v3 离线生成策略** | **纯 Node.js / TS（`geojson-vt ^4.0.2` + 纯 TS MVT v2.1 / PMTiles v3 编码器）** | Windows 本机未安装 `tippecanoe`、`pmtiles` CLI 或 `duckdb`。`packages/data-pipeline` **必须 100% 纯 JS/TS 实现** GeoJSON → `geojson-vt` 切片 → MVT v2.1 Protobuf → gzip + PMTiles v3 单文件归档，确保任何 Windows/CI 环境 `pnpm build && pnpm test` 零外部二进制即可复现。 |

---

## 2. 冻结关西实体与复合体 `SkId` 注册表

所有实体严格遵循 `sk:<entity>:<scope>:<slug>` 四段式小写规范（`packages/contracts/src/ids.ts`）。

### 2.1 八大目标运营商（`scope = 'jp'`）

| 正式 `SkId<'operator'>` | KSJ `N02_004` 原文 | `category` | 日语 / 英语 / 简中 | 品牌识别色（仅作线色/徽章基准） |
| --- | --- | --- | --- | --- |
| `sk:operator:jp:jr-west` | `西日本旅客鉄道` | `'jr'` | `JR西日本` / `JR West` / `JR西日本` | `#0072bc` |
| `sk:operator:jp:jr-central` | `東海旅客鉄道` | `'jr'` | `JR東海` / `JR Central` / `JR东海` | `#f58220` |
| `sk:operator:jp:hankyu` | `阪急電鉄` | `'private'` | `阪急電鉄` / `Hankyu Railway` / `阪急电铁` | `#8b1c42` |
| `sk:operator:jp:keihan` | `京阪電気鉄道` | `'private'` | `京阪電気鉄道` / `Keihan Electric Railway` / `京阪电气铁道` | `#00523c` |
| `sk:operator:jp:kintetsu` | `近畿日本鉄道` | `'private'` | `近畿日本鉄道` / `Kintetsu Railway` / `近铁电铁` | `#b81d24` |
| `sk:operator:jp:hanshin` | `阪神電気鉄道` | `'private'` | `阪神電気鉄道` / `Hanshin Electric Railway` / `阪神电气铁道` | `#1c3f94` |
| `sk:operator:jp:osaka-metro` | `大阪市高速電気軌道` | `'metro'` | `Osaka Metro` / `Osaka Metro` / `大阪地铁` | `#0099d9` |
| `sk:operator:jp:kyoto-subway` | `京都市` | `'metro'` | `京都市営地下鉄` / `Kyoto Municipal Subway` / `京都市营地铁` | `#2b8c4b` |

> **说明**：`umedaHubDataset` 已使用 `sk:operator:jp:jr-west`、`sk:operator:jp:osaka-metro`、`sk:operator:jp:hankyu`、`sk:operator:jp:hanshin`；`P1-S1` 与 `P1-S3` 必须原字复用上述 8 个运营商 ID。

### 2.2 冻结线路 `SkId<'line'>` 注册表（`scope = 'kansai'`）

#### A. 既有梅田数据包已落地线路（19 条 — 必须 100% 原字对齐 `packages/data-stations/src/umeda.ts`）

| `SkId<'line'>` | `operatorId` | 站号前缀 | 对应线路 / 爱称 |
| --- | --- | --- | --- |
| `sk:line:kansai:osaka-metro-midosuji` | `jr` 否 / `osaka-metro` | `M` | 御堂筋線 |
| `sk:line:kansai:osaka-metro-tanimachi` | `osaka-metro` | `T` | 谷町線 |
| `sk:line:kansai:osaka-metro-yotsubashi` | `osaka-metro` | `Y` | 四つ橋線 |
| `sk:line:kansai:hankyu-kyoto` | `hankyu` | `HK` | 阪急京都本線 |
| `sk:line:kansai:hankyu-takarazuka` | `hankyu` | `HK` | 阪急宝塚本線 |
| `sk:line:kansai:hankyu-kobe` | `hankyu` | `HK` | 阪急神戸本線 |
| `sk:line:kansai:hanshin-main` | `hanshin` | `HS` | 阪神本線 |
| `sk:line:kansai:jr-west-tozai` | `jr-west` | `H` | JR東西線 |
| `sk:line:kansai:jr-west-loop` | `jr-west` | `O` | 大阪環状線 |
| `sk:line:kansai:jr-west-kobe` | `jr-west` | `A` | JR神戸線（大阪—神戸—姫路） |
| `sk:line:kansai:jr-west-kyoto` | `jr-west` | `A` | JR京都線（京都—新大阪—大阪） |
| `sk:line:kansai:jr-west-takarazuka` | `jr-west` | `G` | JR宝塚線（福知山線） |
| `sk:line:kansai:jr-west-yumesaki` | `jr-west` | `P` | JRゆめ咲線（桜島線） |
| `sk:line:kansai:jr-west-kansai-airport` | `jr-west` | `S` | 関西空港線 |
| `sk:line:kansai:jr-west-hanwa` | `jr-west` | `R` | 阪和線 |
| `sk:line:kansai:jr-west-yamatoji` | `jr-west` | `Q` | 大和路線（関西本線） |
| `sk:line:kansai:jr-west-bantan` | `jr-west` | `J` | 播但線（或梅田发特急直通指引） |
| `sk:line:kansai:jr-west-tokaido-express` | `jr-west` | `null` | 特急直通系统（サンダーバード/はるか等，作服务标注线） |
| `sk:line:kansai:jr-west-east` | `jr-west` | `F` | おおさか東線 |

#### B. 京阪神核心新增线路（`P1-S1` + `P1-S3` 共同引用）

| `SkId<'line'>` | `operatorId` | 站号前缀 | 对应线路 / 爱称 |
| --- | --- | --- | --- |
| `sk:line:kansai:jr-west-biwako` | `jr-west` | `A` | 琵琶湖線（米原—山科—京都） |
| `sk:line:kansai:jr-west-sagano` | `jr-west` | `E` | 嵯峨野線（山陰本線 京都—園部） |
| `sk:line:kansai:jr-west-nara` | `jr-west` | `D` | 奈良線（京都—宇治—木津） |
| `sk:line:kansai:jr-west-kosei` | `jr-west` | `B` | 湖西線（山科—近江塩津） |
| `sk:line:kansai:jr-west-katamachi` | `jr-west` | `H` | 学研都市線（片町線 京橋—木津） |
| `sk:line:kansai:jr-west-sakurai` | `jr-west` | `U` | 万葉まほろば線（桜井線） |
| `sk:line:kansai:jr-west-wakayama` | `jr-west` | `T` | 和歌山線（王寺—和歌山） |
| `sk:line:kansai:jr-west-sanyo-shinkansen` | `jr-west` | `null` | 山陽新幹線（新大阪—姫路） |
| `sk:line:kansai:jr-central-tokaido-shinkansen` | `jr-central` | `null` | 東海道新幹線（米原—京都—新大阪） |
| `sk:line:kansai:hankyu-senri` | `hankyu` | `HK` | 阪急千里線（天神橋筋六丁目—北千里） |
| `sk:line:kansai:hankyu-arashiyama` | `hankyu` | `HK` | 阪急嵐山線 |
| `sk:line:kansai:hankyu-itami` | `hankyu` | `HK` | 阪急伊丹線 |
| `sk:line:kansai:hankyu-imazu` | `hankyu` | `HK` | 阪急今津線 |
| `sk:line:kansai:hankyu-mino` | `hankyu` | `HK` | 阪急箕面線 |
| `sk:line:kansai:hankyu-koyo` | `hankyu` | `HK` | 阪急甲陽線 |
| `sk:line:kansai:hankyu-kobe-kosoku` | `hankyu` | `HK` | 阪急神戸高速線（神戸三宮—新開地） |
| `sk:line:kansai:keihan-main` | `keihan` | `KH` | 京阪本線（淀屋橋—三条） |
| `sk:line:kansai:keihan-oto` | `keihan` | `KH` | 京阪鴨東線（三条—出町柳） |
| `sk:line:kansai:keihan-nakanoshima` | `keihan` | `KH` | 京阪中之島線（中之島—天満橋） |
| `sk:line:kansai:keihan-uji` | `keihan` | `KH` | 京阪宇治線 |
| `sk:line:kansai:keihan-katano` | `keihan` | `KH` | 京阪交野線 |
| `sk:line:kansai:keihan-keishin` | `keihan` | `OT` | 京阪京津線（御陵—びわ湖浜大津） |
| `sk:line:kansai:keihan-ishiyama-sakamoto` | `keihan` | `OT` | 京阪石山坂本線 |
| `sk:line:kansai:kintetsu-kyoto` | `kintetsu` | `B` | 近鉄京都線（京都—大和西大寺） |
| `sk:line:kansai:kintetsu-nara` | `kintetsu` | `A` | 近鉄奈良線（布施—近鉄奈良） |
| `sk:line:kansai:kintetsu-namba` | `kintetsu` | `A` | 近鉄難波線（大阪難波—大阪上本町） |
| `sk:line:kansai:kintetsu-osaka` | `kintetsu` | `D` | 近鉄大阪線（大阪上本町—名張方面） |
| `sk:line:kansai:kintetsu-kashihara` | `kintetsu` | `B` | 近鉄橿原線 |
| `sk:line:kansai:kintetsu-minamiosaka` | `kintetsu` | `F` | 近鉄南大阪線 |
| `sk:line:kansai:kintetsu-keihanna` | `kintetsu` | `C` | 近鉄けいはんな線 |
| `sk:line:kansai:kintetsu-ikoma` | `kintetsu` | `G` | 近鉄生駒線 |
| `sk:line:kansai:kintetsu-tenri` | `kintetsu` | `H` | 近鉄天理線 |
| `sk:line:kansai:kintetsu-shigi` | `kintetsu` | `J` | 近鉄信貴線 |
| `sk:line:kansai:hanshin-namba` | `hanshin` | `HS` | 阪神なんば線（尼崎—大阪難波） |
| `sk:line:kansai:hanshin-mukogawa` | `hanshin` | `HS` | 阪神武庫川線 |
| `sk:line:kansai:hanshin-kobe-kosoku` | `hanshin` | `HS` | 阪神神戸高速線（元町—西代） |
| `sk:line:kansai:osaka-metro-chuo` | `osaka-metro` | `C` | 中央線 |
| `sk:line:kansai:osaka-metro-sennichimae` | `osaka-metro` | `S` | 千日前線 |
| `sk:line:kansai:osaka-metro-sakaisuji` | `osaka-metro` | `K` | 堺筋線 |
| `sk:line:kansai:osaka-metro-nagahori-tsurumiryokuchi` | `osaka-metro` | `N` | 長堀鶴見緑地線 |
| `sk:line:kansai:osaka-metro-imazatosuji` | `osaka-metro` | `I` | 今里筋線 |
| `sk:line:kansai:osaka-metro-nanko-port-town` | `osaka-metro` | `P` | 南港ポートタウン線（ニュートラム） |
| `sk:line:kansai:kyoto-subway-karasuma` | `kyoto-subway` | `K` | 烏丸線（国際会館—京都—竹田） |
| `sk:line:kansai:kyoto-subway-tozai` | `kyoto-subway` | `T` | 東西線（六地蔵—御陵—太秦天神川） |

> **KSJ N02-24 爱称拆分规则**：KSJ 原始数据中 JR 西日本的 `米原—京都—大阪—神戸` 统记为 `N02_003 = "東海道線"`，`神戸—姫路` 记为 `"山陽線"`。`P1-S1` 管线必须以 `京都駅`（`sk:station:kansai:jr-west-kyoto`）与 `大阪駅`（`sk:station:kansai:jr-west-osaka`）为确定性分割边界，拆分为 `jr-west-biwako`（米原—京都）、`jr-west-kyoto`（京都—大阪）与 `jr-west-kobe`（大阪—神戸—姫路），并在每个 `TrackSegment.externalIds.ksj` 保留原 KSJ 溯源键。

### 2.3 冻结复合体 `SkId<'complex'>` 与防误并红线

#### A. 梅田七站复合体：`sk:complex:kansai:osaka-umeda`（`hub: 'umeda'`，坐标 `[135.49725, 34.70158]`）

**已由 `umedaHubDataset` 冻结的 7 座独立车站实体（必须 100% 沿用）**：
1. `sk:station:kansai:jr-west-osaka`（JR西日本 大阪駅）
2. `sk:station:kansai:osaka-metro-umeda`（Osaka Metro 御堂筋線 梅田駅 `M16`）
3. `sk:station:kansai:hankyu-osaka-umeda`（阪急 大阪梅田駅 `HK-01`）
4. `sk:station:kansai:hanshin-osaka-umeda`（阪神 大阪梅田駅 `HS-01`）
5. `sk:station:kansai:osaka-metro-higashiumeda`（Osaka Metro 谷町線 東梅田駅 `T20`）
6. `sk:station:kansai:jr-west-kitashinchi`（JR西日本 JR東西線 北新地駅 `JR-H44`）
7. `sk:station:kansai:osaka-metro-nishiumeda`（Osaka Metro 四つ橋線 西梅田駅 `Y11`）

- **`explicitlyExcluded`**：`新大阪駅`（`sk:station:kansai:jr-west-shinosaka`，约 3.4 km 北）、`淀屋橋駅`（`sk:station:kansai:keihan-yodoyabashi`，1 站南）、`中津駅`（阪急/Osaka Metro 各独立车站）。

#### B. 京都站四社复合体：`sk:complex:kansai:kyoto`（`hub: 'kyoto'`，坐标 `[135.75876, 34.98562]`，京都市下京区）

**唯一允许纳入 `sk:complex:kansai:kyoto` 的 4 座独立车站实体（`P1-S1` 与 `P1-S3` 必须严格一致）**：

| `SkId<'station'>` | `operatorId` | 日 / 英 / 简中 | KSJ N02-24 编码 & 坐标 |
| --- | --- | --- | --- |
| `sk:station:kansai:jr-west-kyoto` | `sk:operator:jp:jr-west` | `京都駅（JR西日本）` / `Kyoto Station (JR West)` / `京都站（JR西日本）` | `006076,006077,006079` · `[135.76104, 34.98568]` |
| `sk:station:kansai:jr-central-kyoto` | `sk:operator:jp:jr-central` | `京都駅（東海道新幹線）` / `Kyoto Station (Tokaido Shinkansen)` / `京都站（东海道新干线）` | `006083` · `[135.75684, 34.98459]` |
| `sk:station:kansai:kintetsu-kyoto` | `sk:operator:jp:kintetsu` | `京都駅（近鉄）` / `Kyoto Station (Kintetsu)` / `京都站（近铁）` | `006084` · `[135.75684, 34.98459]` |
| `sk:station:kansai:kyoto-subway-kyoto` | `sk:operator:jp:kyoto-subway` | `京都駅（京都市営地下鉄）` / `Kyoto Station (Subway)` / `京都站（京都市营地铁）` | `006074` · `[135.75992, 34.98621]` |

**强制写入 `explicitlyExcluded` 的防误并红线（`P1-S1` 与 `P1-S3` 双端必检）**：

1. **`阪急 京都河原町駅`（`sk:station:kansai:hankyu-kyoto-kawaramachi`，KSJ `005990`，`[135.76905, 35.00378]`）**：位于四条河原町繁华商圈，距 JR 京都站约 2.3 km 东北，**严禁混入 `sk:complex:kansai:kyoto`**！
2. **`京阪 祇園四条駅`（`sk:station:kansai:keihan-gion-shijo`，KSJ `005997`，`[135.77175, 35.00275]`）**：位于鸭川东岸四条大桥东端，距 JR 京都站约 2.4 km 东北，**严禁混入 `sk:complex:kansai:kyoto`**！
3. **`阪急 烏丸駅`（`sk:station:kansai:hankyu-karasuma`，KSJ `005992`）与 `地下鉄 四条駅`（`sk:station:kansai:kyoto-subway-shijo`，KSJ `006001`）**：位于四条乌丸，距京都站北侧两站地铁（约 2.0 km），独立成群 `sk:complex:kansai:shijo-karasuma`。
4. **`京阪 七条駅`（`sk:station:kansai:keihan-shichijo`）**：距京都站东约 1.1 km（鸭川东岸），不属京都站复合体；JR 奈良线与京阪本线的铁道换乘枢纽在南侧一站的 `東福寺`（`sk:complex:kansai:tofukuji`）。

#### C. 京阪神其余核心复合体（`P1-S1` 必须建群）

| `SkId<'complex'>` | 纳入车站 `stationIds` | 换乘说明与防误并备注 |
| --- | --- | --- |
| `sk:complex:kansai:shijo-kawaramachi` | `hankyu-kyoto-kawaramachi`, `keihan-gion-shijo` | 经四条大桥地面出闸换乘（`out_of_gate`）；`explicitlyExcluded`：`JR 京都駅`、`烏丸/四条` |
| `sk:complex:kansai:shijo-karasuma` | `hankyu-karasuma`, `kyoto-subway-shijo` | 地下通道出闸换乘（`out_of_gate`） |
| `sk:complex:kansai:shin-osaka` | `jr-west-shinosaka`, `jr-central-shinosaka`, `osaka-metro-shinosaka` | JR 在来线↔新干线（`in_gate` 新干线换乘口）与 Osaka Metro 御堂筋线（`out_of_gate`） |
| `sk:complex:kansai:osaka-namba` | `osaka-metro-namba`, `kintetsu-osaka-namba`, `hanshin-osaka-namba`, `jr-west-jr-namba` | 近铁与阪神共用大阪难波站内直通；南海难波暂未纳入 Phase 1 八社（`explicitlyExcluded` 标明） |
| `sk:complex:kansai:kobe-sannomiya` | `jr-west-sannomiya`, `hankyu-kobe-sannomiya`, `hanshin-kobe-sannomiya` | 站名含 `三ノ宮` / `神戸三宮` 差异，按 650m 守卫 + 显式复合体聚合 |
| `sk:complex:kansai:yodoyabashi` | `osaka-metro-yodoyabashi`, `keihan-yodoyabashi` | 御堂筋线 ↔ 京阪本线 |
| `sk:complex:kansai:kyobashi` | `jr-west-kyobashi`, `keihan-kyobashi`, `osaka-metro-kyobashi` | JR 大阪环状/片町/东西线 ↔ 京阪本线 ↔ 长堀鹤见绿地线 |
| `sk:complex:kansai:tennoji` | `jr-west-tennoji`, `osaka-metro-tennoji`, `kintetsu-osaka-abenobashi` | 含站名不同的近铁大阪阿部野桥站（须显式聚合） |
| `sk:complex:kansai:tenjimbashisuji-rokuchome` | `osaka-metro-tenjimbashisuji-rokuchome`, `hankyu-tenjimbashisuji-rokuchome` | 谷町线/堺筋线 ↔ 阪急千里线（堺筋线直通边界） |
| `sk:complex:kansai:sanjo-keihan` | `keihan-sanjo`, `kyoto-subway-sanjo-keihan` | 京阪 `三条`（`005971,005972`）↔ 东西线 `三条京阪`（`005970`） |
| `sk:complex:kansai:tofukuji` | `jr-west-tofukuji`, `keihan-tofukuji` | JR 奈良线 ↔ 京阪本线 |
| `sk:complex:kansai:yamashina` | `jr-west-yamashina`, `kyoto-subway-yamashina`, `keihan-keihan-yamashina` | JR 琵琶湖/湖西线 ↔ 东西线 ↔ 京阪京津线 |
| `sk:complex:kansai:takeda` | `kyoto-subway-takeda`, `kintetsu-takeda` | 近铁京都线 ↔ 乌丸线直通边界（**警告：禁止与兵库县 JR 播但线 `竹田駅` `005116` 混同！**） |
| `sk:complex:kansai:misasagi` | `kyoto-subway-misasagi`, `keihan-misasagi` | 京阪京津线 ↔ 东西线直通边界 |

### 2.4 冻结五组关西跨社直通运营 ID（`scope = 'kansai'`）

| `SkId<'through'>` | 边界换乘/直通站 `boundaryStationId` | `fromRailLineId` ↔ `toRailLineId` | 参与运营商 `operatorIds` |
| --- | --- | --- | --- |
| `sk:through:kansai:hankyu-kyoto-senri-osaka-metro-sakaisuji` | `sk:station:kansai:osaka-metro-tenjimbashisuji-rokuchome` | `hankyu-senri`（经淡路直通 `hankyu-kyoto`）↔ `osaka-metro-sakaisuji` | `hankyu`, `osaka-metro` |
| `sk:through:kansai:kintetsu-kyoto-kyoto-subway-karasuma` | `sk:station:kansai:kyoto-subway-takeda` | `kintetsu-kyoto` ↔ `kyoto-subway-karasuma` | `kintetsu`, `kyoto-subway` |
| `sk:through:kansai:keihan-keishin-kyoto-subway-tozai` | `sk:station:kansai:kyoto-subway-misasagi` | `keihan-keishin` ↔ `kyoto-subway-tozai` | `keihan`, `kyoto-subway` |
| `sk:through:kansai:hanshin-namba-kintetsu-nara` | `sk:station:kansai:kintetsu-osaka-namba` | `hanshin-namba` ↔ `kintetsu-namba`（直通 `kintetsu-nara`） | `hanshin`, `kintetsu` |
| `sk:through:kansai:jr-west-biwako-kyoto-kobe-special-rapid` | `sk:station:kansai:jr-west-kyoto`（及 `jr-west-osaka`） | `jr-west-biwako` ↔ `jr-west-kyoto` ↔ `jr-west-kobe` | `jr-west` |

### 2.5 关东预览区（`kanto-preview`）边界约定

- 复用 `lab/a-tokyo-atlas-fare:labs/a-tokyo-atlas-fare/data/processed/atlas.json` 与隔离的 `osm-vertical.json`（只读 `git show` 提取），将三段式历史 ID 通过 `parseLegacyLabId(..., 'kanto')` 升级为 v1.0 四段式 `SkId`。
- 必须确保新宿枢纽站点与 `packages/data-stations/src/shinjuku.ts` 中的 10 站 ID 与 `sk:complex:kanto:shinjuku` 100% 一致，且东京都/JR东日本干线 ID 与 `packages/fare-engine/src/packs/kanto-jr/rules.ts` 保持兼容。

---

## 3. `PMTiles` v3 矢量瓦片图层规范

### 3.1 产生物理文件清单（严禁混入 ODbL）

| 归档文件名 | 缩放级别 (`minzoom`–`maxzoom`) | 许可属性 | 说明 |
| --- | --- | --- | --- |
| `kansai-rail.pmtiles` | `z6`–`z15` | CC BY 4.0 兼容（KSJ N02-24 + 人工核对） | 京阪神 8 社主矢量图（含 4 个标准图层） |
| `kanto-rail.pmtiles` | `z6`–`z15` | CC BY 4.0 兼容（KSJ N02-24 + 都营 GTFS） | 关东预览区主矢量图（含 4 个标准图层） |
| `kanto-rail-vertical.odbl.pmtiles` | `z10`–`z15` | **ODbL 1.0 (`shareAlike: true`)** | **物理隔离**的纵断高架/地下图层（仅含 `rail_vertical`），仅通过 `segment_id` 在展示层按需关联 |

### 3.2 标准 MVT v2.1 图层 Schema（`source-layer`）

1. **`rail_segments`**（Geometry: `LineString`）
   - `id`: `string`（`SkId<'segment'>`）
   - `operator_id`: `string`（`SkId<'operator'>`）
   - `primary_line_id`: `string`（`SkId<'line'>`）
   - `line_ids_json`: `string`（JSON 数组字符串，供共轨查询）
   - `color`: `string`（HEX 识别色）
   - `line_class`: `'shinkansen' | 'trunk' | 'local_line' | 'metro' | 'private' | 'unknown'`
   - `is_shinkansen`: `boolean`
   - `corridor_slot`: `number`（整数偏移槽位 `0, 1, -1, 2, -2...`，供 MapLibre `line-offset` 解决平行多线重叠）
   - `corridor_count`: `number`（同走廊共轨线数）
   - `label_zh_cn` / `label_ja` / `label_en`: `string`

2. **`rail_stations`**（Geometry: `Point`）
   - `id`: `string`（`SkId<'station'>`）
   - `operator_id`: `string`（`SkId<'operator'>`）
   - `complex_id`: `string`（`SkId<'complex'>` 或 `""`）
   - `station_code`: `string`（如 `"M16"`、`"K11"`，未知为 `""`）
   - `importance_rank`: `1 | 2 | 3`（`1` = 主要枢纽/复合体核心站，`z8+` 显示；`2` = 优等停靠/换乘站，`z10+` 显示；`3` = 普通站，`z12+` 显示）
   - `label_zh_cn` / `label_ja` / `label_en`: `string`

3. **`station_complexes`**（Geometry: `Point`）
   - `id`: `string`（`SkId<'complex'>`）
   - `hub_key`: `'umeda' | 'kyoto' | 'shinjuku' | ''`（标注是否已建 3D/2D 室内模型）
   - `station_count`: `number`
   - `label_zh_cn` / `label_ja` / `label_en`: `string`

4. **`through_boundaries`**（Geometry: `Point`）
   - `id`: `string`（`SkId<'through'>`）
   - `boundary_station_id`: `string`（`SkId<'station'>`）
   - `label_zh_cn` / `label_ja` / `label_en`: `string`

5. **`rail_vertical`**（仅存在于 `*.odbl.pmtiles`，Geometry: `LineString`）
   - `segment_id`: `string`（`SkId<'segment'>`）
   - `vertical_class`: `'elevated' | 'at_grade' | 'underground' | 'unknown'`

---

## 4. 数据源许可矩阵与 ODbL 物理隔离规则

| Source ID | 名称与发布方 | 许可 | `commercialUse` | `redistribution` | `shareAlike` | 使用边界与隔离规则 |
| --- | --- | --- | --- | --- | --- | --- |
| `sk:source:jp:mlit-ksj-n02-24` | 国土数値情報 鉄道データ N02-24（国土交通省） | 公共データ利用規約 1.0 / CC BY 4.0 互換 | `yes` | `yes` | `false` | 线站几何与站码一次主源。本地缓存只读路径：`E:\SENKIRO\.local-raw-backup\a-tokyo-atlas-fare\raw\ksj-n02.zip`（支持 `SENKIRO_RAW_DIR` 覆盖），**严禁将 `raw/` 或 `.zip` 提交入 Git**。 |
| `sk:source:kanto:odpt-toei-gtfs` | 都営交通 GTFS（東京都交通局 / ODPT） | CC BY 4.0 | `yes` | `yes` | `false` | 关东预览区都营线站序、站号与假名源。 |
| `sk:source:jp:gsi-pale-tiles` | 地理院タイル 淡色地図（国土地理院） | 国土地理院コンテンツ利用規約（CC BY 4.0 互換） | `yes` | `yes` | `false` | 可选在线浅底图，**必须支持 100% 离线矢量降级**（无网或 E2E 离线环境下保持纯色底板+矢量铁路网正常工作）。 |
| `sk:source:kyoto:*` / 各社官网 | JR 西日本、JR 东海、近铁、京都市交通局、阪急、京阪、阪神、Osaka Metro 官网构内图与线路指南 | 各社官方版权页（仅人工核对客观事实） | `conditional` | **`no`** | `false` | **严禁描图、严禁复制官方原图或大段原文入库**；仅人工读取站台番线/层级/闸机连通事实并登记 `SourceRecord` 与 `StationExternalLink`。 |
| `sk:source:jp:osm-rail-vertical` | OpenStreetMap 铁路纵断属性（关东预览区 `osm-vertical.json`） | **ODbL 1.0** | `yes` | `yes` | **`true`** | **严禁进入主数据库或主 `.pmtiles`**；仅存在于物理隔离的 `TrackVerticalLayer` 与 `kanto-rail-vertical.odbl.pmtiles`，主数据包必须通过 `assertOdbLIsolation()` 校验。 |

---

## 5. 跨包联合接口与双向深链协议

### 5.1 `RegionalAtlasBundle`（`@senkiro/data-kansai` 与 `apps/web` `AtlasDataSourceSlot` 共享形状）

> 为保证 `P1-S1` 与 `P1-S2` 零冲突并行，`apps/web` 在 Wave 1 不直接导入 `@senkiro/data-kansai`，而是在 `apps/web/src/slots/slots.tsx` 声明同构的 `AtlasDataSourceSlot`（仅依赖 `@senkiro/contracts`）。`P1-S1` 的导出对象必须结构兼容以下接口：

```ts
export interface RegionalAtlasBundle {
  region: AppRegion; // 'kansai' | 'kanto'
  trackGraph: TrackGraph;
  throughServices: readonly ThroughService[];
  pmtilesUrl: string; // e.g. '/tiles/kansai-rail.pmtiles' or '/tiles/kanto-rail.pmtiles'
  /** Optional physically isolated ODbL layer metadata (never merged into trackGraph). */
  verticalLayer?: TrackVerticalLayer;
  verticalPmtilesUrl?: string;
}
```

### 5.2 宏观地图 ↔ `<StationExplorer />` 双向深链协议（基于 `useAppSearch()`）

1. **禁止裸用 `useSearch()`**：`apps/web` 所有组件读取 URL 状态**必须通过 `useAppSearch()`**，写入统一通过 `useUpdateSearch()`。
2. **宏观地图 → 站内 3D/2D 下钻**：
   - 点击地图上的 3D 枢纽徽章（`umeda` / `kyoto` / `shinjuku`）或百科抽屉中的「进入站内 3D/2D 导览」按钮时，调用：
     `update({ region: HUB_REGION[hub], hub, complex: complexId, station: undefined, line: undefined })`（或保留关联 `complex`）。
   - 右侧 `HubPanel` 自动展开对应 `<StationExplorer />`（`key={hub.id}`），并同步 `level` / `selection` / `stepFree`。
3. **站内 3D/2D → 宏观外部线路反向高亮**：
   - 用户在 `<StationExplorer />` 站台详情中点击所属外部线路（触发 `onNavigateExternalLine(lineId)`）时，`HubPanel` 调用：
     `update({ module: 'atlas', line: lineId, station: undefined, complex: undefined })`（桌面端可选择收起或保留 `hub` 预览，同时 Atlas 地图高亮该 `lineId` 并打开线路百科抽屉）。

### 5.3 OPFS 降级原因传递协议（`packages/local-db` ↔ `apps/web`）

为修复 `P0-W2` 遗留 #3（跨标签页占用与不支持场景文案混淆）：
- `packages/local-db` 在 `WebPersistenceMode` 保持 `'opfs-sahpool' | 'memory-fallback'` 不变的前提下，在 `ManagedSQLiteDriver` 与 Worker 协议新增可选字段：
  `persistenceFallbackReason?: 'unsupported' | 'pool-busy' | 'unknown'`（`open` 成功走 `opfs-sahpool` 时为 `undefined`）。
- 当 `installOpfsSAHPoolVfs` 因 `navigator.storage?.getDirectory` / `FileSystemSyncAccessHandle` 不可用失败时返回 `'unsupported'`；因同源另一标签页持有 SAH pool 锁 / `AccessHandle` / `NoModificationAllowedError` 失败时返回 `'pool-busy'`；其余异常返回 `'unknown'`。
- `apps/web/src/slots/adapters/local-db-probe.tsx` 与 `messages.ts` 据此在 `zh-CN / ja / en` 三语下准确区分展示文案。


---

## 6. 枢纽室内 3D/2D 统一建筑与导视视觉规范（Lab B × Lab C × `@senkiro/ui-kit` 定案）

> 本节冻结 `@senkiro/station-3d` 与 `@senkiro/data-stations` 的统一视觉与交互基准，综合 Lab B（梅田命令式合批、世界尺度微接缝质感、1px 标签引线）与 Lab C（和纸/石墨沙盘光照、按运营商着色的低饱和付费区、规则建筑构件、2D 独立分栏与 `scaleCap`），并与 `@senkiro/ui-kit` 设计令牌保持 100% 一致，适用于梅田、京都、新宿及所有后续枢纽。

### 6.1 统一枢纽示意坐标尺度规范（禁止 2D 分栏碎裂与构件微观化）

| 规范项 | 强制数值 / 规则 | 依据与防踩坑说明 |
| --- | --- | --- |
| **枢纽总包络跨度** | **`~90–150` 示意单位**（东西/南北均在此量级） | 对齐梅田（`118.7 × 112.5`）与新宿（`148.6 × 166.3`）。超过 `220` 单位会导致相距较远的同站站台在 2D 自动拆碎、闸机/楼梯退化为黑点。 |
| **同站平行站台间距** | **`2.5–4.5` 单位**（必须 `< DEFAULT_JOIN_GAP = 6`） | 保证同一车站的相邻股道/站台在 `floorLayout()` 中自然聚为同一连通块，**禁止 `1F` 或 `3F` 站台被拆成 3–4 个孤立散条**。 |
| **楼层垂直间距** | **`4.0–5.0` 单位/层**（例如 `B2F=-8, B1F=-4, 1F=0, 2F=4, 3F=8`） | 保持紧凑沙盘比例；配合「分层展开」时视觉分离明显而不飘出画框。 |
| **`kind` 几何语义** | `concourse` / `passage` / `platform` 才有楼板体块；`entrance` / `landing` 仅作点位/落脚区标示 | 严禁把整个地面大广场或地下走廊建成无楼板的 `landing`/`entrance` 孤点（会导致该区域在 3D/2D 中消失为悬空虚空）。 |
| **同层零重叠** | 同一 `level.ordinal` 下任意两个 `place` 的 `footprint` 矩形**交集面积必须为 `0`** | 从数据层彻底消灭 3D `Z-fighting` 闪烁与 2D 标签互压。 |

### 6.2 统一 3D 建筑风格：「和纸与石墨建筑剖切沙盘（Washi & Graphite Cutaway Maquette）」

1. **相机与构图**：
   - 使用 `PerspectiveCamera`（`fov: 40°–42°`），`resetView()` 按透视投影包围球居中并贴合视口（模型主体占画布宽度 **65%–75%**，严禁缩成角落 `20%` 小块）；左键旋转、**中键/右键平移**、滚轮缩放；聚焦动效 `320ms` cubic-out（尊重 `prefers-reduced-motion`）。
2. **三灯无阴影光棚 + 按需渲染**：
   - 采用 Lab C 三灯体系：天/地半球补光 + 主暖方向光（`[-45, 90, 60]`）+ 弱冷对向补光（`[60, 40, -70]`）；浅色用 `NoToneMapping`，深色用 `NeutralToneMapping`。
   - **严禁启用实时阴影贴图（`shadowMap`）**：多层高架/地下叠放时，实时阴影会把下层站台罩黑；改用设备脚下的轻量烘焙接地阴影垫（contact shadow）。
   - 保持 `requestAnimationFrame` 按需渲染（仅相机移动、状态变更或焦点动画时出帧）。
3. **语义低饱和色板 + Lab B 世界空间微接缝质感**：
   - 背景色与 `--sk-color-canvas` 严格同步（浅色 `#f4f1ea` 和纸白、深色 `#181c22` 深石墨；深色模式通过更换桌面与灯光适配，绝不用全局半透明遮罩压暗模型）。
   - `unpaid`：暖石灰石（浅 `#e6dfd3` / 深 `#383f4a`）。
   - `paid:<operator>`：**按运营商 `operatorId` 区分的低饱和建筑色（饱和度 ≤ 22%）**，通过换乘检票口时可一眼分辨所属公司（如 JR西日本 灰蓝、JR東海 暖砂褐、近鉄 浅陶红、京都市営地下鉄 青瓷绿、Osaka Metro 湖蓝、阪急 浅梅灰、京阪 苔绿、阪神 靛灰等）。
   - `platform`：冷混凝土（浅 `#cbd3dc` / 深 `#434d59`）+ 浅色安全缘 + 柔和盲道黄条（`#dfb842`，仅在 `tracks[].side` 声明的一侧绘制）。
   - `roadway`：哑光深沥青（浅 `#c2c0ba` / 深 `#2c313a`），与步行区域明显区分。
   - **世界空间微接缝着色器（Lab B 精髓）**：通过 `MeshStandardMaterial.onBeforeCompile` 单批次为地面/站台注入抗锯齿（`fwidth`）拼缝网格与侧面根部渐变明暗，零外部贴图、总 Draw Call 控制在 **≤ 6 次**。
   - **品牌信号色对齐 `@senkiro/ui-kit`**：
     - 选中态：**暖琥珀**（浅 `#d97706` / 深 `#fbbf24`）；
     - 路线高亮：**SENKIRO 朱红**（浅 `#b8432a` / 深 `#ff8a65`，替代刺眼洋红）；
     - 检票口：深灰机箱，普通票闸为珊瑚红扇叶、**跨社换乘闸为青碧色（`#18808a` / `#58c7cf`）**。
4. **规则建筑细部与连续 3D 路线（彻底消灭蜘蛛网细线与整块涂红）**：
   - 沿 `concourse` / `passage` 外轮廓生成 `0.85m` 矮墙与付费区边界线，并在相邻区域、`gate`、`entrance` 接口处自动开口（必须有单测证明开口处无墙挡路）；
   - `gate` 按 `link.position` 生成 4 通道 5 机身闸机阵列；`elevator` 生成带门洞的半透明玻璃井道；`stairs` / `escalator` 在两端点间生成踏步/斜坡及上层楼板开口护栏；
   - **禁止生成跨大跨度区中心的对角连线（`anchor → anchor` 蜘蛛网细线）**：同层相邻区以实体相邻与矮墙开口表达连通，竖向设施只连各自真实上下端口坐标；
   - **连续 3D 路线折线（`depthTest: false` 最后绘制）+ 柔和描边 + 起终点标柱**：选中路线时不再把整块百米站台涂成实心色，而是在通道与竖向设施上方绘制连续朱红路线带并保留其它楼层 `opacity: 0.16` 幽灵轮廓作为空间参照。
5. **明确禁令（沿用 `transit-station-3d` 血泪教训）**：
   - 严禁画楼层间辅助虚线、全层半透明背景板、扶梯踏步箭头、模型外外部铁轨、无依据的开阔地面柱网、专属遮挡视线的巨型屋盖（如 `osakaShed`），以及在 Phase 1 塞入粗陋方块列车。

### 6.3 统一导视 UI 与 2D 平面图风格（「SENKIRO 日式铁道导视界面」）

1. **CSS Modules + 内置 `--sk-*` 回退令牌**：`<StationExplorer />`、`<StationDetails />` 与 `<StationPlan2D />` 必须拥有自包含 `.module.css`，并在 `[data-station-explorer][data-station-theme="dark" | "light"]` 声明与 `packages/ui-kit/src/styles/tokens.css` 完全对齐的 `--sk-*` 回退变量，保证独立预览与嵌入 `apps/web` 视觉 100% 统一；`[aria-pressed="true"]` 必须有高对比朱红/反色选中态；`<dialog>` 来源弹窗必须有不透明表面背景、半透明遮罩与自动换行（`overflow-wrap: anywhere`）。
2. **3D 分级 DOM 标签 + 1px SVG 引线**：`pointer-events: none` 叠层，按 `pxPerModelUnit` 分 `far / mid / near` 三级显示（单层查看自动降一级），贪心避让 + `7%` 防抖回差 + `240px` 同义去重；发生 `12–44px` 偏移时画 `1px` 细引线连接锚点；站台标签带所属线路 4px 色条。
3. **2D 横向独立分栏 SVG**：2D 模式固定单层浏览（默认 `1F` 或沿用当前单层）；每个不连通块拥有独立圆角卡片、**站名归属（去重后 `·` 连接）+ 随转向旋转的指北针（`↑ 北` / `← 北`）**标题栏、**独立拖移/滚轮缩放**与全局 `＋ / − / 重置` 工具条；单块楼层施加 `scaleCap` 防止小楼层被过度放大；竖向符号严禁飘出所在楼层面板之外。
4. **乘客导向信息架构**：右侧栏默认紧凑分组——路线起终点（站台带线路标识、三语下去重零重名）→ 可点击跳转镜头的步骤卡（含楼层徽章 + 设施类型徽章）→ 乘客可读详情卡（隐去内部 UUID/schema 字段，保留番线去向、站台门、营业时间、外部线路芯片、`查看来源` 按钮与官方外链）。
