# SENKIRO Lab · Shinjuku Station 3D

新宿站多楼层**示意**模型：可在浏览器里旋转、逐层查看，并演示站内寻路。
建模范围是 JR 东日本新宿站（B1F / 1F / 2F）和京王线新宿站（B1F / B2F）。

> **这不是官方构内图，也不是测绘模型。**
> 楼层顺序、元素归属和连通关系取自官方构内图上能读到的事实；所有坐标、尺寸、楼层高度都是为了看得清而自拟的「示意单位」，不是米。
> 所以本原型不输出任何距离或步行时间。小田急、东京地铁、都营、バスタ新宿只画成带斜线的半透明体块，并标注「未確認 / UNVERIFIED」。
> 数据由 AI 编码代理对照官方图手工录入，**没有人复核过**，更没有实地核对。请不要用它在车站里找路。

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

`npm test` 先跑 Vitest 单元测试，再跑 Playwright 端到端测试。端到端测试需要一个 Chromium 内核的浏览器：
脚本会依次尝试 Playwright 自带的 Chromium、本机的 Edge、本机的 Chrome；都没有时才执行 `npx playwright install chromium`（需要联网，约 180 MB）。

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run build` | 数据校验（`data:check`）→ 类型检查 → 生产构建到 `dist/` |
| `npm run preview` | 在 4173 端口预览生产构建 |
| `npm test` | 单元测试 + 端到端测试 |
| `npm run test:unit` | 只跑 Vitest（84 条，不需要浏览器） |
| `npm run test:e2e` | 只跑 Playwright（15 条，对着生产构建跑） |
| `npm run perf` | 只跑性能测量，结果写到 `test-results/perf.json` |
| `npm run data:build` | 从 `data/manual/*.ts` 重新生成 `data/processed/*.json`、`data/sources.json` 和 SOURCES.md 里的元素核对表 |
| `npm run data:check` | 同上但不写文件；生成物过期就失败 |
| `npx tsx scripts/print-route.ts` | 在终端逐段打印三条演示路线 |

环境变量（都可选）：`SENKIRO_PW_CHANNEL=msedge|chrome` 指定用本机浏览器跑端到端测试；
`SENKIRO_PW_GPU=1` 让测试浏览器使用本机显卡（默认用 SwiftShader 软件渲染，结果在各机器上一致但帧率偏低）。

本原型**不需要任何密钥**，也不在运行时访问网络。

## 怎么用

- **3D 视图**：左键拖动旋转，右键或 Shift+拖动平移，滚轮缩放。触屏是单指旋转、双指捏合缩放、双指拖动平移。键盘：方向键旋转，`+` / `-` 缩放，`0` 重置。
- **重置视角**：3D 画面角上的按钮（或按 `0`），镜头迷路时用；单层模式下会对准当前楼层。
- **楼层**：画面上的楼层条切换「全部 / 2F / 1F / B1F / 京王 B1F / 京王 B2F」。「楼层」面板里可以把楼层拉开（剥离）、调外壳透明度、开关标签、垂直设施和未核实体块。
- **2D / 3D**：顶栏切换。两个视图读同一份数据，路线高亮也一致。
- **路线**：「路线」面板里有三条演示路线，也可以自己选起点和终点；可切换「只走电梯」模式。结果只给段数、楼层变化次数和过检票口次数。
- **运行**：「运行」面板演示运行动态叠加层。只有「示例模式」会显示内容，而且全程带黄黑条纹的「示例（合成）」横幅；选 ODPT 时会如实显示「不可用」和原因。
- **来源**：「来源」面板列出全部资料、未确认的连接；点击任意元素能看到它的来源、资料日期和几何可信度。
- 语言：日文 / 英文 / 中文；浅色 / 深色。也可以用地址参数：`?lang=ja|en|zh`、`?theme=light|dark`、`?view=3d|2d`、`?perf=1`（持续渲染，测帧率用）。

## 目录

```
data/manual/shinjuku.ts     手工录入的车站模型（唯一的事实来源）
data/manual/sources.ts      SourceRecord（来源与许可）
data/processed/*.json       生成物：车站模型、寻路图
data/sources.json           生成物：来源记录
scripts/build-data.ts       校验 + 生成
src/domain/                 纯 TypeScript：类型、校验、寻路图、寻路、运行叠加层接口
src/providers/              数据适配器：车站数据、示例叠加层、ODPT 叠加层（只返回“不可用”）
src/ui/                     React 界面；scene/ 下是把模型变成图元的纯函数
tests/unit/                 Vitest
tests/e2e/                  Playwright
```

## 相关文档

- [PLAN.md](PLAN.md)：动手前写的一页计划
- [DECISIONS.md](DECISIONS.md)：做过的选择、备选方案和理由
- [SOURCES.md](SOURCES.md)：来源与许可、元素来源核对表
- [REPORT.md](REPORT.md)：范围完成情况、真实运行记录、已知缺陷

许可证：代码与本原型自拟的示意数据随仓库采用 AGPL-3.0-only。官方构内图不在仓库里。
