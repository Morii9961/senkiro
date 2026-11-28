# SENKIRO 项目状态

快照时间：2026-11-28T23:16:00+08:00 · 协议 1.1 · 项目 ID `senkiro.main` · 报告：Claude（`P1-Coord` 总控调度，接替 Gemini）

代码基线：`main@0f7b764`（Exit Gate 0 合入点）→ `integration/phase-1@82ea02a`。阶段：**Phase 1 Wave 1 合入中**（`phase_1_wave_1_merging`）。整体进度不估算。

**`P1-S2`（SENKIRO Atlas UI）已核验并以 `--no-ff` 合入 `integration/phase-1`（`82ea02a`）。** 主控在合入点清缓存复跑：Biome 220 文件 0 错 0 警，8 个项目 typecheck / build 全部通过，全仓 364/364 单测，Playwright 20/20（硬件 GPU）。交付内容：`ui-kit/base.css` 进入生产构建；本地数据库探针区分“不支持”与“被其他标签页占用”；P0-W2 遗留 #2、#4–#10 清零；MapLibre 5 + PMTiles 独立懒加载地图引擎（离线绘制、深浅双主题）；运营商筛选；三语 / 假名 / 站号搜索（“京都”“河原町”不混同）；线路、车站、复合体、直通四类百科条目。`P1-S1` 已交付待核验，`P1-S3` 京都站二期精修进行中。

## 里程碑

| ID | 事项 | 状态 | 证据 | 人工验收 |
| --- | --- | --- | --- | --- |
| `project_setup` | 立项与 Master Plan v1.0（Gate 0 D-01～D-05 决策锁定） | 完成 | 仓库证据（`main@e3cba60`） | 不需要 |
| `lab_a_archive` | Lab A 归档：`lab/a-tokyo-atlas-fare@9790e55` | 完成 | 仓库证据 + 自报告 | 已收口归档 |
| `lab_b_archive` | Lab B 归档：`lab/b-umeda-3d@b2ed773` | 完成 | 仓库证据 + 自报告（保留 `umeda-*` 未动） | 已收口归档 |
| `lab_c_archive` | Lab C 归档：`lab/c-shinjuku-3d@19b2daa` | 完成 | 仓库证据 + 自报告 | 已收口归档 |
| `lab_scores` | 三原型归档评审（`docs/lab-reports/scores.md`） | 完成 | 仓库证据 | 不需要 |
| `exit_gate_0` | Exit Gate 0：Phase 0 全部五分支合入 `main@0f7b764`（307/307 单测 + 10/10 E2E） | 完成 | 主控复跑验证 | 已验收 |
| `p1_coord_spec_dispatch` | Phase 1 Wave 0 (`P1-Coord`)：冻结关西 ID / PMTiles / 许可规范并发布 Wave 1/2 派单体系 | 完成 | `docs/02-phase1-atlas-spec.md` + `docs/dispatch/phase-1/README.md` | 不需要 |
| `p1_s1_data_kansai` | Wave 1 (`P1-S1`)：`data-pipeline` + `data-kansai`（8 社 + `.pmtiles` + 关东预览） | 已交付，待主控核验 | 用户告知已完工；交接报告待转交 | 待验收 |
| `p1_s2_atlas_ui` | Wave 1 (`P1-S2`)：`SENKIRO Atlas` MapLibre UI + `ui-kit/base.css` 与 Web 修复 | **完成**（`82ea02a`） | 主控复跑：364/364 单测 + 20/20 E2E；[报告](../dispatch/reports/p1-s2-atlas-ui.md) | 已验收（E2E 截图目视） |
| `p1_s3_station_kyoto` | Wave 1 (`P1-S3`)：京都四社复合体 3D/2D 数据包 + Worker/Engine 加固 | 二期精修中 | [Sol 深度指南](../dispatch/phase-1/p1-s3-sol-master-guide.md)；工作树有未提交的 Step A 改动 | 待交付 |
| `p1_w2_exit_gate_1` | Wave 2 (`P1-W2`)：跨包接线、京都激活与 Exit Gate 1 多浏览器 E2E | 待汇合 | [p1-w2-exit-gate-brief.md](../dispatch/phase-1/p1-w2-exit-gate-brief.md) | 待验收 |

## 下一步

1. 主控核验 `P1-S1`（`feat/p1-data-kansai`）并合入。该分支同样改动 `pnpm-lock.yaml`，若与 `P1-S2` 冲突，由主控在集成分支执行 `pnpm install --lockfile-only` 消解。
2. `P1-S3` 按 Sol 指南完成 Step A–E 后交付，主控核验合入。
3. Wave 1 三路全部合入后启动 `P1-W2`。`P1-S2` 合入时发现的 6 项接线与收尾事项已写入 [Phase 1 README §5.2](../dispatch/phase-1/README.md)。

## 依据与验证范围

- 本轮在 `integration/phase-1@82ea02a` 实跑：`pnpm install --offline --frozen-lockfile`、`pnpm check --force`、`pnpm build --force`、`pnpm test --force`（364/364）、`pnpm --filter @senkiro/web test:e2e`（20/20，Chromium 硬件 GPU）。
- 未覆盖：真实 `.pmtiles` 在浏览器中的加载（`P1-S1` 尚未合入）、地图画布点击拾取的端到端断言、跨标签页 `pool-busy` 实况（待 `P1-S3` Worker 回传原因）、Firefox / WebKit / 软件渲染（属 `P1-W2` 范围）。
- 证据路径见 [project-status.json](./project-status.json) 与 [P1-S2 交接报告](../dispatch/reports/p1-s2-atlas-ui.md)。
