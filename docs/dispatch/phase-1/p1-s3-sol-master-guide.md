# `P1-S3` 深度返工与统一视觉/架构指导手册（GPT-6.2 Sol 专用指南）

> **编制背景**：2026-11-28 主控与 Morii 对 `http://127.0.0.1:27531/kyoto/` 实机预览及 `p1-station-kyoto` 分支（`896e414` → `351c68a` → `0ebb5de` → `32588dc`）进行全面截图与源码审计。本手册综合 **OpenAI GPT-6.2 Sol 官方使用指南**、`E:\transit-station-3d` 实战经验、**Lab B (`lab/b-umeda-3d`) + Lab C (`lab/c-shinjuku-3d`) 优势融合**，给出可逐条验收的返工硬规范。  
> **权威视觉标准**：[docs/02-phase1-atlas-spec.md §6](../../02-phase1-atlas-spec.md#6-枢纽室内-3d2d-统一建筑与导视视觉规范lab-b--lab-c--senkiroui-kit-定案)  
> **基准提交**：先在 `E:\Workteree\SENKIRO\p1-station-kyoto` 执行 `git merge origin/integration/phase-1 --no-edit`（或 `git merge integration/phase-1 --no-edit`）拉入本指南后再动工。

---

## 1. 给 GPT-6.2 Sol 的执行规则（基于 OpenAI 官方 6.2 模型指南）

审计初稿 `351c68a`（仅 `38` 节点 / `51` 连接、`283×165` 尺度膨胀、零 CSS 样式、零 3D 标签）后，确认这是 `gpt-6.2-sol` 默认「极简快速收工 + 遇歧义自行保守简化」倾向所致。为彻底治本，执行本轮二期精修时必须遵守：

1. **推理深度**：请用户将 Codex 推理档位设为 **`High` 或 `Extra-High`**（多文件建筑生成器 + 空间拓扑排查需要高推理预算）。
2. **授权只读 Subagents 并行侦察**：允许你派发只读 subagents 并行完成以下调研（主工作树保持单写者避免文件冲突）：
   - Subagent A：用 `git show lab/b-umeda-3d:...` 提取梅田的 `surfaces.ts`、标签布局 `scene/labels/layout.ts`、3D 路线叠加 `scene/route3d.ts` 与 `FloorPlan.tsx`；
   - Subagent B：用 `git show lab/c-shinjuku-3d:...` 提取新宿的 `sceneTheme.ts`、`theme.ts`、`arch/{slabs,gates,platforms,vertical}.ts`、`scene/labels.ts`、`scene/routeLine.ts`、`Plan2D.tsx` 及 `styles.css`；
   - Subagent C：对照 Kyoto 四社官方页面与 `E:\transit-station-3d\transit-station-3d\references\{data-model,scene-3d,plan-2d,routing,honesty-contract}.md`，核对京都站缺失的楼梯/扶梯/地下连廊/巴士乘降区/站台门与头端方向事实。
3. **禁止极简敷衍**：每一项功能必须满足下文给出的**硬性结构指标与真实浏览器截图自证**；不设「可选跳过」——若 5 小时窗口配额逼近 95%，必须在某个完整绿灯 Step（`Step A`–`Step E`）提交点安全停机写 `PAUSED_QUOTA` 报告，绝不交半成品。
4. **严格隔离边界**：
   - `ownedPaths` 仍为 `packages/data-stations/**`、`packages/station-3d/**`、`packages/local-db/**`、`packages/fare-engine/**`、`docs/dispatch/reports/p1-s3-station-kyoto.md`；
   - **严禁改动 `apps/web/**`、根 `package.json`、`pnpm-lock.yaml`**；
   - 本地 Playwright 视觉截图一律输出至 gitignored 的 `artifacts/p1-s3-shots/`（仓库内不得留存任何未跟踪 `.png`）。

---

## 2. 对初稿（`351c68a`–`32588dc` & `/kyoto/` 实机画面）的 8 项致命病灶与手术清单

以下 8 项问题均已在 `http://127.0.0.1:27531/kyoto/` 实机截图及源码中逐一抓实，**必须全部修复**：

| # | 实机抓到的致命现象 | 代码层根因 | 必改手术方案 |
| --- | --- | --- | --- |
| **1** | **3D 缩成黑空中央一小撮；`1F` 碎成 `1/4, 2/4, 4/4, 3/4` 四条孤条；闸机/楼梯退化成微米小点** | `kyoto-topology.ts` 坐标跨度高达 `283 × 165`（梅田仅 `118 × 112`），且平行站台间距 `7–19` 单位（`> DEFAULT_JOIN_GAP = 6`），导致 `floorLayout` 把 JR 6-7、8-9、10 番全部拆碎成独立面板！ | 将京都全模型整体重缩至 **`~112 × 76`**（`x: -56..56`, `z: -38..38`, `elev: -8, -4, 0, 4, 8`）；同站平行站台净间距控制在 **`2.5–4.2` 单位（`< 6`）**，确保 **`1F` 铁道主体与 `3F` 新干线各自收敛为统一整面板**，不乱裂！ |
| **2** | **`1F 烏丸口` / `B1F` 大片消失成虚空，只剩细线和几个红绿点** | `karasuma-entrance`、`hachijo-west/east-entrance` 及 4 个地铁闸内区全被标成 `kind: 'entrance' / 'landing'`，而 `geometry.ts` 对这两类**只画一个 `0.52m` 小方块不画楼板**！ | **语义纠偏**：凡有站厅/广场地面的区域必须建为 `kind: 'concourse'` 或 `'passage'`（带真实不重叠矩形 `footprint`）；`entrance` 仅用于出口门点/巴士乘降点，严禁拿 `entrance` 当广场！ |
| **3** | **3D 模型上空布满白色蜘蛛网斜线** | `geometry.ts` 对每条同层 `passage` 都画一条从 `from.anchor` 到 `to.anchor` 的悬空细梁，跨越大矩形中心拉出大量对角斜线。 | **彻底移除跨大块 `anchor → anchor` 中心连线**！同层相邻区域通过边缘接触与矮墙开口表达连通；只有真实窄跨接桥或竖向设施上下端口才画结构。 |
| **4** | **2D 面板编号乱序（`4/4` 排在 `3/4` 前）、大量节点飘在空白面板外、`乌丸地下道/八条通道` 无字** | `panelGrid` 的列排序与面板标号取自 `layout.blocks` 索引而非排序后 `order` 索引；`StationPlan2D` 对竖向连接只要一端在本层就硬绘到任意面板内；SVG 文字无避让且字号太小。 | 按视觉左→右列序重编号面板（改用**站名归属+指北针**作标题）；竖向设施图标**严格钳制在本层实际 `place.footprint` 内**；文字字号放大、居中优先且增加防压线与缩放保护。 |
| **5** | **京都站关键空间与设施大量缺失** | 初稿仅 `38 places / 51 links`：① `B1F JR地下東口` 只连 `0番` 和 `westEastHall`，与 `2–10番` 完全断开；② `westHall` 与新干线 `11–14` 只有电梯、零楼梯/扶梯；③ `B1F` 缺 **京都ポルタ (Porta) / コトチカ** 地下街与 **JR 地下中央口**；④ `1F` 缺 **烏丸口/八条口巴士总站**；⑤ 缺 `platformDoors`、JR 头端车挡、`official_timetable` 外链，且设施全部重名叫 `'階段'`/`'エレベーター'`。 | 拆分为模块化 `src/kyoto/*.ts` 扩充至约 **95–130 `places`、160–220 `links`**：补全 JR 地下东口至各岛式站台梯道、补全西口/东跨线桥/新干线/近铁/地铁全套楼梯+扶梯+电梯、纳入 Porta/Kotochika 主通道与 JR 地下中央口、按 `roadway` + `entrance` 建乌丸口/八条口巴士总站（排除 `4F–11F` 大阶段/百货）、补核实 `platformDoors`（乌丸线 K11、新干线 11–14 等）、头端车挡（8–10/30–34/近铁 1–4）、四社时刻表外链与全站唯一中文/日文/英文设施命名。 |
| **6** | **选路线后整块站台被涂成刺眼实心紫红（`#d6336c`），切单层只剩两块浮板** | `StationSceneController.paint()` 直接把命中路径的整个 `place` 实例全部改色成 `palette.route`；切单层时 `geometry.ts` 直接 `continue` 丢弃其余全部楼层。 | 实现独立 **3D 连续朱红路线折线（`route3d.ts`：`depthTest: false` + 起点/终点竖向标柱）** 与步骤点击聚焦；非高亮楼层保留 **`opacity: 0.16` 幽灵轮廓** 提供上下文空间感；禁止把整块百米站台涂成粉红色！ |
| **7** | **3D 视角零文字标签** | `packages/station-3d` 尚未迁入 Lab B/C 的 DOM 悬浮标签层。 | 移植并融合 Lab C 3 级缩放 DOM 标签 + Lab B 1px SVG 引线（`pointer-events: none`，站台带线路色条，防抖避让）。 |
| **8** | **UI 裸奔（Win95 灰按钮、选中态无反馈、透明破框 `<dialog>`、侧栏冗长溢出）** | `packages/station-3d/src/ui/` 没有任何 CSS 文件，全靠原生 HTML 默认控件和散装 inline style。 | 编写自包含 `StationExplorer.module.css`（内嵌 `--sk-*` 回退令牌），提供清晰高对比分段控件、选中高亮楼层条、带楼层与换乘徽章的步骤条、紧凑乘客详情卡，以及带遮罩与不透明背景的来源弹窗。 |

---

## 3. 融合 Lab B + Lab C 的精准源码迁移清单（供 Subagents 只读查照）

动工前请先用 `git show` 查阅以下精确源文件（**严禁切分支，仅只读提取思路与算法，按 TS 7.0.2 + Biome 2.6.9 规范重写为干净模块**）：

| 目标模块 (`packages/...`) | Lab C 参考源码 (`git show lab/c-shinjuku-3d:...`) | Lab B 参考源码 (`git show lab/b-umeda-3d:...`) | 融合设计要点 |
| --- | --- | --- | --- |
| **`station-3d/src/theme.ts`** | `labs/c-shinjuku-3d/src/ui/theme.ts`<br>`labs/c-shinjuku-3d/src/ui/sceneTheme.ts` | — | 采用 `和纸/石墨` 三灯无阴影光棚、`paid:<operator>` 低饱和公司区分色、深色 `NeutralToneMapping`，信号色统一对齐 `--sk-color-accent` 朱红与琥珀选中色。 |
| **`station-3d/src/scene/geometry.ts`** | `labs/c-shinjuku-3d/src/ui/scene/arch/{slabs,gates,platforms,vertical,context}.ts` | `labs/b-umeda-3d/src/surfaces.ts`（仅取 `architecturalMaterial` 拼缝着色器，**不要 `osakaShed`**） | 沿 `concourse`/`passage` 生成 `0.85m` 开口矮墙与付费区边界、4 通道闸机、玻璃电梯井、楼板洞口玻璃护栏、接地软阴影、站台双轨/车挡/已核实站台门；用单材质 `onBeforeCompile` 注入微接缝。**消灭所有 `anchor→anchor` 空中斜线**。 |
| **`station-3d/src/scene/route3d.ts`** | `labs/c-shinjuku-3d/src/ui/scene/routeLine.ts` | `labs/b-umeda-3d/src/scene/route3d.ts` | 纯函数 `buildRoutePoints(dataset, route)`：相邻区域经共用边中点折线连通，绝不穿墙；渲染为连续 3D 朱红丝带/折线（`depthTest: false`）+ 起终点标杆，支持步骤聚焦与上层半透明幽灵淡化。 |
| **`station-3d/src/scene/labels.ts`** | `labs/c-shinjuku-3d/src/ui/scene/labels.ts` | `labs/b-umeda-3d/src/scene/labels/layout.ts` | 远/中/近三级缩放阈值、单层降一档、7% 回差、240px 同义去重、贪心避让 + **Lab B 1px SVG 引线**（偏移 `12–44px` 时绘制），站台标签带 4px 线色条。 |
| **`station-3d/src/plan2d/*`** | `labs/c-shinjuku-3d/src/ui/Plan2D.tsx` | `labs/b-umeda-3d/src/FloorPlan.tsx` | 独立 `<svg>` 卡片（支持单块独立拖拽+滚轮缩放）+ 全局 `＋ / − / 重置`；`scaleCap` 限制小楼层过度放大；卡片标题写「站名（去重`·`连接）+ ↑/← 北」；按视觉列序编号；竖向标记严格落在所属块矩形内；画墙线/轨道/闸机/朱红路线。 |
| **`station-3d/src/ui/*`** | `labs/c-shinjuku-3d/src/styles.css`（克制纸感/线框） | `labs/b-umeda-3d/src/ui/atoms/LineBadge.tsx` | 原创 `StationExplorer.module.css`（自包含 `--sk-*` 回退变量），高对比 `[aria-pressed="true"]`、紧凑工具条、带楼层+设施徽章的路线步骤列表、乘客向详情卡、不透明带遮罩 `<dialog>`。 |

---

## 4. 五步原子推进路线（`Step A` → `Step E`，每步绿灯提交一次）

### `Step A`：模块化重塑京都四社枢纽数据集（`packages/data-stations`）
1. 将 `kyoto-topology.ts` 拆分为 `packages/data-stations/src/kyoto/` 模块：
   - `sources.ts`（含四社官网构内图、无障碍页、**四社官网时刻表外链**、京都站ビル、KSJ N02-24）；
   - `levels.ts`（`B2F=-8, B1F=-4, 1F=0, 2F=4, 3F=8`）；
   - `jr-west.ts`（`0/2–7/8–10/30–34` 番、中央口/地下中央口/地下東口/西口/八条東口 + 跨线桥 + **JR 地下東口连接 `0` 与 `2–10` 番全梯道** + `8–10` 与 `30–34` 车挡 + 核实站台门）；
   - `jr-central.ts`（`11–14` 番站台门、八条口/八条東口/中央乗換/東乗換、每座岛式站台补齐楼梯+扶梯+电梯）；
   - `kintetsu.ts`（`1–4` 番头端站台+车挡、南北自由通路连接、完整垂直设施）；
   - `subway.ts`（`K11` 1–2 番与站台门、北/中央1/中央2/南四座检票口与梯道/电梯）；
   - `public-bus.ts`（`B1F` **京都ポルタ西/東 & コトチカ** 公共通道与 `1F 烏丸中央口` 垂直连通、`2F` 南北自由通路、`1F` 八条通/Asty Road、`1F 烏丸口バスターミナル & 八条口バス乗り場`（公交车道标 `'roadway'` 无连接、乘车区标 `'entrance'`），显式备注排除 `4F–11F` 观光大阶段/百货）；
   - `unconfirmed.ts`（无法百分百坐实的通道记入结构化 `unconfirmedConnections` 清单，绝不瞎连）；
   - `index.ts`（汇总并由 `src/kyoto.ts` 导出 `kyotoHubDataset` & `kyotoHub`）。
2. **硬性空间质量校验（写入 `packages/data-stations/tests/kyoto.test.ts`）**：
   - **坐标包络检查**：总跨度控制在 `145 × 100` 以内，`1F` 铁道群与 `3F` 新干线在 `floorLayout` 中各自只产生 **1 个主连通铁道面板**（不再碎成 `1/4..4/4`）；
   - **同层零重叠检查**：遍历 `kyotoHubDataset.levels`，同一 `ordinal` 下所有 `place.footprint` 矩形两两交集面积必须为 `0`；
   - **端到端唯一命名检查**：`places`、`links`（尤其是检票口、楼梯、扶梯、电梯）与下拉选项在 `zh-CN / ja / en` 下无模糊重名；
   - **全对寻路穷举（`N × (N - 1)`）**：`standard` 与 `step_free` 模式下跨 4 家运营商所有站台与主要出入口 100% 可达，且从不穿越 `'roadway'` 或未核实跨社直通。
3. 运行 `pnpm --filter @senkiro/data-stations check && pnpm --filter @senkiro/data-stations build && pnpm --filter @senkiro/data-stations test`，绿灯提交（`Step A`）。

### `Step B`：3D 统一沙盘建筑美学、几何细节与连续路线（`packages/station-3d/src/scene/*` + `theme.ts`）
1. 升级 `theme.ts` 与 `StationSceneController.ts`：三灯无阴影光棚、`NeutralToneMapping`（深色）、按运营商着色的低饱和 `paid:<operator>`、Lab B 世界空间拼缝着色器、紧密透视居中取景（占画布 65%–75%）、切换单层/步骤聚焦时非目标楼层保留 `opacity: 0.16` 幽灵轮廓。
2. 升级 `geometry.ts`：沿 `concourse`/`passage` 生成 `0.85m` 开口矮墙与付费区边界、4 通道闸机（票闸 vs 换乘闸双色）、玻璃电梯井与门洞、楼梯/扶梯洞口玻璃护栏、接地软阴影；**彻底删除 `anchor → anchor` 空中斜线**。
3. 新增 `route3d.ts`：绘制连续 3D 朱红路线折线（`depthTest: false`）与起终点标柱，**不再把整块站台涂成粉红色**；保留并强化几何纯函数单测（验证闸机口/通道口无墙阻挡、Draw Call 与实例数合理、Umeda/Kyoto/Shinjuku 全通过）。
4. 运行 `station-3d` 检查、构建与单测，绿灯提交（`Step B`）。

### `Step C`：3D 分级 DOM 标签 + 2D 独立分栏 SVG 升级（`labels.ts` + `plan2d/*`）
1. 新增 `packages/station-3d/src/scene/labels.ts` 并在 `StationSceneController` 挂载 `pointer-events: none` DOM 标签层 + `1px` SVG 引线：实现远/中/近三级筛选、单层降一级、7% 防闪烁回差、240px 同义合并、贪心避让、站台线路色条、选中与路线节点常驻置顶。
2. 升级 `packages/station-3d/src/plan2d/{layout.ts,StationPlan2D.tsx}`：实现单块楼层 `scaleCap`、按视觉列序编号、独立面板卡片（标题含去重站名 `·` 连接与 `↑/← 北` 指北箭头）、每面板独立拖拽平移与滚轮缩放 + 全局 `＋/－/重置`、钳制竖向标记不跑出楼层面板、绘制墙轮廓与朱红路线。
3. 更新并扩充 `plan2d.test.tsx` 与 `scene.test.ts`，绿灯提交（`Step C`）。

### `Step D`：SENKIRO 导视 CSS Modules UI 重塑（`packages/station-3d/src/ui/*`）
1. 创建 `packages/station-3d/src/ui/StationExplorer.module.css`（自包含 `--sk-*` 回退令牌，完全适配浅色和纸 / 深色石墨，同时兼容 `apps/web` 外层全局令牌注入）：
   - 紧凑顶部导视条：`3D / 2D` 分段开关、高对比高亮的楼层药丸按钮、`分层展开` 开关（仅 `All` 可用）、`重置视角`；
   - 右侧紧凑控制与详情栏（`overflow-y: auto` 限高容器内滚动，不撑爆外页）：起终点带线路提示与楼层标签、可点击跳转相机并半透明上层的路线步骤卡、乘客可读详情卡、`Sources` 弹窗（不透明面板 + 遮罩 + 自动换行防溢出）、官方外链区。
2. 运行 `pnpm check && pnpm build && pnpm test` 验证全仓（含 `data-stations`、`station-3d`、`local-db`、`fare-engine` 等，确保未破坏梅田与新宿渲染与受控 URL 接口），绿灯提交（`Step D`）。

### `Step E`：真机 WebGL Playwright 三站视觉自检与最终交接（**零改动 `apps/web` / `pnpm-lock.yaml`**）
1. 在 `packages/station-3d` 编写一次性或包内独立预览检查脚本（使用 `@playwright/test` 或根已装浏览器 + 临时静态服务，**严禁改动 `apps/web/**` 或 `pnpm-lock.yaml`**），对 **京都 (`kyoto`)、梅田 (`umeda`)、新宿 (`shinjuku`)** 三座枢纽在真实硬件/软件 WebGL2 下截取全套对照图至 **gitignored `artifacts/p1-s3-shots/`**：
   - `kyoto-{dark,light}-3d-overview.png`
   - `kyoto-dark-3d-route-stepfree.png`（`B2F` 乌丸线 → `3F` 新干线，检查连续朱红折线、3D 标签与一步聚焦）
   - `kyoto-dark-3d-1f-cutaway.png` & `kyoto-dark-3d-exploded.png`
   - `kyoto-{dark,light}-2d-1f.png` & `kyoto-dark-2d-b1f.png`（检查单面板聚合、无重叠文字、站名标题、指北针）
   - `kyoto-dark-sources-dialog.png`（检查弹窗遮罩、不透明背景、无文字溢出）
   - `umeda-dark-3d-overview.png` & `shinjuku-dark-3d-overview.png`（确认无退化）
2. **你必须亲自用视觉读取每一张生成截图**！若发现任何文字压线、按钮高亮不清、模型偏小、悬空线或弹窗穿底，立即就地修复并同机位重拍对比。
3. 核查 `git status --short` 确认零 `.png` 或临时截图脚本污染仓库，运行全仓 `pnpm check && pnpm build && pnpm test`，记录真实命令输出与 `Draw Call / Triangles / 路线对数` 至 `docs/dispatch/reports/p1-s3-station-kyoto.md`（`Status: READY_FOR_MERGE`）并提交。
