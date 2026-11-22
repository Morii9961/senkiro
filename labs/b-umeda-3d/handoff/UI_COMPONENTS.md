# UI_COMPONENTS · 组件与视觉规范

> 目标：让梅田与新宿共享同一套产品语言，同时保留 Astra 的建筑材质。**只规定 UI，不碰 `architecture.ts / buildings.ts / surfaces.ts`。**
> 行为规则见 `UX_SPEC.md`，类型见 `DATA_CONTRACTS.md`。参考的新宿实现：`labs/c-shinjuku-3d/src/ui/atoms.tsx`、`ui/theme.ts`、`ui/scene/labels.ts`、`ui/panels/FacilityCard.tsx`（只读；借结构，不复制未验证数据）。

## 0. 总原则

- 不堆装饰：无渐变、无大阴影、无卡片套卡片。靠**字重、色条、间距、位置稳定性**建立层级。
- 一个概念只有一个组件：线路 = `LineBadge`；楼层 = `FloorChip`；"未确认" = `UnknownValue`；数据性质 = `NatureChip`。任何地方出现这些概念都用同一组件。
- 项目约定：**不复制运营商的 Logo、线路符号图标、官方地图**。线路徽章是自有设计：色条 + 线路名文字（可含站号前缀文字，但不画官方圆形符号）。
- 所有颜色走 CSS 变量（`src/ui/tokens.css`），亮/暗两套；不得在组件里写十六进制字面量（线路色除外，来自数据）。

## 1. 设计 token（`src/ui/tokens.css`）

沿用现有 `style.css` 已有变量并补全（`--paper --card --ink --sub --line --map` 保留原值）：

```css
:root {
  /* 表面 */
  --paper:#f4f3ec; --card:#fffef8; --ink:#233b3b; --sub:#526662; --line:#c8cfc4; --map:#e6e3dd;
  --panel-bg:var(--card); --scrim:#122c2933;
  /* 语义强调：沿用 Scene.tsx 的 routeColor/selected 值，统一命名 */
  --route:#ff870c; --route-strong:#e14815; --selected:#e14815; --related:#2f7f86;
  --dim-mix:0.55;                      /* 淡化时混向背景的比例 */
  /* 状态（仅用于有来源的运行状态；无数据一律用 --unknown） */
  --st-normal:#2e7d4f; --st-delayed:#b7791f; --st-suspended:#b3261e; --unknown:#8a948f;
  /* 模式横幅 */
  --mode-sim:#2b5f8a; --mode-demo:#c25e00; --mode-live:#2e7d4f;
  /* 字体：只用系统字体（项目约定：仓库不放字体文件） */
  --font:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic UI","Meiryo","Noto Sans JP",system-ui,sans-serif;
  --mono:ui-monospace,"SFMono-Regular",Consolas,monospace;
  /* 字号 */
  --fs-l1:14px; --fs-l2:12px; --fs-l3:11px; --fs-l4:11px;     /* 场景标签；下限 11px */
  --fs-body:14px; --fs-small:12px; --fs-title:16px; --fs-h:18px;
  /* 间距/圆角/动效 */
  --r-sm:3px; --r-md:6px; --gap:8px; --pad:12px;
  --t-fast:120ms; --t-panel:200ms; --t-camera:600ms; --ease:cubic-bezier(.4,0,.2,1);
}
:root[data-theme='dark'], .app.dark { /* 原 .app.dark 的值保留，补语义色的暗色版本 */
  --paper:#131e21; --card:#202e31; --ink:#e5eee2; --sub:#b2c5bf; --line:#42575a; --map:#233135;
  --route:#ffa23a; --route-strong:#ff6a33; --selected:#ff6a33; --related:#5fb8bf; --unknown:#8e9c97;
}
@media (prefers-reduced-motion:reduce){ :root{ --t-fast:0ms; --t-panel:0ms; --t-camera:0ms } }
```

对比度要求：正文对背景 ≥ 4.5:1，标签文字 ≥ 4.5:1，大字/图标 ≥ 3:1。徽章文字色按底色亮度自动在 `#fff / #1a1a1a` 间选择。

## 2. 原子组件（`src/ui/atoms/`）

| 组件 | 作用 | 要点 |
|---|---|---|
| `LineBadge` | 线路识别 | props：`line`（RailLine）、`size:'xs'\|'sm'\|'md'`、`showName`、`showOperator`。有 `LineStyle.color` → 色条/色底；`null` → 灰色中性徽章 + 线名，**title 写"線色未確認"**。徽章只含文字与色，不含官方符号。 |
| `FloorChip` | 楼层 | 显示展示层标签（`1F / B1F / 中2F`）；可带"→"表示换层（`B1F → B2F`）。 |
| `ZoneChip` | 闸内/闸外 | `改札内 / 改札外`；闸外可带管理方（鉄道会社/商業/公道/未確認）。 |
| `NatureChip` | 数据性质 | `official / manual-verified / derived / synthetic`；`synthetic` 用 `--mode-demo` 底色、粗体。 |
| `ConfidenceChip` | 几何置信度 | `verified / schematic / unknown`；梅田几乎全是 `schematic`，在对象页尾部统一显示「位置は模式的」。 |
| `UnknownValue` | 字段缺失 | 灰字「未確認」，`title` 说明缺什么资料；**所有缺失字段只能用它**。 |
| `FieldRow` | 标签-值行 | `label`、`value`（缺省自动渲染 `UnknownValue`）、`source?`（点击展开来源）。 |
| `IconKind` | 设施图标 | `gate / stairs / escalator / elevator / passage / exit / platform / toilet`；自绘 SVG，**不引入图标库或官方图标**。 |
| `Chip` / `Pill` | 通用小标签 | 仅当上述语义组件都不适用时使用。 |

## 3. 场景标签 `SceneLabel`（DOM 覆盖层）

### 3.1 数据模型

```ts
interface SceneLabelSpec {
  key: string                    // 稳定：'platform:sk:platform:hk-3'
  targetId: string | null        // 对应 selection 目标；点击即 select(target)
  targetKind: SelectionKind
  level: 0 | 1 | 2 | 3 | 4       // 见 UX_SPEC §5.1
  priority: number               // 同级内排序；选中/路线加成在布局时附加
  anchor: [number, number, number]   // 世界坐标
  text: string
  badges?: { lineId: string }[]  // 线路徽章
  icon?: IconKindName
  maxBand?: 'far'|'mid'|'near'   // 站名等：近景退场
  meaningKey?: string            // 同义折叠
  floorOrdinal: number | null
}
```

标签**由模型生成**（`src/scene/labels/build.ts`，纯函数：`(model, viewOptions, selection, route) => SceneLabelSpec[]`），不再在几何循环里 `label(...)`。几何循环里与标签相关的调用全部删除。

### 3.2 视觉规范

| 级别 | 字号/字重 | 形态 | 底/边 |
|---|---|---|---|
| L1 站名 | 14px / 700 | 深色实底、浅字，左侧 4px 强调条；可带线路徽章簇 | `--ink` 底；暗色用 `--card` 反色 |
| L2 站台/改札/出口 | 12px / 600 | `LineBadge(xs)` + 号码；或白底单行 | `--card` 底、1px `--line` 边、3px 左色条（线路色或中性） |
| L3 设施 | 11px / 500 | 默认**仅图标**（18px 圆底）；近景/悬停/路线上才加文字 | 同 L2，更小 |
| L4 构件 | 11px / 400 | 灰字小标签，无色条 | 半透明 `--card` |
| L0 选中/路线 | 比同类大一档，字重 +100 | 路线起/终点用「出発」「到着」实心牌；当前步标签带 `--route-strong` 描边 | 强调色边 + 阴影一档 |

状态：`hover`（边框 `--ink`、提亮）、`selected`（`--selected` 边框 + 2px 外环）、`related`（`--related` 左条）、`dimmed`（opacity .45）、`onRoute`（`--route` 外环）。阴影统一 `0 1px 3px #122c2926`；选中 `0 2px 8px #122c2940`。

### 3.3 行为
- `pointer-events: auto` 仅对当前显示的标签；点击 = `select(targetId)`；hover 触发 3D hover（同一个 `hover` 状态）。
- 位置只用 `transform: translate()`；显隐用 `opacity` + `visibility`（120 ms）；**不得**每帧重建 DOM（复用节点池，key 稳定）。
- 引导线：2D 画布 overlay（一个 `<svg>`，`pointer-events:none`）或标签伪元素，位移 >12 px 时绘制，细线、`--line`。
- 簇芯片：`+4`/`1–9` 样式同 L2，点击 = 聚焦并放大到该簇。
- 可访问性：标签是辅助；同样的对象必须能经搜索/列表键盘到达；标签容器 `aria-hidden="true"`，另有 visually-hidden 的 `aria-live="polite"` 区域播报选中对象名称与类型。

## 4. 详情对象页 `DetailSheet`

```
┌────────────────────────────────┐
│ [icon] 主名                 [×] │  标题行：类型图标 + 名称 + 关闭
│ 副名(en/ja)                    │
│ [LineBadge][FloorChip][ZoneChip]│  身份芯片行
├────────────────────────────────┤
│ 关键交通信息  FieldRow × 3–5    │  <KeyFacts>
│ 運行情報  <ServiceInfo mode=…>  │  仅站台/列车/车站
├────────────────────────────────┤
│ 関係  <RelationList>            │  可点击项：点击 = select()
├────────────────────────────────┤
│ [ここから][ここへ] [経路を見る]    │  <ActionBar>；次级：この階だけ／乗客目線
├────────────────────────────────┤
│ ▸ 資料・精度   <Provenance>      │  折叠；NatureChip/Confidence/来源/未確認項目
└────────────────────────────────┘
```

- 组件：`DetailSheet`（容器、滚动、关闭、`Esc`）、`KeyFacts`、`RelationList`、`ActionBar`、`Provenance`；每个对象类型一个"内容函数" `describe(target, model, ctx): DetailSpec`（纯函数，**可单测**；UI 只渲染 `DetailSpec`）。这样"字段缺失显示未確認"的规则在 `describe` 里统一、可测。
- `DetailSpec`：`{ title, subtitle, chips[], facts: {label, value|null, sourceIds?}[], service?: ServiceBlock, relations: {group, items: {targetId, label, badge?}[]}[], actions: Action[], provenance: {sourceIds, nature, confidence, missing: string[]} }`。
- 桌面：侧栏顶部展开，高度自适应、可滚动；窄屏：底部抽屉半屏。位置固定，**不浮在画布上**。
- `ServiceInfo`（运行信息块）按模式渲染：`unavailable`→「リアルタイム配信なし」；`timetable-sim`→蓝色小横幅 +「予定」列表；`demo`→橙色 DEMO 横幅 + 架空列表。**同一块不得同时出现两种模式**。

## 5. 搜索 `SearchBox` + `SearchResultRow`

- `SearchBox`：`role="combobox"`、`aria-expanded`、`aria-activedescendant`；`/` 聚焦；`Esc` 清空。
- `SearchResultRow`（三个入口、搜索结果、最近查看，**同一组件同一布局**）：`[图标或LineBadge] 主名 / 副行（车站 · FloorChip · ZoneChip） / 右侧 [↳起点][↳终点]`。分组标题：駅・のりば・路線・改札/出口・設備。
- 结果上限每组 5 条，「もっと見る」展开。
- 索引来自 `src/domain/searchIndex.ts`（纯函数，可单测）。

## 6. 楼层控制 `FloorControl`（3D / 2D 共用）

- 项：`全階`（仅 3D）+ 当前车站范围内存在的展示层（按 ordinal 降序）。
- 每项右上小点：`●` 选中对象在此层，`◆` 路线经过此层（颜色 `--route`），灰色禁用 = 当前站无此层（`title` 说明）。
- 桌面：画布左侧竖条；窄屏：画布底部横条（沿用现有 `.floors` 位置也可，但逻辑必须是同一组件）。
- 行为：点击 = 隔离该层；再次点击已选层 = 回到「全階」。选择状态不被清除（UX_SPEC §6.3）。
- 同一组件驱动 2D：2D 视图中没有"全階"。

## 7. 路线组件

- `RouteSlots`：两个槽位（出発/到着）：`[LineBadge][名称][FloorChip]`，空槽显示「地点を選ぶ」并聚焦搜索；右侧 `⇅`。
- `RouteSummary`：`N 区間 · 階層移動 N · 改札 N` + 灰字「距離・所要時間：未測定」。
- `AccessibleToggle`：开关 + 说明行；无路线时展示 `BlockedReason`（首个无法通过的边的类型）。
- `StepGroup`：楼层变化条（`1F → B1F`）+ 若干 `StepRow`。
- `StepRow`：`IconKind` + 动作文字 + 去向 + 小标（`stepFree`：○/✕/？）。当前步高亮 `aria-current="step"`。
- `FloorChangeBanner`：换层步在画布中央顶部出现 2 秒（`▼ B1F へ`），遵守 `prefers-reduced-motion`。
- 3D 路线样式（`src/scene/route3d.ts`）：路线色 `--route`（Astra 原 `0xff870c`）；水平段 0.34 宽带 + 箭头；竖向段为垂直立柱 + 两端楼层牌；当前步 `--route-strong`、宽 0.51；其他楼层路线段半透明；不得出现任何两点直线（仅沿 Link 端点）。

## 8. 列车组件（阶段 4 才实现，先定规范）

- `ModeSwitch`：`オフ / 時刻表シミュレーション / デモ`。`時刻表シミュレーション` 在无真实数据的区域禁用并说明原因。
- `SimBanner`：始终贴着时钟，文案按模式固定（见 UX_SPEC §9.1），**不可关闭**。
- `ClockBar`：当前模拟时刻（JST）、日别（平日/土休日）、倍速（1×/10×/60×）、`现在时刻`（取本机时间，标注"本机时间，非列车位置"）。
- `TrainListRow`：`[LineBadge] 種別 行先 / 予定 hh:mm / ホーム / 車種チップ`。
- `TrainCard`：见 UX_SPEC §9.2。车型徽章 `verified/representative/unknown`；unknown 文案「車種未確認（汎用車体）」。
- `TrainMarker`（3D 小标签）：仅 L3/选中时显示，写种别+行先缩写，带 `架空` 角标（demo 模式）。

## 9. 动效与相机

| 动作 | 时长/曲线 | 备注 |
|---|---|---|
| 相机聚焦 | 600 ms `easeInOut`（新宿 `easeInOut`） | target 与 zoom 同步插值；中途被用户拖动则立即中止 |
| 标签显隐/位移 | 120 ms | 淡入淡出；位移用 transform 过渡 |
| 高亮/淡化 | 160 ms | 通过逐帧插值实例色实现，结束后停止渲染 |
| 面板展开 | 200 ms | |
| `prefers-reduced-motion` | 全部归零 | 相机直接跳转 |

## 10. 文件落点（建议）

```
src/ui/tokens.css
src/ui/atoms/{LineBadge,FloorChip,ZoneChip,NatureChip,ConfidenceChip,UnknownValue,FieldRow,IconKind}.tsx
src/ui/panels/{DetailSheet,SearchPanel,RoutePanel,TrainPanel,InfoPanel}.tsx
src/ui/controls/{FloorControl,DetailLayerSwitch,ZoomControls,ModeSwitch}.tsx
src/ui/describe/{platform,gate,passage,entrance,vertical,station,line,train}.ts   // 纯函数
src/scene/labels/{build,layout,occlusion,config}.ts
```

## 11. 与新宿站对齐（共享的产品语言）

| 项 | 做法 |
|---|---|
| 线路徽章 / 楼层芯片 | 参考 `c-shinjuku-3d/src/ui/atoms.tsx` 的接口形状；梅田实现独立，不复制色值（色值只能来自本站数据+来源）。 |
| 标签四级、回差、同义折叠 | 参考 `labels.ts` 的 `tier / maxZoom / priority / sameMeaningKey / SAME_MEANING_PX / trackRange`。 |
| 详情卡分型 | 参考 `FacilityCard.tsx` 的 platform/gate/entrance/vertical 分型，但按本规范补全"未確認"规则。 |
| 相机 | 参考 `camera.ts` 的 `Pose`（target/radius/polar/azimuth）与 `mixPose`；梅田用正交相机，等价量是 target/zoom/azimuth。 |
| 两站最终应共享同一个 `ui/atoms` 包 | 不在本阶段强制；先让接口一致，再由用户决定是否抽成 workspace 包。 |
