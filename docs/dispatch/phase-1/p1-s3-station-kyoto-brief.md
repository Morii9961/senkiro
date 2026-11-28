# Dispatch Brief · `P1-S3`（Wave 1 并行 · 京都站四社复合体 3D/2D 数据包 `[REP-01]` + Worker/引擎加固）

> **执行轮次**：Wave 1（与 `P1-S1`、`P1-S2` 三路并行，基于 `integration/phase-1`）  
> **推荐订阅模型**：GPT / Codex（建模、图拓扑、寻路穷举与 Worker/Engine 加固）  
> **基准分支**：`integration/phase-1`  
> **新建分支**：`feat/p1-station-kyoto`  
> **建议工作树路径**：`E:\Workteree\SENKIRO\p1-station-kyoto`  
> **二期视觉/数据深度精修指南（必读）**：[p1-s3-sol-master-guide.md](./p1-s3-sol-master-guide.md) & [02-phase1-atlas-spec.md §6](../../02-phase1-atlas-spec.md#6-枢纽室内-3d2d-统一建筑与导视视觉规范lab-b--lab-c--senkiroui-kit-定案)  
> **独占路径 `ownedPaths`**：
> - `packages/data-stations/**`
> - `packages/station-3d/**`
> - `packages/local-db/**`
> - `packages/fare-engine/**`
> - `docs/dispatch/reports/p1-s3-station-kyoto.md`

---

## 📋 一键复制启动提示词（直接粘贴给新工作树内的 Agent）

````markdown
你正在独立 Git Worktree 中执行 SENKIRO Phase 1 Wave 1 并行任务 `P1-S3`（`[REP-01]` 京都站四社复合体 3D/2D 数据包 + `local-db`/`station-3d`/`fare-engine` 加固）。
请先完整阅读以下基线资料：
1. `docs/02-phase1-atlas-spec.md`（**最核心**：§2.1–§2.3 冻结的 `sk:complex:kansai:kyoto` 四社车站 ID 与强制 `explicitlyExcluded` 红线、§5.3 OPFS 降级原因协议）
2. `docs/01-domain-contract-v1.0.md`（§1 诚实性规则、§5.2 `StationGraph` / `StationHubDataset` / `planNorth`）
3. `docs/dispatch/phase-0/README.md` §4（你负责的 P0-W2 遗留修复清单）
4. `docs/dispatch/HANDOFF_PROTOCOL.md`
5. 现有源码：`packages/data-stations/src/umeda.ts`、`packages/data-stations/src/shinjuku.ts`、`packages/data-stations/package.json`、`packages/station-3d/src/graph/validate.ts`、`packages/station-3d/src/ui/StationExplorer.tsx`、`packages/local-db/src/sqlite.worker.ts`、`packages/local-db/src/driver.ts`、`packages/fare-engine/src/route.ts`、`packages/fare-engine/src/pack.ts`
6. 如可用，遵循 `transit-station-3d` 技能工作流（诚实性、只读官方构内图事实不描图不入库、全对路由/无台阶穷举）。

### 你的边界与工具链铁律
- **分支与工作树**：确认在基于 `integration/phase-1` 切出的 `feat/p1-station-kyoto` 分支上作业；开干前先跑 `pnpm install --offline --frozen-lockfile`。
- **独占路径 `ownedPaths`**：仅允许创建/修改 `packages/data-stations/**`、`packages/station-3d/**`、`packages/local-db/**`、`packages/fare-engine/**` 及 `docs/dispatch/reports/p1-s3-station-kyoto.md`。**严禁**修改 `packages/contracts/**`、`packages/ui-kit/**`、`apps/web/**`、根 `package.json`、`pnpm-lock.yaml`！
- **诚实性与版权红线**：
  - 官方构内图（JR西日本、JR東海、近鉄、京都市交通局）只可查证客观站内事实（楼层、番线、付费区、检票口、垂直设施连通性），**严禁复制或内嵌任何官方图片、SVG 或大段原文**，通过 `SourceRecord` 与 `StationExternalLink` 指向官方外链；
  - 实测距离与步行时间在无实测来源前，`distanceMeters` / `durationMinutes` 恒为 `null`；无障碍未核实连接 `stepFree` 必须填 `null`，不可瞎填 `true`；不确定但合理的连接标记 `connection: 'inferred'`，绝不可静默穿越 `'roadway'` 或未核实跨社付费区。
- **TypeScript 7.0.2 & Biome 2.6.9**：严格无 `any`、无 `!` 非空断言、无 `console.*`、无 `.forEach`、相对导入带 `.ts`/`.tsx` 扩展名；遵守 `exactOptionalPropertyTypes: true`。
- **Git 提交署名**：每次 `git commit` 末尾必须包含：
  `Co-authored-by: gemini-code-assist[bot] <176961590+gemini-code-assist[bot]@users.noreply.github.com>`

### 分里程碑任务拆解

#### M1：Phase 0 审查遗留项加固（`local-db` / `station-3d` / `fare-engine`）
按 `docs/dispatch/phase-0/README.md` §4 优先清零这 4 项轻量加固：
1. **`packages/local-db`（必修 #3 Worker 侧）**：
   - 保持 `WebPersistenceMode = 'opfs-sahpool' | 'memory-fallback'` 向后兼容；
   - 在 `driver.ts`（`ManagedSQLiteDriver`）、`web-protocol.ts`、`sqlite.worker.ts`、`web.ts` 扩展可选字段 `persistenceFallbackReason?: 'unsupported' | 'pool-busy' | 'unknown'`：
     - `sqlite.worker.ts` 在 `installOpfsSAHPoolVfs` 失败时捕获异常并分类：缺少 OPFS / `createSyncAccessHandle` 返回 `'unsupported'`；若报错特征显示被其他标签页占用 SAH pool / `AccessHandle` / `NoModificationAllowedError` / `state` 锁冲突则返回 `'pool-busy'`；其余返回 `'unknown'`；`opfs-sahpool` 成功时为 `undefined`；
     - 在 `packages/local-db/tests/` 新增单测验证降级分类逻辑与协议向后兼容。
2. **`packages/station-3d`（小项 #3）**：
   - 修复 `packages/station-3d/src/ui/StationExplorer.tsx:145` 附近受控楼层联动：当外部 `level` prop（如浏览器前进/后退）将激活楼层切为非空具体楼层时，同步将内部 `explodedState` 重置为 `false`，确保后续切回“全部楼层”时不会幽灵复活分层展开状态；
   - 在 `packages/station-3d/tests/explorer-controlled.test.tsx` 补测该行为。
3. **`packages/fare-engine`（小项 #1 & #2）**：
   - 修复 `src/route.ts:81`：对于 `resolveRoutePreference` 返回的任何带 `'status'` 属性的对象执行 fail-closed 拦截（合法 `FareRuleRejection` 原样转发，畸形拒绝对象转为 `ERROR` quote，绝不放行进入计价）；
   - 更新 `src/pack.ts:23` 处 `@deprecated FareRoutingOptions` 注释，准确说明其现已等同 `FareRulePreferencePlan`（不再兼容 `search` 字段）；
   - 补充单测覆盖该 fail-closed 防线。
4. 运行上述三包检查与测试，绿灯后 `git commit`（M1）。

#### M2：构建京都站四社复合体 3D/2D 数据包（`@senkiro/data-stations/kyoto` · `[REP-01]`）
1. **严格对齐 `docs/02-phase1-atlas-spec.md` §2.3 冻结契约**：
   - `complex.id`: `'sk:complex:kansai:kyoto'`，坐标 `[135.75876, 34.98562]`，`wardOrCity: '京都市下京区'`；
   - **`stations` 严格仅含以下 4 座独立车站**：
     1. `sk:station:kansai:jr-west-kyoto`（JR西日本 京都駅：`0番` びわ湖/北陸特急、`2–7番` JR京都/琵琶湖/神戸線、`8–10番` 奈良線、`30–34番` 嵯峨野線/はるか；对应线 ID：`jr-west-kyoto`, `jr-west-biwako`, `jr-west-nara`, `jr-west-sagano`, `jr-west-kosei`, `jr-west-tokaido-express`）
     2. `sk:station:kansai:jr-central-kyoto`（JR東海 京都駅 東海道新幹線：`11–12番` 上り東京方面、`13–14番` 下り新大阪・博多方面；线 ID：`jr-central-tokaido-shinkansen`）
     3. `sk:station:kansai:kintetsu-kyoto`（近鉄 京都駅：`1–4番` 頭端式站台；线 ID：`kintetsu-kyoto`）
     4. `sk:station:kansai:kyoto-subway-kyoto`（京都市営地下鉄 烏丸線 京都駅 `K11`：1面2線岛式站台；线 ID：`kyoto-subway-karasuma`）
   - **强制写入 `explicitlyExcluded`**：
     - `阪急 京都河原町駅`（`sk:station:kansai:hankyu-kyoto-kawaramachi`，约 2.3 km 东北，四条河原町商圈，绝非京都站）
     - `京阪 祇園四条駅`（`sk:station:kansai:keihan-gion-shijo`，约 2.4 km 东北，鸭川东岸）
     - `阪急 烏丸駅 / 地下鉄 四条駅`（北侧两站，独立复合体）
     - `京阪 七条駅`（鸭川东岸约 1.1 km，JR↔京阪铁道换乘在東福寺）
2. **立体空间拓扑与付费区建模（`packages/data-stations/src/kyoto.ts` 等）**：
   - 坐标系保持东西向主体横铺（推荐与梅田一致 `planNorth: 'z-'`，即北侧烏丸口方向为 `-z`、南侧八条口方向为 `+z`、东侧鴨川/山科方向为 `+x`、西侧梅小路/大阪方向为 `-x`，确保 2D 横向分栏清晰可读）；
   - 合理归并跨运营商垂直层级（`B2F` 烏丸線站台 → `B1F` 地下铁北/中央/南改札及乌丸/八条地下自由通路、JR地下東口 → `1F` JR在来线地面站台 `0/2–10/30–34` + 中央口 + 八条東口 → `2F` 南北自由通路（非付费区脊梁）+ 西口改札 + 近鉄京都駅高架改札与站台 + JR東海新幹線八条改札与中央/東新幹線乘换改札 → `3F` 東海道新幹線高架站台 `11–14`）；
   - 严格区分 5 个付费域：`'unpaid'`、`'paid:jr-west'`、`'paid:jr-central'`、`'paid:kintetsu'`、`'paid:kyoto-subway'`；明确区分票闸（`gateKind: 'ticket'`）与直通换乘闸（`gateKind: 'transfer'`，如 JR在来线↔新幹線中央/東乘换口；无法直接闸内直通的社际连接一律走 `'unpaid'` 自由通路）；
   - 完整配备中日英三语名称（未核实部分写 `null`）、各垂直设施 `stepFree` 电梯标识与 `SourceRecord`、`StationExternalLink[]`。
3. 更新 `packages/data-stations/package.json`（新增 `./kyoto` 导出条目，同步 `publishConfig.exports`）与 `packages/data-stations/src/index.ts`（导出 `kyotoHub` 与 `kyotoHubDataset`）。
4. 绿灯后 `git commit`（M2）。

#### M3：校验、全对常规/无台阶寻路穷举测试、3D/2D 渲染验证与交接报告
1. 在 `packages/data-stations/tests/` 新增京都站完备测试套件：
   - `validateStationHubDataset(kyotoHubDataset)` 零错误；
   - 验证 `complex.stationIds` 严格 4 站、`explicitlyExcluded` 明确排除 `京都河原町` 与 `祇園四条`、`planNorth` 已声明；
   - **全对寻路穷举不变量测试（`N × (N - 1)`）**：遍历京都站全部站台/主要入口节点对，验证 `standard` 与 `step_free`（只走电梯）模式下跨 4 家运营商均 100% 可达，且从不穿越 `'roadway'` 或非法付费区跳转；
   - 使用 `@senkiro/station-3d` 对 `kyotoHubDataset` 执行 `<StationExplorer />` 与 `<StationPlan2D />` 渲染冒烟测试（含三语与深浅色主题切换）。
2. 在工作树根目录运行 `pnpm check && pnpm build && pnpm test`，确认全仓通过。
3. 按 `docs/dispatch/HANDOFF_PROTOCOL.md` 撰写并提交 `docs/dispatch/reports/p1-s3-station-kyoto.md`（`READY_FOR_MERGE`）。
````
