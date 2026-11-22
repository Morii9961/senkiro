# SOL_HANDOFF · 给 GPT-6.2 Sol 的交接说明

> 读者：GPT-6.2 Sol（工程实现者）。作者：Claude Sonnet 5.5（产品/交互/架构交接）。
> 本文很短，是入口。细节在同目录其他文档里，**不要凭本文直接开工，先读 §2 的清单。**

## 0. 给用户（转交方式）

1. 这批文档在分支 `claude/umeda-handoff-ab4a62` 的 `labs/b-umeda-3d/handoff/`（只含文档，没有改动任何源码）。该分支**未推送**。
2. 交给 Sol 的办法二选一：①把 `handoff/` 整个目录复制进 Sol 的检出（`E:/SENKIRO/labs/_worktrees/umeda-b/labs/b-umeda-3d/handoff/`）；②你亲自决定把该分支合到 Sol 的工作分支。**合并与推送都由你决定**，我没有做。
3. 把 §4 的方框内容整段复制给 Sol 即是"第一项任务"。Sol 完成后把它的阶段报告发回来，由我（或你）验收，再发下一项（`IMPLEMENTATION_PLAN.md` 的 T2…）。
4. 有 4 个决策门需要你回答（`IMPLEMENTATION_PLAN.md` §1：G1 贴图入库、G2 时刻表本地使用、G3 线色来源、G4 中文界面）。T1 不需要答案。

## 1. 你接手的是什么

**SENKIRO Lab B · 大阪/梅田站 3D**（`labs/b-umeda-3d`）。GPT-6.2 Astra 已建好：七座车站 + Whity 的建筑剖面、检票口/楼梯/电梯、带来源的通行图与寻路、逐段导览、2D 分层图、乘客目线。这些**真实可用、已验收（Vitest 14/14、Playwright 4/4）**，是整个项目的资产。

你的使命：把它从"可以欣赏的三维车站模型"变成"可以**理解、查询、导航、探索**的三维铁路信息系统"。不是重建模型。

默认服务**普通乘客**（去哪、怎么走）；兼顾铁路爱好者（车型/方向/运行）与研究者（楼层与空间结构）。

## 2. 必读顺序（约 30 分钟）

1. 仓库根 `docs/00-shared-contract.md`（诚实性硬规则；优先级最高）。
2. 同目录 `CURRENT_STATE.md`（真实现状、缺陷、保留/重构/可重写）。
3. `UX_SPEC.md`（做成什么样；§6–§7 选择与 3D 联动是 T1 的依据）。
4. `IMPLEMENTATION_PLAN.md`（24 个任务、依赖、风险、实现提示 §4.1）。
5. 开工任务相关的：`UI_COMPONENTS.md`、`DATA_CONTRACTS.md`、`ACCEPTANCE_TESTS.md`。
6. 需要参考的新宿实现（**只读**）：`E:/Workteree/SENKIRO/shinjuku-3d-indoor-nav-3f3cce/labs/c-shinjuku-3d`；入口见 `UI_COMPONENTS.md` §11。借结构与纪律，**不要照搬未验证的数据逻辑**（它的 V3-REPORT §24 自己列了不准之处）。

## 3. 开工前检查（每次开工都做）

```powershell
git status            # 若有未提交改动：不要覆盖，先报告用户
git log --oneline -3  # 基线应为 d6cc1df（Astra 最后一次提交）或其后用户认可的提交
cd labs/b-umeda-3d; npm install; npm run build; npm test   # 先确认基线是绿的
```
- 在你自己的新分支上工作（用户指定名称；**不要直接改 `lab/*` 分支，不要推送，不要开 PR**）。
- 开发预览端口避开 5183（新宿预览）与 4173（系统保留）。Playwright 默认 27193。
- 截图放 `labs/b-umeda-3d/shots/`（在 `labs/b-umeda-3d/.gitignore` 里忽略；**不入库**）。

## 4. 第一项任务（直接复制给 Sol）

> ===== 复制开始 =====
>
> **任务 T1 · 统一选择状态 + 3D 高亮/淡化/镜头聚焦 + 场景重建隔离**
>
> 你在 `labs/b-umeda-3d` 工作（SENKIRO Lab B：大阪・梅田站 3D）。先读完：`docs/00-shared-contract.md`、`labs/b-umeda-3d/handoff/` 下的 `CURRENT_STATE.md`、`UX_SPEC.md`（重点 §4.2、§6.3、§7）、`IMPLEMENTATION_PLAN.md`（T1、§4.1、风险 R1/R2）、`ACCEPTANCE_TESTS.md`（§0 钩子、PERF/SEL）。
>
> **背景（已被实测证实）**：① `src/Scene.tsx:987–989` 的 `useEffect(() => update.current?.(props), [props])` 使 App 的**任何**状态变化（连打开说明对话框也算）都会销毁并重建整个 3D 场景（几何、标签 DOM）；② 点击站台/检票口/出口等只会弹出一个小卡片，**3D 里没有高亮、没有淡化、镜头不动**；③ 选择相关状态分散在五处（`picked`、`trip`、`step`、`siteId`、`Guide.tsx` 的 `placeId`），"モデル情報"里选的设施不会在 3D 里出现；④ 站名牌 `JR 大阪駅` 的 owner 是 `sk:platform:jr-11`，点它会打开 11 号站台卡。
>
> **目标**：让 `selection` 成为唯一选择状态；选中后 3D 立即高亮该对象、其余淡化、镜头 600 ms 缓动聚焦；与几何无关的状态变化不再重建场景。**这是后续标签、详情、导航、列车的地基。**
>
> **步骤**
> 0. 基线：`git status` 干净；`npm install && npm run build && npm test` 通过。新增 `scripts/shots.mjs`（Playwright，1440×900、DPR 1）按固定机位拍：总览、2F、B1F、默认路线第 1/4/8 步、两个乘客目線，存 `shots/baseline/`（`labs/b-umeda-3d/.gitignore` 忽略 `shots/`）。
> 1. 先写**会失败**的 Playwright 用例（AT-PERF-01/02：点「?」、切主题、开关抽屉后 `canvas[data-rebuilds]` 不变；点 5 个不同对象后不变），并在 `Scene.tsx` 的真正重建处累加 `data-rebuilds`。确认它在现状下失败，再修。
> 2. 拆分 `Scene.tsx` 的更新路径：计算 `geometryKey`（`lang`、`floor`、`spread`、`siteId`、`shell`、`eye`、`example`、路线 Link.id 序列与 `step`）；key 变化才走完整 `rebuild()`；否则只走 `applyAppearance()`（选择/悬停/主题）。注意 `reset` 计数与 `zoom.tick` 目前也靠 `rebuild` 触发，拆分后要在非几何路径里照常处理；`onInspect/onReset/onFallback` 等回调要更新到 `propsNow` 而不触发重建。保持"每个实例有且只有一个 owner"（`owners[]`）。
> 3. 新增 `src/state/selection.ts`：`SelectionKind`、`SelectionTarget {kind,id}`、`select/clear/hover`（一个小 store 或 context 均可，需可单测）；`targetFromOwner(ownerId)` 把 owner id 映射成目标（Place.kind → platform/entrance/concourse；Link.kind → gate/passage/vertical；站名牌 → station）。**修复站名牌的 owner**：站名牌的目标是车站，不是站台。
> 4. 新增 `src/domain/ownersOf.ts`（最小版，T2 会并入 `domain/index.ts`）：`ownersOf(model, target): Set<string>`——platform/gate/passage/vertical/entrance/concourse = 自身 id；station = 该站所有 Place 与相邻 Link 的 id；line = `serviceLineIds` 含该线的站台。写 Vitest。
> 5. 外观（`applyAppearance`）：保存 `baseColors`；选中时，owner ∈ `ownersOf` 的实例用 `selected` 色（沿用 `Scene.tsx` 里 `selected = 0xe14815` 的取值）；选中站台时，同线路的其他站台为 `related`（轻度淡化）；其余实例向舞台底色（取 `.stage` 在当前主题下的实际背景色）混合约 55%。注意 `finish===8` 的灯在着色器里带自发光，淡化后仍会亮；先接受，若观感不对再报告（改 `surfaces.ts` 需单独提交并说明）。只改 `instanceColor` 并置 `needsUpdate`，不改 `finish` 属性、不重建几何。160 ms 插值，仅在过渡期间逐帧绘制，结束即停（保持按需渲染）；`prefers-reduced-motion` 下立即生效。**先用最小实验确认改 `instanceColor` 不会让 `surfaces.ts` 的自定义材质变色（风险 R1）；若有冲突，改用独立的叠加网格并在 `DECISIONS.md` 记录。**
> 6. 相机聚焦：选中后计算被选实例的世界包围盒，缓动 `controls.target` 与 `camera.zoom`（600 ms easeInOut，保持当前轴测方向，`zoom` 限制在 0.65–5）；用户按下指针/滚轮时立即中止；若目标所在展示层不在当前楼层隔离内，先通知 App 切到该层。`Esc`、点画布空白处、卡片关闭钮清除选择：淡化解除，**镜头不回退**。
> 7. App 接入：把 `main.tsx` 的 `picked` 换成 `selection`；现有卡片的外观与内容**暂不改**（详情重做是 T9/T10）；`Guide.tsx` 的"施設と資料"下拉改为读写 `selection`（让它与 3D 一致）；路线端点（`trip`）暂保持独立，但站台卡「ここから/ここまで」仍可用。
> 8. 钩子与测试：加 `data-selected`、`data-highlighted`、`data-dimmed`、`data-camera`（见 `ACCEPTANCE_TESTS.md` §0）。Playwright：AT-SEL-01/02/03/05；更新原有用例（选择器若变需说明）；**原 14 项 Vitest 与 4 项 Playwright 必须仍通过**。
> 9. 回归截图：`selection=null` 时，同机位截图应与 `shots/baseline/` 无差别（逐对比对或比较 PNG 哈希；有差别必须解释）。再各拍一张"选中站台 / 选中检票口 / 选中出口"的前后对比。
>
> **不要做**：不要改 `architecture.ts / buildings.ts / surfaces.ts / signage.ts / shopWindows.ts`；不要改 `data/manual/*` 与领域类型的语义；不要新增依赖（确需时先说明理由）；不要推送、不要开 PR；不要把 3D 退化成 2D；不要用假数据或硬编码演示冒充功能；不要顺手做标签、搜索、详情、路线——它们是 T2 之后的任务。
>
> **完成标准**：`npm run build && npm test` 全部通过，且 AT-PERF-01/02、AT-SEL-01/02/03/05、AT-BASE-01/02 通过。提交到你的分支，英文提交说明，结尾加 `Co-Authored-By` 行。做完**停下**，按下面的模板交报告，不要开始 T2。
>
> **报告模板（每个阶段都用）**：改了什么（文件 + 一句话）／为什么这样设计（引用 UX_SPEC 决定编号，偏离处说明）／真正可用的（逐条 AT：通过/失败/未运行，附命令输出摘要）／截图（同机位前后，路径）／已知问题（含软件渲染限制）／下一阶段依赖／用到的未提交或外部前提。只写真实运行的结果，没跑的写"未运行"。
>
> ===== 复制结束 =====

## 5. 工作要求（适用于每个阶段，不只 T1）

1. **每个阶段都要实际运行、截图、测试**。不能凭"代码看起来对"报告完成。
2. 每个阶段报告：**改了什么 / 为什么这样设计 / 哪些功能真正可用 / 已知问题 / 下一阶段依赖**（模板见上方与 `ACCEPTANCE_TESTS.md` §12）。
3. 视觉改动一律给**同机位前后对比**；用户说效果不好就回退，不辩护。
4. 一次只做一个任务；任务外的想法写进报告的「后续」，不要顺手做。
5. 先读后改：不确定现状就读代码、跑一遍，不要依据截图推断。

## 6. 硬性红线（违反即返工）

- **不编造**：站点、线路、线色、方向、出口号、距离、耗时、无障碍、时刻、车型……没有来源就是 `null`，界面写「未確認」。
- **不做假实时**：没有授权实时源就写"リアルタイム配信なし"；虚拟列车只在显式开启的 Demo 模式出现，且处处标"架空"。
- **合成数据三处标注**（数据、代码、UI）；官方构内图、运营商 Logo、线路符号图标**不入库**；仓库不放图片/PDF/字体；不提交密钥、`.env`、`data/raw/`。
- **不重建 Astra 的建筑**；不把 3D 降成 2D 图层；不用静态展示冒充信息关联；不用假按钮冒充功能。
- **一致性**：面板显示 A、3D 突出 B 是缺陷。
- **报告诚实**：失败写失败、没跑写未运行。
- 用中文向用户报告；提交说明英文。
- 被网站拒绝访问/反爬时**不绕过**：停下，请用户手动保存页面或提供资料。

## 7. 常用命令

```powershell
cd labs/b-umeda-3d
npm run dev -- --port 5291 --host 127.0.0.1 --strictPort   # 预览（避开 5183 与 4173）
npm run data:build        # 改了 data/manual/* 之后必须跑，并连同生成物一起提交
npm run build             # data:check + tsc --noEmit + vite build
npm test                  # vitest + playwright（对生产构建；默认端口 27193）
node scripts/measure.mjs  # 软件渲染下的交互测量（SwiftShader，非 GPU）
```

## 8. 后续任务（一句话预览，详见 IMPLEMENTATION_PLAN）

T2 设施索引 → T3 URL+App 拆分 → T4 线路表与徽章 → T5–T8 标签系统 → T9–T12 详情与搜索 → T13–T15 导航 → T16–T21 列车与时刻（最后做，且 T21 需用户决定）→ T22–T24 2D/统一/收尾。
