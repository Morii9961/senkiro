# Dispatch Brief · P0-S1（Wave 1 并行 · 领域内核、插件化运价引擎与同构 SQLite 基座）

> **执行轮次**：Wave 1（需在 `P0-W0` 合入 `integration/phase-0` 后启动；与 `P0-S2`、`P0-S3` 三路并行）  
> **推荐订阅模型**：GPT / Codex  
> **基准分支**：`integration/phase-0`（已合入 `P0-W0`）  
> **新建分支**：`feat/p0-domain-sqlite`  
> **建议工作树路径**：`E:\Workteree\SENKIRO\p0-domain-sqlite`  
> **独占路径 `ownedPaths`**：
> - `packages/domain-core/**`
> - `packages/fare-engine/**`
> - `packages/local-db/**`
> - `docs/dispatch/reports/p0-s1-domain-sqlite.md`

---

## 📋 一键复制启动提示词（直接粘贴给新工作树内的 Agent）

````markdown
你正在独立 Git Worktree 中执行 SENKIRO 主线 Phase 0 Wave 1 并行任务 `P0-S1`。
请先完整阅读以下资料：
1. `docs/plan-v1.0.md`（§0.3 Alpha-SQLite 架构、§1 隔离规范）
2. `docs/01-domain-contract-v1.0.md`（《SENKIRO 全域领域契约规范 v1.0》）
3. `docs/dispatch/HANDOFF_PROTOCOL.md`
4. `packages/contracts/src/` 下的实际 TypeScript 定义

### 你的边界铁律
- **当前分支**：确认基于合入 `P0-W0` 后的 `integration/phase-0` 切出 `feat/p0-domain-sqlite`。
- **独占修改范围 `ownedPaths`**：仅允许创建/修改 `packages/domain-core/**`、`packages/fare-engine/**`、`packages/local-db/**`、`docs/dispatch/reports/p0-s1-domain-sqlite.md`。严禁修改根 `package.json`、`packages/contracts` 或他人包目录！
- **提取 Lab A 资产方式**：仅通过 `git show lab/a-tokyo-atlas-fare:labs/a-tokyo-atlas-fare/src/domain/<file>` 只读读取；严禁修改 `labs/` 或切换分支。
- **需要新增根共享依赖或契约字段时**：不要直接改根文件，写入交接报告 `## Contract Requests` 后停下交由主控处理（各包自身的 `packages/<pkg>/package.json` 可按需声明各自依赖）。
- **Git 提交署名**：每次 `git commit` 末尾必须包含：
  `Co-authored-by: gemini-code-assist[bot] <176961590+gemini-code-assist[bot]@users.noreply.github.com>`

### 分里程碑执行要求
- **M1（`@senkiro/domain-core` 泛化迁入）**：
  - 从 `lab/a-tokyo-atlas-fare` 只读提取 `graphs.ts`、`alignment.ts`、`elevationSolver.ts` 并基于 `@senkiro/contracts` 重构：
    - `TrackGraph`、`ServiceGraph`、`FareRuleGraph` 保持严格三图分离与零 React/Three 依赖；
    - 保留 `650m` 跨源空间对齐守卫（`alignment.ts`）与未对齐记录显式透传；
    - 去除所有东京站点/坐标硬编码，`elevationSolver.ts` 接收通用城市与地下层参数即可求解 $C^0$ 高程样条与垂向净空避碰；
    - 迁移并扩展单元测试，绿灯 `git commit`（M1）。
- **M2（`@senkiro/fare-engine` 去东京硬编码 + 插件化重构）**：
  - 只读提取 Lab A `fareEngine.ts`、`fareRules.ts`、`fareTariff.ts` 进行彻底解耦：
    - 核心引擎严格地区无关，通过 `RegionalFareRulePack` 与 `TariffProvider` 接口注册各区域规则；
    - 将原东京/JR 东日本・东海逻辑（`2026-03-14` 双版本第16条の2 幹在同一視、第69条第2/3/4号、东京近郊区间、`saikyo_bypass` / `yokosuka_bypass` / `oku_bypass`）整体迁入独立插件 `packages/fare-engine/src/packs/kanto-jr/`；
    - 预留关西插件接口槽位（Phase 2 由 `P2-S2` 填充 JR 西日本及关西私铁）；
    - 硬守卫：非 `OK`（`NOT_APPLICABLE | MISSING_DATA | UNSUPPORTED | STALE_RULE | ERROR`）状态 `totalAmountYen` 恒为 `null`；
    - 迁移全部 26+ 条运价黄金正反例单测 + 新增区域插件隔离测试，全部绿灯通过后 `git commit`（M2）。
- **M3（`@senkiro/local-db` 同构 SQLite OPFS + Drizzle 基座与交付报告）**：
  - 使用 `drizzle-orm` SQLite Schema 落表：`ride_records`、`ride_segments`、`visited_stations`、`municipality_visits`、`commemorative_tickets`、`sync_oplog`（完整支持 `opId`、`hlc`、`entityType`、`entityId`、`op`、`payloadJson`、`syncedAt`）；
  - 实现统一存储驱动接口 `LocalDbDriver`：
    - Web 浏览器适配器：基于 `@sqlite.org/sqlite-wasm`（OPFS `sahpool` VFS + Dedicated Web Worker 封装），并在无痕模式/无 OPFS 环境下自动安全降级至内存 SQLite 并标记持久化状态提示；
    - 移动端预留适配器接口槽位（`expo-sqlite` Driver Contract，Phase 5 接入）；
    - Node/Vitest 内存/本地测试驱动（确保 Vitest 下可直接执行真实 SQL 建表、CRUD、事务、四维防误计查询、`.sqlite` 导出导入及 `json` 备份恢复测试）。
  - 编写完整单测并运行 `pnpm --filter @senkiro/domain-core --filter @senkiro/fare-engine --filter @senkiro/local-db check && pnpm ... build && pnpm ... test` 全部通过。
  - 按 `docs/dispatch/HANDOFF_PROTOCOL.md` 撰写并提交 `docs/dispatch/reports/p0-s1-domain-sqlite.md`（`READY_FOR_MERGE`）。
````

---

## 技术约束提醒

- `packages/domain-core` 与 `packages/fare-engine` 严禁引入任何浏览器 DOM API 或 React 依赖（确保未来 Web Worker 与 React Native Hermes 100% 通用）。
- 若 5 小时窗口配额接近 95%，在当前绿灯 Commit 停下并写入 `PAUSED_QUOTA` 交接报告。
