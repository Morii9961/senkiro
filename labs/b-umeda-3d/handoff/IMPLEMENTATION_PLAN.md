# IMPLEMENTATION_PLAN · 分阶段实现计划

> 24 个小任务，每个可独立运行、截图、测试、验收。验收用例编号（AT-…）见 `ACCEPTANCE_TESTS.md`。
> 规模：S ≤ 半天 · M ≈ 1 天 · L ≈ 2 天（仅作排序参考）。
> **一次只做一个任务，做完按 SOL_HANDOFF §5 的模板报告，再开下一个。**

## 0. 依赖总览

```
T1 选择脊柱+高亮+重建隔离 ─┬─ T2 设施索引 ─┬─ T9 详情框架(platform) ─ T10 其余类型 ─┐
                          │              ├─ T12 搜索                              │
                          │              └─ T13 路线面板 ─ T14 3D路线 ─ T15 检查脚本 │
                          ├─ T3 URL+App拆分                                         │
                          └─ T5 标签数据抽出 ─ T6 布局引擎 ─ T7 缩放带/层 ─ T8 遮挡    │
T4 线路表+LineBadge（独立；T7/T9/T12 引用）                                          │
T11 站台方向/出口等数据录入（独立数据任务；T9/T10 显示其结果）                        │
T16 轨道路径 ─ T17 车辆 ─ T19 模拟引擎 ─ T20 列车交互 ─ T21 真实时刻（需用户决定）    │
T18 时刻契约+Demo+模式UI ──────────────┘                                            │
T22 2D 增强 ← T1,T4 · T23 统一(楼层/主题/移动/a11y) ← T9,T7 · T24 收尾 ← 全部
```

关键路径：**T1 → T2 → T9 → T13 → T14**（乘客价值最大）；标签线 T5→T8 可与之交错；列车线 T16–T21 放在 P0–P3 之后，**不得先做列车**。

## 1. 决策门（需要用户回答，Sol 不得自行决定）

| 门 | 问题 | 阻塞 | 默认做法（未回答时） |
|---|---|---|---|
| G1 | `src/shop-windows.jpg`（AI 生成贴图，628 kB，已入库）保留/程序化/移出？ | T24 | 保留不动，T24 报告里再问 |
| G2 | 哪些运营商时刻表允许"仅本地使用"？ | T21 | 只做 Demo Fixture 与接口，不抓取任何运营商网页 |
| G3 | 线路识别色的来源是否可接受"公开资料人工录入"？ | T4 的上色部分 | 色全 `null`，中性徽章 |
| G4 | 是否需要中文界面？ | 无 | 不做 |

## 2. 任务清单

### P0 · 地基（先做；基本不改变视觉）

**T1 · 统一选择状态 + 3D 高亮/淡化/镜头聚焦 + 场景重建隔离（M–L）** ← **第一项任务，全文见 SOL_HANDOFF §4**
- 目标：`selection` 成为唯一选择状态；点站台/检票口/通道/出口/设施，3D 立即高亮、其余淡化、镜头缓动聚焦；任何与几何无关的状态变化不重建场景。
- 改：新增 `src/state/selection.ts`；`src/Scene.tsx`（props 绑定 `987–989`、`rebuild` 的 refit/key、`owners[]`、指针 `882–918`、新增 appearance/camera 缓动）；`src/main.tsx`（`picked → selection`，保留现有卡片外观）。
- 依赖：无。AT：PERF-01/02、SEL-01…05。风险：R1、R2。

**T2 · 设施索引与派生关系（M）**
- 目标：`src/domain/index.ts`（DATA_CONTRACTS §5）：`gateView / platformView / exitView / verticalView / ownersOf / relatedTargets`，纯函数 + Vitest 黄金用例。
- 改：新增 `src/domain/index.ts`、`tests/index.test.ts`。不改现有类型语义。依赖 T1。AT：DET-09、SEL-06。

**T3 · URL 状态 + App 拆分（M）**
- 目标：`src/state/url.ts` 往返恒等；把 `main.tsx` 拆成 `ui/panels/*`、`ui/controls/*`，**行为与外观不变**（Playwright 原 4 项必须仍通过）。
- 依赖 T1。AT：URL-01…03、BASE-01。风险：R3（拆分引入回归）。

**T4 · 线路表 + LineBadge + 线色来源检索（M）**
- 目标：`data/manual/lines.ts`（DATA_CONTRACTS §2）、`LineBadge`、校验；**移除** `Scene.tsx:521–528` 的硬编码三色；线路色先找来源（G3），找不到则 `null`。
- 依赖：无（G3 影响上色）。AT：LINE-01…03、HON-01。

### P1 · 标签系统

**T5 · 标签数据生成抽出（M）**
- 目标：`src/scene/labels/build.ts`：`(model, view, selection, route) → SceneLabelSpec[]`，行为与现状对等（先不改视觉）；删除几何循环里的 `label(...)`。
- 依赖 T1。AT：LBL-00（对等性：总览下可见标签集合与改前一致，容许顺序差异）。

**T6 · 布局引擎（L）**
- 目标：`layout.ts` 纯函数 + 单测（UX_SPEC §5.3：优先级、位移候选、引导线、钳制、簇、同义折叠、预算、稳定性）；接入并替换 `draw()` 的 `placed.some(...)`（`Scene.tsx:174–201`）。
- 依赖 T5。AT：LBL-02…05、LBL-08。风险：R4。

**T7 · 缩放带、回差、表示の深さ、视觉规范（M）**
- 目标：`config.ts`（Z1/Z2 标定）、`detail` 切换控件、L1–L4 样式 token（UI_COMPONENTS §3）。
- 依赖 T6，T4。AT：LBL-01、LBL-06、LBL-07、UI-03。

**T8 · 遮挡代理（M）**
- 目标：`occlusion.ts`：楼板 AABB + 外壳屋顶代理，相机静止后批量判定；L0 被遮挡时淡化。
- 依赖 T6。AT：LBL-04。

### P2 · 详情与搜索

**T9 · 详情框架 + 站台页 + 侧栏/抽屉（L）**
- 目标：`DetailSheet`、`describe/platform.ts`、侧栏固定布局（移除浮卡）、`UnknownValue`/`FieldRow`。
- 依赖 T2，T4（T11 的数据到位后站台页才有方向行）。AT：DET-01…03、DET-08。

**T10 · 其余类型的详情（L）**
- 目标：gate / passage / entrance / vertical / station / line 的 `describe`；关系列表点击即 `select`。
- 依赖 T9。AT：DET-04…07、SEL-04。

**T11 · 站台方向、出口、相邻站数据录入（M，数据任务，可并行）**
- 目标：`data/manual/{services,exits}.ts`，只录有来源的；每条登记 SourceRecord；`data:build` 校验；缺失的列入 REPORT「未核实清单」。
- 依赖：无。AT：DET-08（缺失显示未確認）、HON-02。风险：R6。

**T12 · 搜索（M）**
- 目标：`domain/searchIndex.ts` + `SearchPanel`；结果即 `select()`；`↳` 设起/终点。
- 依赖 T2。AT：SRCH-01…05。

### P3 · 导航

**T13 · 路线面板重做（M）**
- 目标：`planRoute`、`RouteSlots/Summary/StepGroup`、无台阶阻断原因；移除长 `<select>`（保留为 sr-only 后备）。
- 依赖 T2，T12。AT：NAV-01…04、NAV-07。

**T14 · 3D 路线呈现（L）**
- 目标：全層下连续折线（沿 Link 端点）、竖向升降段、楼层牌、逐段取景加缓动、`FloorChangeBanner`。
- 依赖 T13。AT：NAV-05、NAV-06、NAV-08。风险：R2。

**T15 · 路线一致性检查脚本（S）**
- 目标：`scripts/check-routes.ts`（两两端点复查、竖向跨度、"画出来的=图里的"），纳入 `npm test`。
- 依赖 T13。AT：NAV-09。

### P4 · 列车与时刻（**P0–P3 全部验收之后才开始**）

**T16 · 轨道路径（M）**：`deriveTrackPaths` + 校验 + 仅调试显示。AT：TRN-01、TRN-02。
**T17 · 车辆注册表与程序化车体（L）**：`vehicles.ts` + 车体生成器（按类别区分、unknown 中性），带预览页（`?preview=vehicles`，仅开发）。AT：TRN-03、HON-03。
**T18 · 时刻契约、校验、Demo Fixture、模式 UI（M）**：移植新宿契约（不移植数据），`FeedMode`，`SimBanner`，默认 off。AT：TT-01…04、HON-04。
**T19 · 模拟引擎与列车渲染（L）**：纯函数位置模型 + 实例化渲染（单独 InstancedMesh，不重建主场景），时钟按需 rAF。AT：TRN-04…06、PERF-03。
**T20 · 列车交互（M）**：选中/卡片/追踪镜头/站台页联动（列车到站信息）。AT：TRN-07、TRN-08、SEL-05。
**T21 · 真实时刻数据（L，需 G2）**：逐个运营商核对条款 → 入库或仅本地；覆盖统计脚本；报告已知不准之处。AT：TT-05、HON-05。

### P5 · 2D、统一与收尾

**T22 · 2D 增强（M）**：标签、线路色、选择联动、点击；复用 `FloorPlan` 分块。AT：2D-01…03。
**T23 · 统一（L）**：`FloorControl`（3D/2D 共用）、暗色场景主题、移动端抽屉、键盘与 aria-live。AT：UI-01…05。
**T24 · 收尾（M）**：性能测量、REPORT 更新、公开版清理、G1 决定落地。AT：REL-01、PERF-04。

## 3. 每个任务的"完成"定义（通用）

1. `npm run build && npm test` 通过，且任务专属 AT 通过（脚本化的跑脚本，需肉眼的有同机位前后截图）。
2. 不重建/不改 Astra 的建筑文件（`architecture.ts / buildings.ts / surfaces.ts / signage.ts / shopWindows.ts`）——如确需小改，单独提交并说明。
3. 所有新数据有来源；缺失字段 UI 显示「未確認」；合成数据三处标注。
4. 新增纯函数有单测；新增交互有 Playwright 用例（对**生产构建**运行）。
5. 更新 `REPORT.md` 里受影响的段落，只写真实运行结果；没跑的写"未运行"。
6. 提交信息英文，结尾 `Co-Authored-By` 行；不推送，除非用户说可以。

## 4. 风险登记

| ID | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | 改实例色与 `surfaces.ts` 的自定义材质（`onBeforeCompile` + `finish` 属性）互相影响，导致材质变色 | 破坏 Astra 的观感 | 先写一个只改 `instanceColor` 的最小实验并拍同机位对比；淡化用向背景混合，不改 `finish`；选中外轮廓走独立网格。读码已确认：材质是 `MeshStandardMaterial`，着色器在 `color_fragment` 之后对 `diffuseColor` 做程序化纹理乘算，所以 `instanceColor` 可用；但 `finish===8`（灯）在 `emissivemap_fragment` 里**加自发光**，淡化后灯仍会亮——可接受，或给着色器加一个 `uDim` uniform 衰减自发光（需改 `surfaces.ts`，须单独提交并说明） |
| R2 | 软件渲染（SwiftShader）下动画帧率极低（Astra 实测约 3.3 fps），缓动/高亮插值难以验证 | 误判"卡" | 用 `data-frame` 计数与固定步长的测试钩子；不依赖帧率判断功能；用 `prefers-reduced-motion` 路径做确定性断言 |
| R3 | 拆分 `main.tsx` 引入回归 | 导航/楼层行为变坏 | T3 只搬不改；原 4 项 Playwright 必须仍通过；拆前先加 3 个快照用例 |
| R4 | 标签布局在高密度区仍然拥挤 / 性能差（101 个 DOM 每帧测量） | 体验与卡顿 | 布局只在相机静止后完整运行；拖动中降频；尺寸缓存（`offsetWidth` 只在文本变化时读） |
| R5 | 遮挡代理与真实几何不符，导致误剔除 | 该显示的标签消失 | 代理偏保守（只剔除明确被上层楼板盖住者）；提供 `?debug=labels` 叠加显示代理盒 |
| R6 | 站台方向/线色等资料找不到或被站点拒绝访问 | 数据缺口 | 按"广泛检索"原则找多个公开来源；仍无则 `null`；**不绕过反爬**，被拒就停并请用户手动保存页面；记入 REPORT |
| R7 | 时刻表条款不允许再分发 | 不能入库 | 走 §1 G2；默认 Demo-only |
| R8 | Sol 与 GPT 的未提交改动冲突 | 合并困难 | SOL_HANDOFF §3：开工前 `git status`；在 Sol 自己的分支上做；不改 Astra 的建筑文件 |
| R9 | 范围蔓延（想一次做完"成熟产品"） | 无法验收 | 严格按任务逐个交付；任务外的想法写进 REPORT「后续」 |
| R10 | 用示意坐标推算距离/转向/时间 | 违反诚实契约 | 契约 §1；AT-HON 系列自动检查文案中不出现无来源的数字单位（分/m） |

## 4.1 已知的实现提示（读码得出）

- `Scene.tsx` 的 `rebuild(p)`：`refit` 变量决定是否重新计算 `bounds`；`owner` 局部变量在几何循环里随对象切换，`block()` 每调用一次就把当前 `owner` 压进 `owners[]`——这是**拾取与高亮的数据基础**，重构时必须保持"每个实例有且只有一个 owner"。
- 楼梯、电梯的 owner 是 `Link.id`；站台的钢轨/道床/站台边条的 owner 是站台 `Place.id`；Concourse 墙体的 owner 是该 Concourse。选中**站台**时高亮 owner===platformId 的实例即可连同轨道一起亮。
- `label()` 创建的 `.pin` 把 `data-owner` 写成当时的 `owner`；站名牌借用了站台的 owner（缺陷，见 CURRENT_STATE §3.3）。T5 要给站名牌自己的 `targetKind:'station'`。
- `tests/browser/station.spec.ts` 用 `.pin[data-owner=…]` 选标签；T5/T6 若改类名，需保留 `data-owner` 兼容或同步改测试（并说明）。
- 数据文件 `data/processed/station.json` 与 `SOURCES.md` 是生成物：改了 `data/manual/*` 必须跑 `npm run data:build` 并一起提交，否则 `data:check` 会让构建失败。
- 端口：开发预览避开 5183（新宿预览）与 4173（系统保留）；Playwright 默认 27193（`SENKIRO_E2E_PORT` 可改）。
- Windows 下 `npm test` 的 Playwright 依赖本机 Chromium；`scripts/browser.mjs` 的探测顺序见 `README.md`。
