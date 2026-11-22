# ACCEPTANCE_TESTS · 可实际验证的验收用例

> 每条用例都能被**运行**判定：`V` = Vitest（纯函数）、`E` = Playwright（对生产构建）、`S` = 同机位截图人工比对、`M` = 手动清单。
> 报告只写真实运行的结果；没跑的写"未运行"，失败的写"失败 + 原因"。
> 所有 E 用例必须监控 `pageerror` 与 `console.error`，出现即失败（沿用 `tests/browser/station.spec.ts` 的写法）。

## 0. 测试钩子（Sol 需要在对应任务里加上；全是只读的 data 属性，不影响界面）

| 钩子 | 位置 | 含义 | 加于 |
|---|---|---|---|
| `data-rebuilds` | `canvas` | 几何重建累计次数（`rebuild()` 里真正重生成矩阵时 +1） | T1 |
| `data-selected` | `canvas` | 当前选中 `kind:id`，无则空 | T1 |
| `data-highlighted` / `data-dimmed` | `canvas` | 被高亮/淡化的实例数 | T1 |
| `data-camera` | `canvas` | `tx,ty,tz,zoom`（保留 2 位小数） | T1 |
| `data-band` | `canvas` | `far|mid|near` | T7 |
| `data-labels` | `canvas` | 当前可见标签 key 的 JSON（排序） | T5/T6 |
| `data-route-links` | `canvas` | 3D 实际绘制为路线的 `Link.id` JSON | T14 |
| `data-trains` | `canvas` | 当前画出的列车数与 `feedKind` | T19 |
| `data-testid` | 面板 | `detail-sheet`、`detail-title`、`search-input`、`search-result`、`route-summary`、`sim-banner` 等 | 各任务 |

## 1. 基线与回归（BASE / PERF）

| ID | 类型 | 步骤 | 期望 |
|---|---|---|---|
| AT-BASE-01 | E+V | `npm install && npm run build && npm test` | 退出码 0；原 14 项 Vitest 与 4 项 Playwright 仍通过（可改选择器，不可删用例） |
| AT-BASE-02 | S | 固定机位（总览、2F、B1F、默认路线第 1/4/8 步、乘客目線×2）改前改后各一张，同尺寸 1440×900 | 人工逐对比对，Astra 建筑材质与几何无意外变化；差异在报告里说明 |
| AT-PERF-01 | E | 读 `data-rebuilds` → 点「?」开关说明对话框、切主题、开关路线抽屉 → 再读 | 数值不变（这些状态与几何无关） |
| AT-PERF-02 | E | 点 5 个不同对象（站台/检票口/出口/电梯/站名） | 每次点击后 `data-rebuilds` 不变 |
| AT-PERF-03 | E+M | 开 Demo 列车 60 秒 | `data-rebuilds` 不增长；记录 `data-frame` 增速与软件渲染环境说明；不以帧率数字判功能 |
| AT-PERF-04 | M | `node scripts/measure.mjs` | 报告新旧对比；写明是 SwiftShader 软件渲染，非 GPU |

## 2. 选择与联动（SEL）

| ID | 类型 | 步骤 | 期望 |
|---|---|---|---|
| AT-SEL-01 | E | 点总览里 `.pin[data-owner="sk:platform:jr-3-4"]` | `canvas[data-selected]` = `platform:sk:platform:jr-3-4`；`data-highlighted` > 0 且 `data-dimmed` > 0；`detail-title` 含"3"和"4" |
| AT-SEL-02 | E | 选中后读 `data-camera`，等 800 ms 再读 | 目标点向被选对象移动、`zoom` 增大（≥ 1.2×）；`prefers-reduced-motion` 下立即到位 |
| AT-SEL-03 | E | 选中站台 A，再点站台 B | 选择切换到 B；A 的高亮解除；面板与 `data-selected` 同为 B |
| AT-SEL-04 | E | 对 20 个随机对象（固定种子，含站台/检票口/通道/出口/设施）：点击 → 比较 `detail-sheet[data-target]`、`canvas[data-selected]`、选中标签的 `data-owner`、`?sel=` | 四者恒等（**不允许面板显示 A、3D 突出 B**） |
| AT-SEL-05 | E | 按 Esc / 点空白 / 点关闭 | 选择清空，淡化解除，镜头不回退；点「⟲」才复位 |
| AT-SEL-06 | V | `ownersOf(platform)`、`ownersOf(station)`、`ownersOf(line)` | 站台=自身；车站=其所有 Place 与 Link；线路=`serviceLineIds` 命中的站台；与 `Scene.owners` 一致 |
| AT-SEL-07 | E | 选中 B1F 的检票口后点楼层「2F」 | 选择保留、面板保留；3D 显示"该対象は別の階にあります"；不崩溃 |

## 3. 标签（LBL）

| ID | 类型 | 步骤 | 期望 |
|---|---|---|---|
| AT-LBL-00 | E+S | T5 完成后，总览/2F/B1F 的 `data-labels` 与改前集合对比 | 集合一致（顺序可不同） |
| AT-LBL-01 | E | 总览逐级放大（`+` 键）读 `data-band` 与 `data-labels` | 远：只有 L1 + 线路徽章簇；中：+站台/主要改札/楼层；近：+设施。**任一带内都不出现下一级之外的标签**；L4 在「案内」下始终不出现 |
| AT-LBL-02 | V | `layout()`：构造 30 个互相重叠的标签 | 输出中任意两个可见标签矩形（含 4 px 内边距）无交集；优先级高者保留 |
| AT-LBL-03 | V | 锚点在视口外 / 禁区内 | 钳制到安全矩形或隐藏；位移 ≤ 24 px；L0 贴边并带箭头 |
| AT-LBL-04 | V+S | 总览中被上层楼板盖住的下层标签 | 不显示（V：代理射线用例；S：截图无"浮在上层楼板上的下层标签"） |
| AT-LBL-05 | V | 标签与目标距离 | 所有可见标签 `距离 ≤ MAX_LEADER(48px)`；位移 >12 px 带引导线 |
| AT-LBL-06 | V | 缩放在阈值附近来回 ±5% 抖动 100 次 | 带切换次数 ≤ 2（回差生效） |
| AT-LBL-07 | E | 阪急 9 条站台（总览） | 重叠时折叠为「1–9」簇，不是随机吞掉 6 个；放大后展开 |
| AT-LBL-08 | E | 选中任一对象/路线起终点 | 对应标签必显（L0），不被避让淘汰 |
| AT-LBL-09 | S | 1440×900 与 390×844 的总览、2F、B1F | 标签无互相覆盖、无被控件盖住、无半截出屏；报告附图 |

## 4. 详情（DET）

| ID | 类型 | 步骤 | 期望 |
|---|---|---|---|
| AT-DET-01 | E | 选站台 `hk-3` | 面板含：运营公司、线路徽章、のりば 3、楼层 3F、闸内；方向行；运行信息块；换乘行；「ここから/ここへ」；来源折叠。**每个字段要么有值要么显示「未確認」，不存在"整行消失"** |
| AT-DET-02 | V | `describe(platform)` 对全部 24 个站台 | `facts` 中无空字符串/`undefined`；缺失统一为 `null` |
| AT-DET-03 | E | 选站台，面板"換乗"行 | 数据来自派生关系且标「派生・示意」；点击其中一项 = 选中该站台 |
| AT-DET-04 | E | 选检票口 `sk:gate:jr-midosuji` | 显示两侧区域（闸内/闸外）、所属车站、关联站台、无障碍（`stepFree` null→未確認）、通往设施 |
| AT-DET-05 | E | 选一条换乘通道 | 显示连接的两个空间与楼层、涉及线路、距离/时间显示「未測定」（**不是数字**） |
| AT-DET-06 | E | 选 Entrance | 显示最近车站区域、可达线路；出口编号无来源时「未確認」；「ここへ」按钮存在 |
| AT-DET-07 | E | 选电梯/楼梯/扶梯 | 显示 A→B 层、是否无台阶、扶梯方向未知时写明"経路には使いません"、稼働状況「未確認」 |
| AT-DET-08 | V | 删掉某站台的 `PlatformService`（测试夹具） | `describe` 仍成功，方向行为 `null` |
| AT-DET-09 | V | 7 站各取代表性 Gate 的 `servedPlatforms` 黄金用例（≥5 个） | 与手工预期一致 |
| AT-DET-10 | E | 窄屏 390×844 点站台 | 底部抽屉升到半屏；画布仍可见被选对象；无横向滚动 |

## 5. 搜索（SRCH）

| ID | 类型 | 步骤 | 期望 |
|---|---|---|---|
| AT-SRCH-01 | V | `searchIndex` 对 "阪急3 / 阪急 3 / hankyu 3 / 3号" 等写法 | 命中 `sk:platform:hk-3`（NFKC、`・·` 互通） |
| AT-SRCH-02 | E | 输入"御堂筋" → Enter | 选中结果并镜头聚焦；等价于点 3D |
| AT-SRCH-03 | E | 结果 `↳终点` | 终点槽位填入；若起点已设则自动规划 |
| AT-SRCH-04 | E | 输入"不存在的站" | 显示"未収録"，不联想成其他站 |
| AT-SRCH-05 | V | 排序 | 完全匹配 > 前缀 > 包含；同分 站 > 站台 > 线 > 检票口/出口 > 设施 |

## 6. 导航（NAV）

| ID | 类型 | 步骤 | 期望 |
|---|---|---|---|
| AT-NAV-01 | E | JR 御堂筋口闸内 → 御堂筋线 1 号站台 | 8 区间 / 换层 2 / 改札 2（与 `tests/topology.test.ts` 一致）；摘要含「距離・所要時間：未測定」 |
| AT-NAV-02 | E | 在 3D 点站台→「ここから」，搜索→终点 | 自动规划；槽位显示 LineBadge+名称+楼层 |
| AT-NAV-03 | E | 步骤列表 | 按楼层分组，组头显示 `1F → B1F`；每行有设施图标与 `stepFree` 小标 |
| AT-NAV-04 | E | 开无台阶，选只能经楼梯的两点 | 显示 `BlockedReason`（含首个阻断边类型）；3D **不画任何线** |
| AT-NAV-05 | E | `data-route-links` 与面板步骤的 Link.id 序列 | 完全一致（画出来的=图里的） |
| AT-NAV-06 | S | 全層视图默认路线 | 连续贯穿路线；竖向段有楼层牌；其余层淡化；当前步加粗；无两点直线 |
| AT-NAV-07 | V | 全站任意两个端点（含 7 站、Whity）`planRoute` | 无路径时返回 `RouteFailure`，**不返回"直线" Step**；有路径时每个 Step 的 `link` 存在于 `model.links` 且 `connection==='verified'` |
| AT-NAV-08 | E | 路线中换层步 | 出现 `FloorChangeBanner`（`prefers-reduced-motion` 下为静态文本） |
| AT-NAV-09 | V | `scripts/check-routes.ts` | 退出码 0；输出覆盖对数；失败对逐条列出 |
| AT-NAV-10 | V | 文案检查 | 路线摘要与步骤组件渲染出的文本中，除「未測定」说明外，不出现"所要○分 / ○ min / ○ m / メートル"这类带数量的距离或时间（`distanceMeters/durationSeconds` 恒为 null） |

## 7. 线路（LINE）

| ID | 类型 | 步骤 | 期望 |
|---|---|---|---|
| AT-LINE-01 | V | `lineStyles` 校验 | `color` 非空 ⇒ `sourceIds` 非空且已登记；`#rrggbb` 合法；`lineId` 存在且唯一 |
| AT-LINE-02 | E | 有色线与无色线的站台标签 | 有色=线色条；无色=中性灰徽章，`title` 含"線色未確認"；源码中 `#b44041` 等硬编码三色已删除（`grep`） |
| AT-LINE-03 | V | 徽章文字色 | 对每个线色，文字/底对比度 ≥ 4.5:1 |

## 8. 列车与时刻（TRN / TT）

| ID | 类型 | 步骤 | 期望 |
|---|---|---|---|
| AT-TRN-01 | V | `deriveTrackPaths` | 每条路径与站台 `boarding.trackSides` 一致；`entrance===null` 的轨道无列车 |
| AT-TRN-02 | V | 路径位置与 `Scene.tsx` 钢轨偏移 | 距离 < 0.05 单位 |
| AT-TRN-03 | V+S | 车辆注册表 | 不存在"所有线路同一泛用车"：不同类别的车体比例/编组/配色可区分；`unknown` 为中性体；预览页截图 |
| AT-TRN-04 | V | 位置函数 | 接近→制动→停车→出发序列正确；到站速度为 0；离站加速；无随机；同输入同输出 |
| AT-TRN-05 | E | Demo 模式 | 列车沿轨进出站台；到站对应站台号；`data-trains` 含 `demo` |
| AT-TRN-06 | E | 列车不穿墙 | 任一帧列车包围盒与站台 AABB 外侧轨道带重叠、不进入闸内区域 |
| AT-TRN-07 | E | 点列车 | 卡片：种别/行先原文（缺失→未確認）、线路徽章、站台、予定时刻、车型徽章；`data-selected` = `train:<id>` |
| AT-TRN-08 | E | 「追従」 | 镜头随车；拖动即取消 |
| AT-TT-01 | V | `validateDataset` | demo 与 timetable 混用 ⇒ error；`vehicle_series` 空且 status≠unknown ⇒ error；`platform_id` 空 ⇒ 不上轨；error 记录不进入模拟 |
| AT-TT-02 | E | 默认打开 | `mode=off`：无列车、无横幅、站台卡写「リアルタイム配信なし」 |
| AT-TT-03 | E | 选デモ | 橙色 `sim-banner` 含「DEMO」「架空」，不可关闭；列车卡带「架空」 |
| AT-TT-04 | E | 切回 off | 所有列车消失；横幅消失 |
| AT-TT-05 | V+M | 真实时刻数据（T21 后） | 覆盖统计脚本输出每条股道班次数与来源；无数据股道为 0/0；报告列出已知不准处 |

## 9. 2D 与统一 UI（2D / UI）

| ID | 类型 | 步骤 | 期望 |
|---|---|---|---|
| AT-2D-01 | E | 2D 点站台 | 与 3D 同一 `selection`：切回 3D 时同一对象高亮；面板同一对象 |
| AT-2D-02 | S | 2D 各层 | 有名称标注、线路色（有则）、路线高亮；无标注重叠 |
| AT-2D-03 | E | 3D 选中 → 切 2D → 切回 | 选中、楼层、路线保持 |
| AT-UI-01 | E | 3D 与 2D 的楼层控制 | 同一组件；选中/路线所在层有标记点 |
| AT-UI-02 | E | 切「案内/設備/構造」 | 标签级别上限随之变化；选择不丢 |
| AT-UI-03 | S | 深/浅色 | 面板与标签对比度达标；3D 背景随主题 |
| AT-UI-04 | E | 键盘：`/` 搜索、↑↓ Enter、Esc、Tab 顺序 | 全流程可无鼠标完成；`aria-live` 播报选中对象 |
| AT-UI-05 | E | 390×844 | `scrollWidth <= innerWidth`；控件不遮挡标签（禁区生效） |
| AT-URL-01 | V | `url` 往返 | `parse(serialize(s)) == s`；非法参数回退默认 |
| AT-URL-02 | E | 打开 `?sel=platform:sk:platform:hk-3&floor=2` | 加载后该站台被选中并聚焦 |
| AT-URL-03 | E | 刷新 | 状态恢复 |

## 10. 诚实性（HON）——**任何一条失败即阻断合并**

| ID | 类型 | 检查 | 期望 |
|---|---|---|---|
| AT-HON-01 | V | 所有出现在 UI 的线色/方向/出口号/车型 | 都能追到 `provenance.sourceIds`；无来源者为 `null` |
| AT-HON-02 | V | 新增手工数据文件 | `data:check` 通过；每条记录来源已登记；`dataNature` 合法 |
| AT-HON-03 | E | 全站扫描 DOM 文本 | 不出现与运营商相关的 logo/符号图片；仓库 `git ls-files` 无新增图片/PDF/字体（`shop-windows.jpg` 先按 G1 处理） |
| AT-HON-04 | E | 任何模式下，若数据集为 demo | 画面处处可见「架空」标识；live 模式文案恒为"配信なし"；不存在"現在走行中の列車"字样 |
| AT-HON-05 | M | 报告 | 只含真实运行结果；未运行/失败如实写；列出"未核实清单" |
| AT-HON-06 | V | `git diff` 检查 | 无 `.env`、密钥、token；`data/raw/`、`shots/`、`dist/` 未入库 |

## 11. 收尾（REL）

| ID | 类型 | 检查 | 期望 |
|---|---|---|---|
| AT-REL-01 | M | 公开版清理 | 无调试文字/`?debug` 叠加默认关闭；`REPORT.md` 十节齐全并更新；G1/G2 的决定与实现一致；干净目录 `git archive` 导出后 `npm install && npm run build && npm test` 通过 |

## 12. 阶段报告模板（每个任务做完必须交）

```
## 任务 T? · 标题
- 改了什么：（文件 + 一句话）
- 为什么这样设计：（引用 UX_SPEC / DATA_CONTRACTS 的决定编号，偏离处要说明）
- 真正可用的：（逐条 AT-…：通过 / 失败 / 未运行，附命令与输出摘要）
- 截图：（同机位前后对比，路径写在被忽略目录 shots/，不入库）
- 已知问题：（含软件渲染限制、未验证项）
- 下一阶段依赖：（需要哪个任务/哪个用户决定/哪份数据）
- 用到的未提交/外部前提：（无则写"无"）
```
