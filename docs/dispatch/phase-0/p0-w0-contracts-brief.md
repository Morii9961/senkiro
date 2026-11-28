# Dispatch Brief · P0-W0（Wave 0 · Monorepo 底座与全域契约 `@senkiro/contracts`）

> **执行轮次**：Wave 0（**全 Phase 0 最优先单路**，完成后需先回主控合入 `integration/phase-0` 再并发启动 Wave 1）  
> **推荐订阅模型**：GPT / Codex（或 Gemini）  
> **基准分支**：`integration/phase-0`  
> **新建分支**：`feat/p0-w0-contracts`  
> **建议工作树路径**：`E:\Workteree\SENKIRO\p0-w0-contracts`  
> **独占路径 `ownedPaths`**：
> - `package.json`
> - `pnpm-workspace.yaml`
> - `turbo.json`
> - `biome.json`
> - `tsconfig.base.json`
> - `vitest.config.ts`
> - `packages/contracts/**`
> - `docs/dispatch/reports/p0-w0-contracts.md`

---

## 📋 一键复制启动提示词（直接粘贴给新工作树内的 Agent）

````markdown
你正在独立 Git Worktree 中执行 SENKIRO 主线 Phase 0 Wave 0 任务（`P0-W0`）。
请先完整阅读以下三份权威文档再动手：
1. `docs/plan-v1.0.md`（§0.3 技术基线、§1 隔离开发纪律）
2. `docs/01-domain-contract-v1.0.md`（《SENKIRO 全域领域契约规范 v1.0》）
3. `docs/dispatch/HANDOFF_PROTOCOL.md`（多工作树交接与 95% 停机规程）

### 你的边界铁律
- **当前工作分支**：确认你位于基于 `integration/phase-0` 切出的 `feat/p0-w0-contracts`。
- **独占修改范围 `ownedPaths`**：仅允许创建/修改 `package.json`、`pnpm-workspace.yaml`、`turbo.json`、`biome.json`、`tsconfig.base.json`、`vitest.config.ts`、`packages/contracts/**`、`docs/dispatch/reports/p0-w0-contracts.md`。严禁修改其他任何文件（含 `docs/01-domain-contract-v1.0.md`、`labs/`）。
- **Zero-Codegen 约束**：严禁引入需要预先 codegen 的工具或插件。
- **Git 提交署名**：每次 `git commit` 末尾必须包含：
  `Co-authored-by: gemini-code-assist[bot] <176961590+gemini-code-assist[bot]@users.noreply.github.com>`
- **不要向人类提问**，遇到合理设计取舍自行按契约选最优解并记录。

### 分里程碑执行要求
- **M1（根 Monorepo 工程底座）**：
  - 环境确认：Node.js `>=24.0.0`、`pnpm@10.33.0`（在根 `package.json` 声明 `packageManager: "pnpm@10.33.0"` 与 `license: "AGPL-3.0-only"`）。
  - 创建 `pnpm-workspace.yaml`（包含 `packages/*`、`apps/*`）。
  - 创建 `turbo.json`（定义 `build`、`typecheck`、`lint`、`check`、`test` 任务依赖图）。
  - 创建 `biome.json`（TypeScript/React 严格格式化与 Lint 规则，忽略 `dist/`、`node_modules/`、`labs/`）。
  - 创建 `tsconfig.base.json`（开启 `strict: true`、`noUncheckedIndexedAccess: true`、`exactOptionalPropertyTypes` 或兼容严格配置、`verbatimModuleSyntax: true`、`moduleResolution: "bundler"`、`target: "ES2023"`、`skipLibCheck: true`）。
  - 根 `package.json` 暴露统一脚本：`check`（biome check + typecheck）、`build`、`test`、`typecheck`、`lint`。
  - 安装根开发依赖：`typescript`、`turbo`、`@biomejs/biome`、`vitest`、`zod` 等并生成 `pnpm-lock.yaml`（注意：若工作流允许锁文件在根目录，可一并纳入提交并在报告注明）。
  - 绿灯 `git commit`（M1）。
- **M2（`@senkiro/contracts` 全量契约实现）**：
  - 严格逐项实现 `docs/01-domain-contract-v1.0.md` 全部类型与守卫：
    - `SkId<T>` 类型与运行时构造/校验器 `makeSkId`、`isSkId`、`parseSkId`、`parseLegacyLabId`；
    - 一级三语 `Locale`（`zh-CN` / `ja` / `en`）、`LocalizedNames` 与诚实回退函数 `resolveLocalizedName`（绝不机翻）；
    - 五张领域图完整接口：`TrackGraph`、`StationGraph`、`ServiceGraph`、`FarePassGraph`、`JourneyGraph`（含 `SyncOpLogEntry`）；
    - 诚实性运行时守卫：`assertHonestFareQuote`（非 `OK` 状态强制校验 `totalAmountYen === null && breakdown.length === 0`）、`assertValidCommemorativeTicket`（强制包含 `SAMPLE · 記念用 · 乗車不可` 与 `allowsBarcode === false`）、`assertOdbLIsolation`；
    - `AppSearchParams` 的 Zod Schema（`appSearchParamsSchema`）及安全默认值解析器。
  - 绿灯 `git commit`（M2）。
- **M3（契约单测与交付报告）**：
  - 在 `packages/contracts/tests/` 编写 **≥30 条** Vitest 单元测试，覆盖 ID 校验与历史转换、三语诚实回退（含全 `null` 兜底）、非 `OK` 运价金额拒吐守卫、纪念票防伪冒守卫、四维足迹 `passed_through` 防误计类型守卫及 `AppSearchParams` Zod 解析边界。
  - 在工作树根目录运行 `pnpm check && pnpm build && pnpm test`，确认 **0 错误 0 警告**通过。
  - 严格按 `docs/dispatch/HANDOFF_PROTOCOL.md` 模板撰写并提交 `docs/dispatch/reports/p0-w0-contracts.md`（状态标 `READY_FOR_MERGE`，附完整 `git diff --name-only integration/phase-0...HEAD` 与真实测试命令结果）。
````

---

## 任务背景与技术要点补充（供主控与审查参考）

- 本次根依赖中允许将 `pnpm-lock.yaml` 一并提交，以便 Wave 1 三路工作树基于合入后的 `integration/phase-0` 获得一致锁定版本。
- `packages/contracts` 必须保持 **零运行时重依赖**（仅允许 `zod` 作为轻校验依赖），不可引入 `react`、`three` 或任何 Node 专属 API，确保 Phase 5 移动端 Expo/Hermes 可直接复用。
- 若 5 小时窗口配额接近 95%，立即按 `HANDOFF_PROTOCOL.md` §3 在绿灯 Commit 停下并写入 `PAUSED_QUOTA` 报告。
