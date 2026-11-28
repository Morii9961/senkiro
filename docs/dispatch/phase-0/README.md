# Phase 0 执行总览与多工作树派单作战图（Wave 0 → Wave 1）

> **阶段目标**：筑牢 SENKIRO Alpha-SQLite Monorepo 骨架、冻结全域领域契约 v1.0、剥离东京硬编码、统一命令式 `Three.js` 车站 3D/2D 引擎、搭建同构 SQLite OPFS 存储与三语全屏应用壳。  
> **当前集成基线分支**：`integration/phase-0`  
> **交接总规程**：请先阅读 [HANDOFF_PROTOCOL.md](../HANDOFF_PROTOCOL.md) 与 [01-domain-contract-v1.0.md](../../01-domain-contract-v1.0.md)。

---

## 1. Wave 0 → Wave 1 依赖拓扑

```mermaid
flowchart LR
    Coord0["P0-Coord (已完成)<br/>Lab A/B/C 归档 + 契约 v1.0 + 派单就绪"] --> W0["Wave 0 · P0-W0 (先行单路)<br/>feat/p0-w0-contracts<br/>根工程骨架 + @senkiro/contracts"]
    W0 --> MergeW0["主控验收并合入 integration/phase-0"]
    MergeW0 --> S1["Wave 1 · P0-S1 (并行)<br/>feat/p0-domain-sqlite<br/>domain-core + fare-engine + local-db"]
    MergeW0 --> S2["Wave 1 · P0-S2 (并行)<br/>feat/p0-station-3d<br/>station-3d + data-stations (梅田/新宿)"]
    MergeW0 --> S3["Wave 1 · P0-S3 (并行)<br/>feat/p0-ui-web-shell<br/>ui-kit + apps/web 全屏三语壳"]
    S1 --> Exit0["主控增量合入 + Exit Gate 0 全量验收"]
    S2 --> Exit0
    S3 --> Exit0
```

> **关键执行顺序**：
> 1. **先只启动 `P0-W0`**（因 `P0-S1/S2/S3` 全部依赖根 `pnpm-workspace.yaml`、`tsconfig.base.json` 和 `@senkiro/contracts`）。
> 2. **`P0-W0` 完成并合入 `integration/phase-0` 后**，再同时新建 3 个工作树并行派发 **`P0-S1` + `P0-S2` + `P0-S3`**，三路零交集、零冲突！

---

## 2. Phase 0 四张派单书索引与当前状态

| 顺序 | Session | 当前状态 | 推荐 / 接力模型 | 工作树与分支（基于 `integration/phase-0`） | 独占路径 `ownedPaths` | 派单书 / 接力书 |
| --- | --- | --- | --- | --- | --- | --- |
| **第 1 步（Wave 0）** | **P0-W0** | **✅ 已合并验收**（`75/75` 通过） | Claude | `feat/p0-w0-contracts` | 根工程配置 + `packages/contracts/**` + 报告 | [p0-w0-contracts-brief.md](./p0-w0-contracts-brief.md) |
| **第 2 步（Wave 1 并行）** | **P0-S1** | **🔄 M1/M2 完成 · Codex 推进 M3 中** | Claude → **Codex** | `E:\Workteree\SENKIRO\p0-domain-sqlite`<br>`feat/p0-domain-sqlite@6eadf35` | `packages/{domain-core,fare-engine,local-db}/**` + `pnpm-lock.yaml` + 报告 | [p0-s1-codex-relay.md](./p0-s1-codex-relay.md)（原：[p0-s1-domain-sqlite-brief.md](./p0-s1-domain-sqlite-brief.md)） |
| **第 2 步（Wave 1 并行）** | **P0-S2** | **✅ 已合并验收**（`123/123` 全仓通过 · 601,364 节点对寻路核验） | Claude → **Codex** | `feat/p0-station-3d@a6b2970`（已合入） | `packages/{station-3d,data-stations}/**` + `pnpm-lock.yaml` + 报告 | [p0-s2-codex-relay.md](./p0-s2-codex-relay.md)（报告：[p0-s2-station-3d.md](../reports/p0-s2-station-3d.md)） |
| **第 2 步（Wave 1 并行）** | **P0-S3** | **⏸ M1 (`ui-kit` 27/27) 完成 · 等 Claude 续跑** | **Claude** | `E:\Workteree\SENKIRO\p0-ui-web-shell`<br>`feat/p0-ui-web-shell@e79424a` | `packages/ui-kit/**` + `apps/web/**` + `pnpm-lock.yaml` + 报告 | [p0-s3-ui-web-shell-brief.md](./p0-s3-ui-web-shell-brief.md) |

> **契约上提队列（归入 `P0-W2-wire` Exit Gate 0 联调窗口一并升级，避免打断在途 Wave 1）**：
> - `StationHubDataset.planNorth?: PlatformSide`（来自 `P0-S2`）
> - `FareEngineRulePack` 附加钩子评估（待 `P0-S1` M3 完成提交后一并汇总）

---

## 3. 当前执行进度与下一步操作

1. **`P0-S2` 已合入 `integration/phase-0` 并通过全仓验证**（`contracts` 75 + `station-3d` 40 + `data-stations` 8 = **123/123** 通过）。
2. **`P0-S1`（`E:\Workteree\SENKIRO\p0-domain-sqlite`）** 已完成 M2 `@senkiro/fare-engine`，正在推进 M3 `@senkiro/local-db`，待其报 `READY_FOR_MERGE` 后回主控合入。
3. **`P0-S3`（`E:\Workteree\SENKIRO\p0-ui-web-shell`）** 待 Claude 续跑完成 M2/M3 `apps/web` 后回主控合入；三路齐聚后立即执行 `P0-W2-wire` 契约上提与 `Exit Gate 0` 全仓联调验收！
