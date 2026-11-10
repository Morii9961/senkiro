# SENKIRO Lab · Shared Contract v0.1

## 0. 项目背景

SENKIRO（センキロ，線・記・路）是一个日本铁路探索、换乘规划与旅行记录平台，目前处于立项阶段，将在 GitHub 开源。旧代号 Japan Railway Atlas（JRA），只作历史名称使用，不要用作产品名或缩写。完整规划见 docs/plan-v0.1.md，品牌规范见 docs/brand-v1.0.md。这两份只是背景：你的任务范围以 session 任务书为准，不要去实现规划里的其他模块。

本仓库的 labs/ 目录存放 SENKIRO Lab 的原型实验，每个原型在自己的分支、自己的子目录中开发。每个原型同时满足两件事：作为一次独立测评，结果必须真实；作为未来代码的地基，领域模型与数据管线必须能被复用。

## 1. 诚实性硬规则（优先于一切视觉和范围目标）

1. 不编造任何站点、线路、站号、出入口、坐标、距离、票价、时刻、列车位置或规则条文。
2. 不知道的字段写 null，并在 UI 上显示「未知 / 未核实」，不要用看起来合理的值填充。
3. 每条可见数据都要能追溯到一个 SourceRecord。
4. 任务书和规划文档中提到的铁路事实、示例、URL 都是待核实的假设。你要自己核实；发现不符、找不到依据或页面失效，在 REPORT.md 的「与任务书的事实出入」里逐条记录，并按你核实到的事实实现。
5. 合成数据（synthetic）必须在数据、代码和 UI 三处都标明，UI 上的标识要醒目，不可能被误认为真实数据。
6. 没有合法实时数据时，不得用动画或推算冒充实时列车、实时延误或实时位置。
7. 测试结果、构建结果、覆盖率只写真实运行得到的；没跑的写「未运行」，失败的写「失败」并附原因。
8. 不确定某个数据集是否允许使用时，先不用，写进 REPORT.md 的待决事项。

## 2. 数据性质标签 DataNature

每条数据必须带其中一个：
- official：运营商或政府机构直接发布
- licensed-third-party：取得许可的第三方数据
- derived：由上述数据经可复现脚本加工得到
- manual-verified：人工对照官方资料录入，需记录对照的页面
- synthetic：为验证算法而构造，非真实
- unknown：来源不明，原则上不展示

## 3. 来源与许可 SourceRecord

字段：id, title, publisher, url, retrievedAt, license（名称）, licenseUrl, commercialUse（yes / no / conditional / unknown）, redistribution（yes / no / conditional / unknown）, shareAlike（true / false / unknown）, attributionText, notes。

所有 SourceRecord 汇总在原型目录下的 SOURCES.md 和 data/sources.json。特别注意：OpenStreetMap 衍生数据受 ODbL 约束（share-alike）；国土数値情報各数据集、各年份条款不同，需逐个核对；ODPT 各数据集的许可也不同，需逐个核对。地图底图与字体同样要登记许可。

## 4. 通用字段

所有实体共有：
- id：内部稳定 ID，格式 sk:<type>:<slug>，例如 sk:station:jr-east-shinjuku
- externalIds：外部 ID 映射，例如 { odpt: "...", ksj: "..." }，用于跨来源对齐
- names：{ ja, ja_kana, en, zh? }，未知为 null
- provenance：{ sourceIds[], dataNature, lastVerifiedAt }
- validFrom / validTo：业务有效期，未知为 null

## 5. 实体（TypeScript 名称以此为准）

- Operator：运营公司
- RailLine：名义线路（运营商、显示颜色、站号前缀）
- TrackSegment：实体轨道区段与几何；一个区段可属于多个 RailLine，两站间可有多个区段
- Station：某运营商在某线路上的车站实体
- StationComplex：可步行换乘的车站群；同名不代表同一个 complex，不同名也可能同属一个 complex
- Platform / Entrance / Gate / Level：站台、出入口、检票口、楼层
- Interchange：两个 Station 之间的换乘关系，区分改札内 / 改札外
- ServicePattern / Trip / StopTime：运营服务、车次、停站时刻
- ThroughService：跨线路或跨公司的直通运营关系，与线路所有权分开建模
- FareRule / FareProduct / FareQuote：版本化运价规则、票种、报价及其计算解释
- PassProduct / PassEligibility：通票与覆盖规则

三张图必须分开：轨道拓扑图（TrackSegment）、运营服务图（ServicePattern / Trip）、计费规则图（FareRule）。不能用一张图加最短路覆盖全部逻辑。

## 6. 工程约定

- 每个原型是 labs/<原型目录>/ 下一个独立的 npm 项目，所有命令都在该目录内运行
- React + TypeScript（strict）+ Vite；单元测试 Vitest；交互测试 Playwright
- src/domain/：纯 TypeScript 的类型与逻辑，不依赖 React，能被未来的 Web 与移动端复用
- src/providers/：数据来源适配器，每个来源一个，缺密钥或失败时返回明确的状态而不是假数据
- data/processed/ 存加工结果；npm run data:build 可从原始来源复现
- 底图只用无需密钥、许可清楚的来源，或不用底图
- UI 至少支持日文与英文；深色模式；移动端可用；基本无障碍（键盘可达、对比度、aria 标签）
- UI 署名为「SENKIRO Lab · <原型名>」，不做 SENKIRO 正式 Logo 或品牌视觉；不复制运营商的 Logo、线路符号图标、官方地图或站内图

## 7. 开源规则（本仓库将公开）

- 提交到仓库的一切内容都会被公开再分发
- 绝不提交密钥、令牌或 .env 文件；密钥只从仓库根目录的 .env.local 读取，代码与文档中只出现变量名
- 原始数据只有在 redistribution 为 yes 时才可提交；为 no / conditional / unknown 的，只提交获取脚本，下载结果放进 data/raw/ 并由 .gitignore 忽略
- 官方构内图、官方线路图、运营商 Logo 等图片一律不提交
- 新增依赖时注意其许可证，避免与开源发布冲突，REPORT.md 列出主要依赖及许可

## 8. 工作方式（one-shot）

- 这是一次性任务：不要向人类提问，也不要等待确认。需要做选择时，选最合理的方案，记进 DECISIONS.md（决定 / 备选 / 理由）
- 只在当前分支、只在自己的原型目录内工作；可以在仓库根目录 .gitignore 追加规则，但不要修改 docs/ 和其他 labs/ 子目录
- 不要查看、checkout、merge 或 cherry-pick 其他 lab/* 分支，不要 push，不要创建 PR；只做本地 commit
- 先写不超过一页的 PLAN.md，然后立刻开始实现
- 先完成一条端到端的纵向切片（数据 → 领域模型 → UI → 测试），再加宽范围
- 在每个里程碑 git commit，提交信息写清楚做了什么
- 停止条件：Must 全部完成且测试真实通过、REPORT.md 写完后停止；还有余力再做 Should，然后 Could。不要无限扩展

## 9. 交付物

原型目录 labs/<原型目录>/ 下必须有：README.md（如何运行）、PLAN.md、DECISIONS.md、SOURCES.md、REPORT.md。验收命令在原型目录内执行：npm install && npm run build && npm test。

REPORT.md 固定结构：
1. 一句话结果
2. 运行环境（你能确定的部分；不确定的写未知）
3. 范围完成情况：逐条列出任务书的 Must / Should / Could，标注 完成 / 部分 / 未做 及说明
4. 真实运行记录：build 与 test 的命令和结果摘要，失败的测试逐条列出
5. 数据覆盖与许可：覆盖了哪些运营商、线路、车站，各自的数据性质、许可与可否再分发
6. 与任务书的事实出入
7. 已知缺陷与风险
8. 对 SENKIRO 的可复用资产：哪些模块可以直接搬走、哪些要重写；迁移到关西（大阪—京都）需要什么
9. 开源检查：确认未提交密钥、不可再分发的数据与官方图片，列出主要依赖许可
10. 人工介入记录（如有）
