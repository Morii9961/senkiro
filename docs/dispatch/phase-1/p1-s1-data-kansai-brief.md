# Dispatch Brief · `P1-S1`（Wave 1 并行 · 京阪神 8 社空间管线、`PMTiles` 构建与关东预览区适配 `[REP-02]`）

> **执行轮次**：Wave 1（与 `P1-S2`、`P1-S3` 三路并行，基于 `integration/phase-1`）  
> **推荐订阅模型**：Gemini  
> **基准分支**：`integration/phase-1`  
> **新建分支**：`feat/p1-data-kansai`  
> **建议工作树路径**：`E:\Workteree\SENKIRO\p1-data-kansai`  
> **独占路径 `ownedPaths`**：
> - `packages/data-pipeline/**`
> - `packages/data-kansai/**`
> - `pnpm-lock.yaml`（仅限上述两个新建包增删依赖时由 `pnpm install` 自动更新；**严禁改动根 `package.json`**）
> - `docs/dispatch/reports/p1-s1-data-kansai.md`

---

## 📋 一键复制启动提示词（直接粘贴给新工作树内的 Agent）

````markdown
你正在独立 Git Worktree 中执行 SENKIRO Phase 1 Wave 1 并行任务 `P1-S1`（`[REP-02]` 京阪神 8 社空间数据与 PMTiles 构建管线）。
请先完整阅读以下基线文档（不要猜测任何 ID 或规范）：
1. `docs/02-phase1-atlas-spec.md`（**最核心**：冻结的 8 社/线路/复合体/5 组直通 SkId、PMTiles MVT 图层规范、许可与 ODbL 隔离矩阵、`RegionalAtlasBundle` 接口）
2. `docs/01-domain-contract-v1.0.md`（§1 诚实性铁律、§3 SkId、§5.1 TrackGraph、§5.3 ServiceGraph）
3. `docs/dispatch/HANDOFF_PROTOCOL.md`（并行隔离五大铁律、95% 配额安全停机规程、交接报告模板）
4. `packages/contracts/src/`、`packages/domain-core/src/alignment.ts`、`packages/domain-core/src/track-graph.ts`、`packages/data-stations/src/umeda.ts`、`packages/data-stations/src/shinjuku.ts`
5. 只读参考 Lab A 管线：`git show lab/a-tokyo-atlas-fare:labs/a-tokyo-atlas-fare/scripts/data-build.mjs`

### 你的边界与环境铁律
- **分支与工作树**：确认在基于 `integration/phase-1` 切出的 `feat/p1-data-kansai` 分支上作业；开干前先跑一次 `pnpm install --offline --frozen-lockfile`（如需新装纯 JS 依赖后再联网安装并更新 `pnpm-lock.yaml`）。
- **独占路径 `ownedPaths`**：仅允许创建/修改 `packages/data-pipeline/**`、`packages/data-kansai/**`、`docs/dispatch/reports/p1-s1-data-kansai.md`，以及由 `pnpm install` 自动更新的 `pnpm-lock.yaml`。**严禁**修改 `packages/contracts/**`、`packages/domain-core/**`、`packages/data-stations/**`、`apps/web/**`、根 `package.json`、`tsconfig.base.json`、`biome.json`、`turbo.json`、`vitest.config.ts`！
- **保护红线**：
  - 本地离线原始数据备份在 `E:\SENKIRO\.local-raw-backup\a-tokyo-atlas-fare\raw\ksj-n02.zip`（同时支持环境变量 `SENKIRO_RAW_DIR` 覆盖）。**一律只读流式读取，严禁修改该目录，严禁将任何 `raw/` 或 `.zip` 原始包提交入 Git！**
  - 读取 `lab/a-tokyo-atlas-fare` 的 `atlas.json` 与 `osm-vertical.json` 一律使用 `git show lab/a-tokyo-atlas-fare:...` 只读提取；严禁切分支或修改 `labs/`。
- **工具链严格约束**：
  - `TypeScript 7.0.2`：严格遵守 `tsconfig.base.json`（`strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`verbatimModuleSyntax`、`rewriteRelativeImportExtensions`）；新包 `tsconfig.json` 继承 `../../tsconfig.base.json`，添加 `"types": ["node"]`；所有相对导入必须带 `.ts` 后缀；必须配 `tsconfig.build.json` 与 `vitest.config.ts` 以接入根 `turbo` 和 `vitest`。
  - `Biome 2.6.9`：`noExplicitAny`、`noNonNullAssertion`（禁用 `!`）、`noConsole`、`noForEach`、`useBlockStatements`、`useImportType`/`useExportType` 均设为 error。CLI 构建脚本如需日志输出请使用 `process.stdout.write` / `process.stderr.write` 而非 `console.log`。
  - **纯 Node.js / TS 生成 PMTiles v3（无外部二进制）**：本机无 `tippecanoe`、`pmtiles` CLI 或 `duckdb`；`pnpm-workspace.yaml` 默认禁止依赖 `postinstall` 脚本。请使用纯 JS/TS 依赖（例如 `geojson-vt ^4.0.2` 与 `pmtiles ^4.3.0`，均无原生编译脚本）结合 `node:zlib` 在 `packages/data-pipeline` 编写 **纯 TypeScript MVT v2.1 Protobuf 编码器 + PMTiles v3 单文件归档打包器**（直接复用 `pmtiles` 的 `zxyToTileId` 与规范头结构），并用 `new PMTiles(...)` 在单测中实际回读校验头信息与瓦片数据！
- **Git 提交署名**：每次 `git commit` 末尾必须包含：
  `Co-authored-by: gemini-code-assist[bot] <176961590+gemini-code-assist[bot]@users.noreply.github.com>`

### 分里程碑任务拆解

#### M1：建立 `@senkiro/data-pipeline`（KSJ 读取、多线偏移与纯 TS PMTiles v3 打包器）
1. 创建 `packages/data-pipeline/package.json`（name `@senkiro/data-pipeline`，纯 ESM，`exports` 指向 `./src/index.ts`，`publishConfig.exports` 指向 `./dist/index.js`，依赖 `@senkiro/contracts`、`@senkiro/domain-core`、`pmtiles ^4.3.0`、`geojson-vt ^4.0.2` 等纯 JS 包）。
2. 实现 **只读 KSJ N02-24 ZIP GeoJSON 提取器**：
   - 使用 `node:zlib`（或纯 JS 解压）读取 `ksj-n02.zip` 内的 `UTF-8/N02-24_Station.geojson` 与 `UTF-8/N02-24_RailroadSection.geojson`；
   - 支持地理边界框裁剪（例如京阪神 `[134.60, 34.20, 136.35, 35.35]`，避免把兵库县播但线 `竹田` 或四国 `三条` 等同名站点误拉入）；
   - 按 `docs/02-phase1-atlas-spec.md` §2.2 实现 `東海道線` / `山陽線` 基于车站边界（`京都` / `大阪`）的确定性爱称拆分（`jr-west-biwako` / `jr-west-kyoto` / `jr-west-kobe`）。
3. 实现 **650m 跨源对齐与共轨偏移slot计算**：
   - 复用 `@senkiro/domain-core` 的 `alignExternalStations`（`650m` 守卫 + `UnalignedRecord[]` 显式保留）；
   - 实现走廊平行共轨槽位分配器 `assignCorridorSlots(segments)`，为共享起终走廊（或近邻平行区间）的 `TrackSegment` 分配确定性 `corridor_slot`（`0, 1, -1, 2, -2...`）与 `corridor_count`。
4. 实现 **纯 TS MVT v2.1 编码器 + PMTiles v3 生成器**：
   - 支持输出 `docs/02-phase1-atlas-spec.md` §3.2 规定的 4 个主图层（`rail_segments`、`rail_stations`、`station_complexes`、`through_boundaries`）以及物理隔离的 ODbL 图层（`rail_vertical`）；
   - 在 `packages/data-pipeline/tests/` 编写 Vitest 单测：验证 MVT varint/zigzag 几何编码、PMTiles v3 文件头魔数（`PMTiles`）、`new PMTiles(memorySource).getHeader()` 与 `getZxy(...)` 回读非空且属性完整。
5. 运行包级 `check && build && test` 绿灯后 `git commit`（M1）。

#### M2：建立 `@senkiro/data-kansai`（京阪神 8 社数据包 + 关东预览区适配）
1. 创建 `packages/data-kansai/package.json`（`exports`: `"."`, `"./kanto-preview"`, `"./tiles/*.pmtiles"` 等，依赖 `@senkiro/contracts`、`@senkiro/domain-core`、`@senkiro/data-pipeline`）。
2. **京阪神 8 社核心图谱（`src/kansai/`）**：
   - 完整建库 **JR西日本、JR東海（新干线）、阪急、京阪、近鉄、阪神、Osaka Metro、京都市営地下鉄** 8 大运营商，严格使用 `docs/02-phase1-atlas-spec.md` §2 冻结的所有 `SkId`；
   - **硬对齐**：梅田 7 站与 15 条线路 ID 必须与 `packages/data-stations/src/umeda.ts` 100% 一致；京都站复合体 `sk:complex:kansai:kyoto` **严格仅含 4 站**（JR西日本 / JR東海 / 近鉄 / 地下鉄烏丸線），并在 `explicitlyExcluded` 明确排除 `阪急京都河原町`、`京阪祇園四条`、`烏丸/四条`、`京阪七条`；同步建群 `shijo-kawaramachi`、`shijo-karasuma`、`shin-osaka`、`osaka-namba`、`kobe-sannomiya` 等核心复合体；
   - 建模 5 组冻结的 `ThroughService`（堺筋↔阪急、烏丸↔近鉄、東西↔京津、阪神なんば↔近鉄奈良、JR新快速琵琶湖—京都—神戸直通）；
   - 保留 `UnalignedRecord[]` 未对齐披露清单与所有核查 `SourceRecord`（**严禁把未核实营业キロ或换乘分钟数瞎编填数，未核实一律 `null`**）。
3. **关东预览区适配（`src/kanto-preview/`）**：
   - 从 `lab/a-tokyo-atlas-fare:labs/a-tokyo-atlas-fare/data/processed/atlas.json` 与 `osm-vertical.json` 只读提取并迁入构建/转换脚本，通过 `parseLegacyLabId(..., 'kanto')` 统一升级为 v1.0 四段式 `SkId`；
   - 校准新宿复合体 10 站 ID 与 `packages/data-stations/src/shinjuku.ts` 一致，并与 `packages/fare-engine/src/packs/kanto-jr/rules.ts` 线路 ID 对齐；
   - **严格 ODbL 隔离**：`osm-vertical.json` 只能生成独立的 `kantoVerticalLayer: TrackVerticalLayer`（禁止混入 `kantoTrackGraph`），确保主库通过 `assertOdbLIsolation()`。
4. 导出符合 `docs/02-phase1-atlas-spec.md` §5.1 `RegionalAtlasBundle` 形状的数据与确定性构建脚本（生成的 `.pmtiles` 归档随包产出并受校验）。
5. 绿灯后 `git commit`（M2）。

#### M3：`.pmtiles` 生成、全量不变量测试与交接报告
1. 运行数据管线生成 `kansai-rail.pmtiles`、`kanto-rail.pmtiles` 与物理隔离的 `kanto-rail-vertical.odbl.pmtiles`（单包离线可用，体积精简合理）。
2. 在 `packages/data-kansai/tests/` 编写全面不变量测试：
   - `new TrackGraphIndex(bundle.trackGraph).issues` 必须为 `[]`（0 断边、0 重复 ID、0 悬空站）；
   - `assertOdbLIsolation({ sources: bundle.trackGraph.sources, records: ... })` 必须通过（主包零 `shareAlike: true / 'unknown'`）；
   - `sk:complex:kansai:osaka-umeda` 7 站 ID 与 `umeda` 完全一致；`sk:complex:kansai:kyoto` 严格含 4 站且 `explicitlyExcluded` 明确覆盖 `京都河原町` 与 `祇園四条`；
   - 搜索歧义夹具测试：搜索「大阪」「梅田」「京都」「河原町」「祇園四条」能清晰区分独立站与复合体；
   - 使用 `pmtiles` 读取生成的 3 个 `.pmtiles` 文件，校验每个归档的 `z6–z15` 瓦片可读、包含对应 `source-layer` 且属性字段符合 spec §3.2。
3. 在工作树根目录运行 `pnpm check && pnpm build && pnpm test`，确认全部通过（0 错误 0 警告）。
4. 按 `docs/dispatch/HANDOFF_PROTOCOL.md` 撰写并提交 `docs/dispatch/reports/p1-s1-data-kansai.md`（`READY_FOR_MERGE`）。
````

---

## 交接提醒

- 若运行过程中发现 `@senkiro/contracts` 或 `@senkiro/domain-core` 确实缺失阻塞性字段，**严禁自行修改它们**，请将需求写入 `docs/dispatch/reports/p1-s1-data-kansai.md` 的 `## 4. Contract Requests` 并停下交由主控处理。
- 若 5 小时窗口配额接近 95%，在当前绿灯 Commit 停下并写入 `PAUSED_QUOTA` 交接报告。
