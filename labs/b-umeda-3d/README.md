# SENKIRO Lab · Umeda Station 3D

旋转大阪・梅田的五层示意模型，沿 JR 西日本与 Osaka Metro 的改札外换乘路线逐段查看设施。可切换日文／英文、深浅色和独立的 SVG 楼层图。默认不开启运行示例。

## 本地运行

在本目录使用 Node.js 22.18+（已验收 24.15）与 npm。

```sh
npm install
npm run dev
```

打开 Vite 打印的本地地址。生产验收命令如下。

```sh
npm install && npm run build && npm test
```

`npm test` 顺序运行 Vitest 和针对已有生产构建的 Playwright。浏览器探测顺序为 `SENKIRO_CHROMIUM` 指定的可执行文件、已安装的 Playwright Chromium、常见系统 Chrome／Edge／Chromium。均不可用时下载 Playwright Chromium。Linux 精简环境还需浏览器系统依赖，可运行 `npx playwright install --with-deps chromium`。测试默认独占本机 5193 端口，可通过 `SENKIRO_E2E_PORT` 修改。

## 浏览模型

- 在「経路案内 / Itinerary」选择路线。默认从 JR 御堂筋口**闸内侧**出发，经横道与两处电梯，到御堂筋线梅田站 1 号站台。橙线表示整条路线，点击步骤或「次の区間」突出当前段。费用边界和设施可在步骤中查看。
- 「全階 / All」显示分层模型。单击楼层按钮隔离一层。「階層分解 / Explode」改变示意层间距。切换 2D 后只看当前层，地下站台与连络通道分别列图。
- 左键旋转，右键或中键平移，滚轮缩放。触屏用单指旋转、双指缩放或平移。聚焦画布后用方向键平移，用 +、− 缩放，R 或 ⟲ 重置机位。
- 「モデル情報 / Model guide」可查区域的楼层、闸内外、管理方和原始资料。勾选运行示例后，固定的虚构时刻与延误会关联到指定站台。界面同时显示示例来源与时间戳。
- 「周辺区画 / Surroundings」中的六个独立体块只标识周边名称，位置、内部和连接未核实。
- 段数随建模粒度而变。这里没有步行距离、耗时、实时开闭状态或可用于实地导航的测量精度。

## 修改数据

事实录入、来源与英文说明在 `data/manual/`。每条记录保留稳定 ID、来源、几何置信度和有效期。生成验收数据及逐元素来源核对表时运行以下命令。

```sh
npm run data:build
npm run build
npm test
```

构建会校验图的付费边界、停层与来源，并检查提交的生成物是否过期。加工输入是版本化的人工对照记录，构建过程不抓取运营商网站。按需查阅某一原件可用 `node scripts/fetch-reference.mjs sk:source:jr-map`，输出只写入忽略的 `data/raw/`。该目录不会被打包。

`src/domain/` 提供无 React 依赖的模型、校验与路径函数。`src/providers/service.ts` 提供运行叠加接口、实时源不可用状态和独立示例。`node scripts/measure.mjs` 在生产构建上运行软件渲染交互测量。

[完整验收报告](REPORT.md) · [资料与元素来源核对表](SOURCES.md) · [建模决定](DECISIONS.md)
