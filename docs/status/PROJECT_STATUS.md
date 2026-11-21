# SENKIRO 项目状态

快照时间：2026-11-21T10:38:17+08:00 · 协议 1.1 · 项目 ID `senkiro.main` · 报告：Claude

代码基线：`main@2e3a52b`。阶段：规划中（`planning`）。整体进度不估算。

立项与原型实验阶段，尚无可用产品。三个原型只有 C（新宿站 3D）在推进：V1、V2 完成，V3 已接入新宿三丁目、新宿西口、真实时刻表和 2D 平面图，约 70 个提交仍在 claude/ 分支上未合并。原型 A、B 尚未开始，数据许可待定。

## 里程碑

| ID | 事项 | 状态 | 证据 | 人工验收 |
| --- | --- | --- | --- | --- |
| `project_setup` | 立项：仓库、AGPL 许可、品牌命名 v1.0、开发规划 v0.1 与原型共享契约 | 完成 | 仓库证据 | 不需要 |
| `lab_a_tokyo_atlas` | 原型 A：东京线路地图 | 未开始 | 仓库证据 | 待验收 |
| `lab_b_fare` | 原型 B：JR 运价规则实验室 | 未开始 | 仓库证据 | 待验收 |
| `lab_c_v1_v2` | 原型 C 新宿站 3D：V1、V2（7 站 23 层模型、全部运营方、站内路线导航） | 完成 | 已有测试 | 待验收 |
| `lab_c_v3` | 原型 C V3：新宿三丁目/新宿西口、Busta 细化、建筑精修、列车模拟、2D 平面图 | 进行中 | 已有测试 | 待验收 |
| `lab_c_timetable` | 原型 C 真实时刻表：都营两线入库，JR 只在本机，其余运营方无公开数据 | 进行中 | 已有测试 | 不需要 |
| `lab_c_merge` | 原型 C 的三条 claude/ 分支收拢并通过 PR 合并 | 未开始 | 仓库证据 | 待验收 |
| `lab_scores` | 三个原型的人工评分（docs/lab-reports/scores.md） | 未开始 | 仓库证据 | 待验收 |
| `stage0_discovery` | Stage 0：大阪—京都最小数据包、来源与许可清单、ID 规范 | 未开始 | 仓库证据 | 待验收 |

## 当前卡点

- **数据许可没有定**：ODPT 挑战赛限定数据、JR 东日本和京王网站条款是否允许公开使用都未确认；JR 时刻表只能本机抓取，原型 C 的数据暂不能公开发布。
- **原型 C 停在分支上**：三条 claude/ 分支约 70 个提交、没有 PR，main 只有初始化提交；合并目标（lab/c-shinjuku-3d 还是 main）没定。

## 下一步（本次不执行）

1. **P1 收拢原型 C 分支并开 PR**：定下合并目标后把平面图和公开版两条分支合成一个可评审的 PR。
2. **P1 启动原型 A、B**：东京线路地图与 JR 运价实验室各有可运行切片和 REPORT.md，三个原型可以一起评分。
3. **P2 在真实显卡上测原型 C 帧率**：验证任务书 60 / 30 FPS 目标；目前只有软件渲染数字。

## 需要 Morii 决定

- 原型 C 合并到 lab/c-shinjuku-3d 还是 main？三条 claude/ 分支怎么收拢？
- ODPT 挑战赛限定数据用不用、以什么身份用？JR 东日本和京王网站上的事实能否用于公开产品？
- 原型 C 的数据公开展示前由谁复核？
- 原型 A、B 何时开始？
- 规划第 10 节剩下的问题（目标用户、首批地区是否仍是大阪—京都、地图走地理精度还是示意图）何时决定？

## 依据与验证范围

- 2026-11-21 生成首份快照：只读 Git、GitHub 和仓库文档；不重跑测试、构建或真实验收
- main@2e3a52b（仓库初始化），与 origin/main 一致；GitHub 无 PR
- README.md、docs/plan-v0.1.md、docs/brand-v1.0.md、docs/00-shared-contract.md、labs/README.md
- 原型 C 分支：claude/nice-mendeleev-234068@4c8d3dc、claude/shinjuku-3d-indoor-nav-3f3cce@f07cd03、claude/plan2d-layout-fe79d9@206a0ab，均未合并
- labs/c-shinjuku-3d/REPORT.md（V1/V2）与 V3-REPORT.md：2026-11-20 记录 vitest 260 项通过、e2e 34 项中 31 项通过（1 项基准提交上同样失败）。本次未重跑
- lab/a-tokyo-atlas、lab/b-fare 与 main 相同，没有提交；lab/c-shinjuku-3d 本机另有 1 个未推送提交和 2 个未提交文件，未计入

证据位置见 [project-status.json](./project-status.json) 的 `evidence_refs`。本次只整理已有记录，`tests_rerun=false`；人工验收只转述有记录的结论，不把合并、分支或 CI 当作通过。
