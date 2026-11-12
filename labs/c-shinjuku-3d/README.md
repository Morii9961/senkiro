# SENKIRO Lab · Shinjuku Station 3D

新宿站多楼层**示意**模型（V2）：在桌面浏览器里看一座建筑剖切模型，逐层查看，并按步骤演示站内寻路。
目前建模的是 JR 东日本新宿站（B1F / 1F / 2F）和京王线新宿站（B1F / B2F）。

> **这不是官方构内图，也不是测绘模型。**
> 楼层顺序、元素归属和连通关系取自官方构内图上能读到的事实；所有坐标、尺寸、楼层高度都是自拟的「示意单位」，不是米，所以不输出距离和步行时间。
> 墙、柱、台阶、闸机和轨道是根据区域轮廓与连接关系**按规则画出来的**，不代表实际的位置和数量。
> 小田急、东京地铁、都营、バスタ新宿目前仍是带斜线的占位体块，标注「未確認」。
> 数据由 AI 编码代理对照官方图手工录入，**没有人复核过**。请不要用它在车站里找路。

只支持桌面浏览器（最新的 Chrome / Edge，窗口宽度 1080 px 以上）。

## 运行

需要 Node.js 20 以上（开发时用的是 v24.15.0）和 npm。所有命令都在本目录执行。

```bash
npm install
```

```bash
npm run dev
```

然后打开终端里显示的地址（默认 <http://localhost:5173>）。

验收命令：

```bash
npm install && npm run build && npm test
```

`npm test` 先跑 Vitest（118 条），再对生产构建跑 Playwright（25 条）。端到端测试需要 Chromium 内核的浏览器：脚本依次尝试 Playwright 自带的 Chromium、本机 Edge、本机 Chrome，都没有时才执行 `npx playwright install chromium`。

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器（ODPT 本地代理只在这里存在） |
| `npm run build` | 数据校验 → 类型检查 → 生产构建到 `dist/` |
| `npm run preview` | 在 4173 端口预览生产构建 |
| `npm test` | 单元测试 + 端到端测试 |
| `npm run test:unit` / `npm run test:e2e` | 分别只跑其中一种 |
| `npm run perf` | 只跑性能测量（1920×1080 和 1366×768），结果写到 `test-results/perf-*.json` |
| `npm run data:build` | 从 `data/manual/*.ts` 重新生成 `data/processed/*.json`、`data/sources.json` 和 SOURCES.md 里的元素核对表 |
| `npx tsx scripts/print-route.ts` | 在终端逐段打印三条演示路线 |

环境变量（都可选）：`SENKIRO_PW_CHANNEL=msedge|chrome` 指定用本机浏览器跑端到端测试；`SENKIRO_PW_GPU=1` 让测试浏览器使用本机显卡（默认是软件渲染，各机器结果一致但帧率很低）。

## 真实运行数据（ODPT，仅限本地测试）

默认不需要任何密钥，「运行」面板里只有带黄黑条纹标注的示例模式可用。

要看 JR 东日本的真实数据，需要你自己的 ODPT 挑战赛开发者密钥：

1. 在**仓库根目录**（不是本目录）建 `.env.local`，写一行 `ODPT_CONSUMER_KEY=你的密钥`。这个文件已被 `.gitignore` 忽略，不要提交。
2. 用 `npm run dev` 启动，在「运行」面板选「ODPT 真实数据」。

密钥只在开发服务器里使用，不会发到浏览器，取回的数据不落盘。生产构建里没有这个代理，会显示「不可用」。
这些数据受「公共交通オープンデータチャレンジ限定ライセンス」约束，**不能用于公开部署**。适配器是照规格写的，还没有对真实响应验证过。

## 怎么用

- **看模型**：左键拖动旋转；中键或右键拖动（或 Shift+左键）移动整个模型；滚轮缩放。键盘：方向键旋转，`+` / `-` 缩放，`0` 重置。镜头迷路了点「重置视角」。
- **楼层**：左上角的楼层条切换「全部楼层 / 路线楼层 / 2F / 1F / B1F / B2F」。
- **路线**：右侧「路线」面板选起点和终点（站台按线路名列出），或点一条演示路线；可切换「只走电梯」。结果只给段数、楼层变化次数和过检票口次数。
- **逐步查看**：点路径里的某一步，或图下方的箭头，镜头会移到那一段，只显示相关楼层。`Esc` 回到全程。
- **设施详情**：点站台、检票口、出入口、电梯，会打开一张卡片，可以直接设为起点或终点。站厅和通道没有卡片。
- **2D / 3D**：顶栏切换。2D 一次显示一层；路线、选中的步骤和楼层在切换时保留。
- **显示**：「显示」面板调楼层间距、底板浓度，开关标签、楼梯扶梯、未核实体块和镜头动画，并有图例。
- **来源**：「来源」面板列出全部资料、未建模的连接和明确不纳入的车站。
- 语言：日文 / 英文 / 中文；浅色 / 深色。地址参数：`?lang=ja|en|zh`、`?theme=light|dark`、`?view=3d|2d`、`?motion=off`、`?perf=1`。

## 目录

```
data/manual/                手工录入的车站模型和来源记录（唯一的事实来源）
data/processed/, data/sources.json   生成物
scripts/                    数据生成、端到端测试启动、截图辅助
src/domain/                 纯 TypeScript：类型、校验、寻路图、寻路、楼层分组、运行叠加层接口
src/providers/              车站数据、示例叠加层、ODPT 适配器与映射
src/ui/scene/arch/          建筑生成器：楼板与墙、站台与轨道、楼梯扶梯电梯、检票口与出入口
src/ui/scene/               图元、几何合并、路线折线、标签、相机
src/ui/panels/              路线、运行、显示、来源面板和设施详情卡
src/ui/Scene3D.tsx, Plan2D.tsx, App.tsx
tests/unit/, tests/e2e/
```

## 相关文档

- [V2-PLAN.md](V2-PLAN.md)：V2 的现状分析、改造方案和进度
- [DECISIONS.md](DECISIONS.md)：做过的选择、备选方案和理由（V1 与 V2）
- [SOURCES.md](SOURCES.md)：来源与许可、元素来源核对表
- [REPORT.md](REPORT.md)：范围完成情况、真实运行记录、已知缺陷
- [PLAN.md](PLAN.md)：V1 动手前写的一页计划

许可证：代码与本原型自拟的示意数据随仓库采用 AGPL-3.0-only。官方构内图不在仓库里。
