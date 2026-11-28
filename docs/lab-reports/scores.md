# SENKIRO Lab 归档评审与资产迁移评估（scores.md）

> **评审日期**：2026-11-28  
> **归档范围**：SENKIRO Lab A / B / C 三座独立先行原型  
> **核验说明**：本评审基于各原型分支已提交代码、数据清单、`REPORT.md` / `PHASE2-REPORT.md` / `V3-REPORT.md` 与 Git 树核对整理；**本次归档未重跑原型的 build 或测试（`tests_rerun = false`）**，所有测试通过数字均严格转述各原型自报告记录及对应基线提交。

---

## 1. 三座原型归档总览与冻结基线

| 原型 | 归档目标分支（只读基准） | 归档基准 Commit SHA | 核心定位 | 已记录实测结果（自报告） | 迁入主线去向 |
| --- | --- | --- | --- | --- | --- |
| **Lab A** | `lab/a-tokyo-atlas-fare` | `9244196`（含 `integration/atlas-v2@14dd5af`、`003b467` 等） | 东京 23 区铁道地图 + JR 运价规则引擎 + 3D 都市地下铁路网 | `atlas-v2@14dd5af` 记录 Vitest `83/83`、Playwright `14/14`（`REPORT.md` 基础版记录 `42/42` 含 `26` 条运价 + `9` 条对齐 + `7` 条高程）；`003b467` 与 `9244196` 为后续城市景观与遥测升级 | `@senkiro/domain-core`、`@senkiro/fare-engine`（剥离东京硬编码）、`packages/city-3d`（Phase 6）、关东预览区数据 |
| **Lab B** | `lab/b-umeda-3d` | `b2ed773`（含 `d6cc1df`、`c994f93`） | 大阪・梅田 7 站复合体 + Whity 地下街命令式 3D / 2D + 9 款关西车型 | `c65c17c` / `c994f93` 记录 Vitest `71/71`（19 文件）、Playwright `57/57`、`58,482` 路线对不变量 0 错误、3 Draw Call / 97,270 三角面；`b2ed773` 补充 `namesZh.ts` 三语词条与官方时刻表外链面板（未重测标注） | `@senkiro/station-3d`（命令式 Three.js 架构基准）与 `@senkiro/data-stations/umeda` |
| **Lab C** | `lab/c-shinjuku-3d` | `19b2daa`（已完整合入 `claude/shinjuku-3d-indoor-nav-3f3cce@603492f` 与 `e44e0e1`） | 新宿 8 站区 + 新宿三丁目 + 新宿西口 10 层 3D/2D + 大新宿时刻表管线 | `V3-REPORT.md` 2026-11-20 记录 Vitest `260` 项、E2E `34` 项中 `31` 项通过；独立时刻表管线 `21` 项 `node:test` 通过 | 剥离 R3F 合入 `@senkiro/station-3d`，建筑几何规则与 2D 横向分栏复用于核心引擎，新宿数据包迁入 `@senkiro/data-stations/shinjuku` |

> **并发工作树状态披露（2026-11-28 快照）**：
> - **Lab A 主目录现状**：`E:\SENKIRO` 主目录当时正处于 `lab/a-tokyo-atlas-fare` 分支进行后续海岸线与街区轮廓微调（未提交改动保留在该工作区，主线 `integration/phase-0` 挂载于独立工作树 `E:\SENKIRO\worktrees\integration-phase-0` 以保持零干扰）。
> - **Lab B 保留目录现状**：磁盘上保留以下未改动目录供对照与后续核验：`E:\SENKIRO\labs\_worktrees\umeda-b`（`lab/b-umeda-3d@b2ed773`）、`E:\SENKIRO\labs\_worktrees\umeda-sol`（独立克隆 `codex/umeda-implementation@c994f93` 含工作区改动）、`E:\Workteree\SENKIRO\umeda-handoff-ab4a62`（`8c15d0c`）。
> - **Lab C 收拢完毕**：原 `claude/nice-mendeleev-234068`、`claude/plan2d-layout-fe79d9`、`claude/shinjuku-3d-indoor-nav-3f3cce` 已全部零冲突合入 `lab/c-shinjuku-3d@19b2daa`，冗余本地工作树已清理，gitignored 本地 raw/时刻表数据已备份至 `.local-raw-backup/c-shinjuku-3d/`。

---

## 2. 分项能力评审与技术决策输入

### 2.1 Lab A · 东京铁路图鉴、JR 运价与 3D 都市地下网（`lab/a-tokyo-atlas-fare`）

- **突出优势**：
  1. **三图分离与跨源对齐落地**：严格按 `TrackGraph / ServiceGraph / FareRuleGraph` 拆分实体，以 `650m` 空间守卫对齐 MLIT KSJ N02-24 与 ODPT 都营 GTFS，并显式保留 44 条未对齐记录用于透明公示。
  2. **ODbL 物理隔离机制（Collective Database）**：将 OpenStreetMap 衍生的纵断高程（`osm-vertical.json`）与都市分块资产物理隔离于 CC BY 主数据集之外，仅在视图层通过 `sk:segment:*` ID 关联，彻底阻断 ODbL share-alike 传染商业授权层。
  3. **可解释 6 态运价引擎与法规版本切换**：支持 `OK / NOT_APPLICABLE / MISSING_DATA / UNSUPPORTED / STALE_RULE / ERROR`，非 `OK` 状态 `totalAmountYen` 恒为 `null`；内置 `2026-03-14` JR 东日本运价改定双版本规则切换与条文级解释树。
  4. **大规模都市 3D 与按需流式分块**：`2km×2km` 空间分块、LOD0 建筑懒加载与原生命令式 `Three.js` 地下开削视角。
- **已知短板（Phase 0 必改项）**：
  1. `fareEngine.ts` 内存在东京/JR 东日本硬编码（如 `isJrOperator` 只认 `jr-east`/`jr-central`，路网偏好硬编码 `saikyo_bypass`、`yokosuka_bypass`、`oku_bypass` 等站名 ID），必须在 `P0-S1` 重构为区域无关的核心引擎 + `RegionalFareRulePack` 插件接口。
  2. 数据 ID 为三段式 `sk:<type>:<slug>`，需在 Phase 0/1 升级适配四段式 `sk:<entity>:<scope>:<slug>`。

### 2.2 Lab B · 大阪・梅田七站复合体 + Whity 3D/2D（`lab/b-umeda-3d`）

- **突出优势**：
  1. **直接攻克京阪神首发最复杂枢纽**：完整覆盖 JR 大阪（含うめきた）、御堂筋梅田、东梅田、西梅田、阪急大阪梅田、阪神大阪梅田、JR 北新地与 Whity 地下街（20 层归并 6 层、171 节点、194 连接、70 条 `SourceRecord`），严格坚持「跨社未核实连络改札绝不连通」。
  2. **命令式 Three.js 极致合批与零重渲染状态模型**：全景仅 **3 次 Draw Call**（97,270 三角面）、支持 `render-on-demand` 按需绘制、独立 `selection` 状态与横向共享比例尺 2D 平面图。
  3. **一级三语与官方时刻表合规克制**：`b2ed773` 新增 `namesZh.ts` 与 `language.ts`（`ja / en / zh`），对网页条款限制抓取的运营商（JR 西日本/大阪地铁/阪急/阪神）只提供合规外链面板而不违规入库，本地抓取脚本严格隔离至 `.gitignore` 下的 `data/raw/`。
- **已知短板（Phase 0 必改项）**：
  1. 部分实体类型命名（`Place` / `Link` / `DistrictSite`）与 Lab C（`Area` / `Passage` / `Gate` / `VerticalFacility`）尚未统一，需在 `P0-S2` 对齐 `01-domain-contract-v1.0.md` 的 `StationHubDataset`。
  2. 2D/3D 目前以独立单站应用运行，需抽离为可传入 `hubDataset`、`selectedId`、`stepFree`、`locale`、`theme` 的可复用组件 `<StationExplorer />`。

### 2.3 Lab C · 新宿站群 10 层 3D/2D + 大新宿时刻表管线（`lab/c-shinjuku-3d`）

- **突出优势**：
  1. **超高复杂度枢纽不变量校验**：覆盖新宿 8 站区 + 新宿三丁目 + 新宿西口（23 层归并 10 层、409 节点、1,066 边），构建期严格校验跨楼层与改札边界，实现字典序无台阶（`stepFree`）优先寻路与终端站台门联动。
  2. **横向分栏 2D 平面图算法（`planLayout.ts`）**：多楼层各自横置并与地下通道分离成独立可缩放面板，信息密度极高而无遮挡。
  3. **零依赖时刻表双层合规管线**：公开 CC BY 4.0 层（都营新宿线/大江户线 3,018 条停站事件，2,645/2,645 发车核对一致）与受限/来源不明本地隔离层（`data/shinjuku/local/`）彻底分离，并自带完备校验器（拒绝内部 `trip_id` 冒充车次、禁止同股道冲突、禁止 Demo 与正式数据混用）。
- **已知短板（Phase 0 必改项）**：
  1. 3D 渲染层依赖 `@react-three/fiber`（`Scene3D.tsx`），与全仓统一「原生命令式 `Three.js` + Expo `"use dom"` 零重写嵌入」路线不兼容，必须在 `P0-S2` 剥离 R3F 并迁入统一的 `@senkiro/station-3d`。
  2. 实机 GPU 帧率尚未测试（当前仅记录了软件渲染指标），需在 Phase 1/2 联调期补齐真实显卡遥测。

---

## 3. 许可与开源合规核查结论

| 检查项 | 核查结果 | 处置动作 |
| --- | --- | --- |
| 仓库根及三分支 `.env` / API Key | 均未提交密钥；`git ls-tree` 检查 0 敏感文件 | 通过；密钥继续只读本地 `.env.local` |
| `data/raw/` 与受限网页时刻表 | 均已通过 `.gitignore` 排除，未进三条 `lab/*` 树 | 通过；本地原始文件已备份至 `.local-raw-backup/`（gitignored） |
| 官方站内图 / 线路图 / 运营商 Logo 原图 | 未提交任何原件图像；均为自有表达结构化数据 | 通过 |
| ODbL Share-Alike 隔离 | Lab A 已验证 `osm-vertical.json` 与都市分块按 `SkId` 独立加载 | 固化写入 `01-domain-contract-v1.0.md` 硬规 |

---

## 4. 向主线 Phase 0 Monorepo 迁移映射清单

| 正式 Monorepo 包 | 来源资产 | Phase 0 责任 Session | 核心重构要求 |
| --- | --- | --- | --- |
| `packages/contracts` | `docs/00-shared-contract.md` + Lab A/B/C 域类型收敛 | **P0-W0** | 发布 `v1.0` 全域 TS 类型、`SkId` 规则、三语回退与防伪冒守卫 |
| `packages/domain-core` | Lab A `graphs.ts`、`alignment.ts`、`elevationSolver.ts` | **P0-S1** | 去除东京常量依赖，通用化三图容器与 650m 跨源对齐 |
| `packages/fare-engine` | Lab A `fareEngine.ts`、`fareRules.ts`、`fareTariff.ts` | **P0-S1** | 抽离 `RegionalFareRulePack` 插件接口，东京规则落入 `packs/kanto-jr` |
| `packages/local-db` | 新建（按 `plan-v1.0.md` §0.3） | **P0-S1** | Drizzle SQLite Schema + Web OPFS `sahpool` Worker + `sync_oplog` HLC |
| `packages/station-3d` | Lab B 命令式 Three.js 内核 + Lab C 2D 横向分栏与建筑细部 | **P0-S2** | 彻底移除 `@react-three/fiber`，统一 `<StationExplorer />` 与 `<StationPlan2D />` |
| `packages/data-stations` | Lab B 梅田数据 + Lab C 新宿数据 | **P0-S2** | 转为统一 `StationHubDataset` v1.0 格式并跑通全对寻路不变量 |
| `packages/ui-kit` & `apps/web` | Lab A/B/C 三语与日式导视经验 | **P0-S3** | 原创 CSS Variables/Modules + Radix + TanStack Router（零代码生成）全屏地图壳 |
