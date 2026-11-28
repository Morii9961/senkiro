# Codex 接力派单书 · P0-S1（继续执行 M2 + M3）

> **接力背景**：原 Claude 会话已完成 **M1（`@senkiro/domain-core`，47/47 单测 + Biome + TypeScript 全绿，`db908c2`）** 后因 5 小时窗口配额耗尽按协议安全停机（`da56d34`，`PAUSED_QUOTA`）。  
> **接力模型**：**Codex（GPT）**  
> **复用已有工作树与分支（无需新建 worktree）**：
> - 工作目录：`E:\Workteree\SENKIRO\p0-domain-sqlite`
> - 当前分支：`feat/p0-domain-sqlite`（当前 HEAD：`da56d34`）
> **独占路径 `ownedPaths`**：
> - `packages/domain-core/**`（M1 已竣工，非必要不动；仅允许因 M2/M3 联调需要做最小导出补充）
> - `packages/fare-engine/**`
> - `packages/local-db/**`
> - `pnpm-lock.yaml`（仅限本包依赖安装自动更新；**严禁修改根 `package.json` 与其他根配置文件**）
> - `docs/dispatch/reports/p0-s1-domain-sqlite.md`

---

## 📋 一键复制 Codex 接力启动提示词（直接粘贴到 `E:\Workteree\SENKIRO\p0-domain-sqlite` 窗口）

````markdown
你正在接力完成 SENKIRO Phase 0 任务 `P0-S1`（M2 + M3）。请直接在当前工作树 `E:\Workteree\SENKIRO\p0-domain-sqlite`（分支 `feat/p0-domain-sqlite`）继续开发，**不要新建工作树**。

### 先读再做（只读上下文）
1. 阅读交接报告：`docs/dispatch/reports/p0-s1-domain-sqlite.md`（已记录 M1 成果与 M2/M3 恢复方案）。
2. 阅读契约与规范：`docs/01-domain-contract-v1.0.md`、`docs/dispatch/HANDOFF_PROTOCOL.md`、以及 `packages/contracts/src/` 与 `packages/domain-core/src/`。
3. **主控对 M1 报告契约诉求的裁定**：批准你在 `@senkiro/fare-engine` 内定义扩展接口 `FareEngineRulePack extends RegionalFareRulePack`（承载 `precheck`、`resolveRoutePreference`、`computeValidityAndStopover`、`lookupSurcharge` 等钩子），保持与 `@senkiro/contracts` 零冲突兼容，并在最终交接报告 `## Contract Requests` 中列出建议上提至契约包的字段/方法。

### 边界铁律（严格遵守）
- **保留 M1 成果**：`packages/domain-core`（commit `db908c2`，47/47 通过）已竣工，不要推倒重写。
- **独占修改范围**：仅限修改 `packages/fare-engine/**`、`packages/local-db/**`（以及必要的 `packages/domain-core` 最小导出调整）、`docs/dispatch/reports/p0-s1-domain-sqlite.md` 与包安装触发的 `pnpm-lock.yaml`。
- **绝对禁区**：严禁碰 `E:\SENKIRO` 主目录（另有并发会话）、严禁修改 `labs/`、`packages/contracts/**`、根 `package.json` / `tsconfig.base.json` / `biome.json` / `vitest.config.ts`。
- **读取 Lab A 资产的唯一方式**：使用 `git show lab/a-tokyo-atlas-fare:labs/a-tokyo-atlas-fare/<path>` 只读读取，严禁切分支。
- **TS / Biome 规范对齐**：根 `tsconfig.base.json` 已开启 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`verbatimModuleSyntax`、`rewriteRelativeImportExtensions`；内部相对导入请写 `.ts` 后缀；每个新包都必须配备 `package.json`、`tsconfig.json`、`tsconfig.build.json` 与 `vitest.config.ts`。
- **Git 提交署名**：每次 `git commit` 末尾必须包含：
  `Co-authored-by: gemini-code-assist[bot] <176961590+gemini-code-assist[bot]@users.noreply.github.com>`

---

### Milestone 2：`@senkiro/fare-engine`（区域中立运价内核 + `packs/kanto-jr` + `packs/kansai` 占位）

1. **只读提取 Lab A 原型逻辑**：
   - 执行 `git show lab/a-tokyo-atlas-fare:labs/a-tokyo-atlas-fare/src/domain/fareEngine.ts`、`fareRules.ts`、`fareTariff.ts` 与 `tests/unit/fareEngine.test.ts`（26 条黄金正反例）。
   - 从 `git show lab/a-tokyo-atlas-fare:labs/a-tokyo-atlas-fare/data/processed/atlas.json` 与 `data/sources.json` 提取 72 个 JR 切片站、80 条 JR 区段及对应 `SourceRecord` 构建测试夹具，**全部转换为 v1.0 四段式 `SkId`**（`sk:station:kanto:<slug>`、`sk:operator:jp:jr-east`、`sk:operator:jp:jr-central`），并将 `inTokyoSuburbanArea` 映射为 `fareZoneTags` 中的 `'suburban:tokyo'`、`inFareSlice` 映射为 `'slice:jr-east-kanto'`。
2. **区域中立内核实现**：
   - 在 `@senkiro/fare-engine`（仅依赖 `@senkiro/contracts` 与 `@senkiro/domain-core`，零 React/DOM/Node 依赖）实现确定性报价流水线：
     ① 日期格式校验（`ERROR`）→ ② 起终点站点存在性（`MISSING_DATA`）→ ③ 起终点相同（`NOT_APPLICABLE`）→ ④ 按运算符作用域匹配规则包（无匹配 `NOT_APPLICABLE`；多包冲突 `ERROR`）→ ⑤ `validFrom`/`validTo` 生效期校验（`STALE_RULE`）→ ⑥ 规则包前置校验（如 IC 卡或切片外区段返回 `UNSUPPORTED`）→ ⑦ 实乘路径解析（支持 `pack:*` 旁路偏好）→ ⑧ `appliesTo` / `evaluate`（计费路径推导）→ ⑨ `TariffProvider` 里程查表与座席附加费。
   - **诚实性硬锁**：任何非 `OK` 报价必须通过 `createUnpricedFareQuote()` 生成，且所有输出必须经过 `assertHonestFareQuote()` 校验（`totalAmountYen === null && breakdown.length === 0`）。
3. **两大区域规则包**：
   - `packs/kanto-jr`：提供 `createKantoJrRulePack({ trackGraph, fareRuleGraph, tariffProviders? })`，完整实现 `2026-03-13` / `2026-03-14` 双版本第16条の2 幹在同一視（含品川—小田原新横滨例外）、第69条第2/3/4号特定区间、东京近郊区间（第156/157条）、`pack:saikyo_bypass` / `pack:yokosuka_bypass` / `pack:oku_bypass` / `pack:yamanote_loop_detour`、八高线地方交通线拒算与 4 类座席附加费（标明 `synthetic`）。
   - `packs/kansai`：提供诚实占位包 `createKansaiPlaceholderPack()`，在 Phase 2 规则录入前对所有请求诚实返回 `UNSUPPORTED` 与明确说明，绝不编造关西运价。
4. **M2 验收与提交**：
   - 迁移并跑通 Lab A 全部 **26+ 条**运价黄金正反例单测 + 新增区域插件隔离/多包冲突/诚实守卫测试。
   - 运行本包 `check / build / test` 全绿后执行 M2 `git commit`。

---

### Milestone 3：`@senkiro/local-db`（同构 Drizzle SQLite + OPFS Worker + Node 实库测试）

1. **安装依赖（支持离线 Store 兜底）**：
   - 执行 `pnpm --filter @senkiro/local-db add drizzle-orm @sqlite.org/sqlite-wasm`（若沙盒无外网则改用 `pnpm --filter @senkiro/local-db add --offline drizzle-orm @sqlite.org/sqlite-wasm`）。
   - **TS lib 隔离**：仅在 `packages/local-db/tsconfig.json` 设置 `"lib": ["ES2023", "WebWorker"]`，不要修改根 `tsconfig.base.json`。
2. **Drizzle Schema 与确定性手写 DDL（Zero-Codegen）**：
   - 使用 `drizzle-orm/sqlite-core` + `drizzle-orm/sqlite-proxy` 定义 6 张表：`ride_records`、`ride_segments`、`visited_stations`、`municipality_visits`、`commemorative_tickets`、`sync_oplog`（完整字段对齐 `01-domain-contract-v1.0.md` §5.5）。
   - **禁止使用 `drizzle-kit` 生成迁移文件**：手写确定性 `CREATE TABLE IF NOT EXISTS` DDL，并加入 SQLite `CHECK` 约束锁死：`non_valid_watermark = 'SAMPLE · 記念用 · 乗車不可'`、`allows_barcode = 0`、`visit_kind IN ('boarded','alighted','transferred','passed_through')`、`op IN ('upsert','delete')`。
3. **跨端驱动与业务仓库层（`LocalDbDriver` + `JourneyRepository`）**：
   - 实现统一的 `LocalDbDriver` 接口与多端适配器：
     - **Web 浏览器适配器**：基于 `@sqlite.org/sqlite-wasm` OPFS `sahpool` VFS + Dedicated Web Worker 封装；检测无 OPFS（如无痕模式/测试环境）时自动安全降级为内存 SQLite，并对外暴露 `persistenceMode: 'opfs-sahpool' | 'memory-fallback'`。
     - **移动端预留槽位**：导出清晰的 `ExpoSqliteDriverContract` 适配器接口类型（供 Phase 5 `expo-sqlite` 零重写接入）。
     - **Node / Vitest 实库驱动**：利用 `@sqlite.org/sqlite-wasm`（Node 入口）实现真实 SQLite 内存驱动，让测试跑真 SQL 而非假 Mock。
   - 实现核心仓库操作：乘车记录事务写入（自动写入 `sync_oplog` HLC 条目）、四维足迹精确聚合（到访统计 SQL 强制拼接 `@senkiro/contracts` 的 `COUNTABLE_VISIT_SQL_PREDICATE`，严禁将 `passed_through` 计入到访站或市町村点亮；线路完乘率严格调用 `computeLineCoverage`）、纪念票防伪写入校验（`assertValidCommemorativeTicket`）、完整 `.sqlite` 二进制 `Uint8Array` 导出/导入与 `.json` 备份恢复。
4. **M3 单测与全仓最终验收**：
   - 编写完整单元测试：含 `PRAGMA table_info` 对齐 Drizzle Schema 校验、`CHECK` 约束拦截非法纪念票水印/`allows_barcode = 1`、`passed_through` 防误计反例、部分区间完乘率、HLC `sync_oplog` 读写、二进制与 JSON 往返导出恢复。
   - 在工作树根目录 `E:\Workteree\SENKIRO\p0-domain-sqlite` 设置 `TURBO_FORCE=true` 运行：
     `pnpm check && pnpm build && pnpm test`
     确保全仓（`contracts` + `domain-core` + `fare-engine` + `local-db`）**0 错误 0 警告全绿通过**。
   - 更新 `docs/dispatch/reports/p0-s1-domain-sqlite.md`：状态改为 `READY_FOR_MERGE`，完整填写 `git diff --name-only 4baebcb...HEAD`、全部真实运行输出以及需要主控后续上提至 `@senkiro/contracts` 的 `## Contract Requests` 清单，并提交最终绿灯 Commit！
````
