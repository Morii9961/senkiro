# SENKIRO Lab · Tokyo Atlas & Fare

基于同一套车站、线路与轨道区段数据构建的东京铁道交互地图与规则驱动、可解释 JR 运价引擎原型。

> **运价诚实性声明**：本原型运行于「规则验证演示模式」，运价金额采用明确标注为 `synthetic` 的示例费率，**不可作为实际购票金额**。轨道拓扑、营业里程（JR 切片）与旅客营业规则条文逻辑均对照官方公开资料核实。

## 快速开始

所有命令请在 `labs/a-tokyo-atlas-fare/` 目录内执行：

```bash
cd labs/a-tokyo-atlas-fare
npm install
npm run build
npm test
```

## 全部命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动本地 Vite 开发服务器（`http://localhost:5173`） |
| `npm run build` | TypeScript 严格类型检查（`tsc --noEmit`）+ Vite 生产构建 |
| `npm test` | 运行 Vitest 单元测试（运价规则引擎 + 跨来源对齐 + 数据一致性与 ODbL 隔离） |
| `npm run test:e2e` | 运行 Playwright 端到端交互测试（首次运行前如缺少浏览器请执行 `npx playwright install chromium`；自动启动 `vite preview` 于 `127.0.0.1:18473`） |
| `npm run data:fetch` | 从免密钥公开来源重新下载铁路与纵断原始数据至 `data/raw/`（被 `.gitignore` 忽略） |
| `npm run data:build` | 可复现生成 `data/processed/atlas.json`、`data/sources.json` 与独立 ODbL 文件 `data/processed/osm-vertical.json` |
| `npm run data:urban:fetch` | 从 Overpass API 重新下载东京 23 区真实 OSM 建筑、主要道路、河川水域与公园至 `data/raw/urban/` |
| `npm run data:urban` | 流式处理原始 OSM 都市数据，生成 `public/data/urban-chunks/`（130 个 `2km×2km` 空间分块 + `base-environment.json`） |

## 环境与密钥

- 本项目**无需任何 API 密钥**即可完整运行、构建与测试。
- 地图底图使用国土地理院「地理院タイル（淡色地図）」（免密钥，CC BY 4.0 互換），离线环境自动降级为纯色背景。
- 未配置 `ODPT_CONSUMER_KEY` 时，实时运行信息槽位显式显示「無実時データ / No real-time data」，不模拟任何列车位置或延误。

## 文档索引

- [PLAN.md](file:///e:/SENKIRO/labs/a-tokyo-atlas-fare/PLAN.md)：架构与里程碑计划
- [ARCHITECTURE-3D.md](file:///e:/SENKIRO/labs/a-tokyo-atlas-fare/ARCHITECTURE-3D.md)：三维东京都市与地下铁路程序化建模架构文档
- [DECISIONS.md](file:///e:/SENKIRO/labs/a-tokyo-atlas-fare/DECISIONS.md)：关键技术与合规决策记录
- [SOURCES.md](file:///e:/SENKIRO/labs/a-tokyo-atlas-fare/SOURCES.md)：数据源许可登记表与 JR 规则来源表
- [REPORT.md](file:///e:/SENKIRO/labs/a-tokyo-atlas-fare/REPORT.md)：范围完成情况、真实运行记录、事实出入与 SENKIRO 复用评估
