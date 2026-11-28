# Dispatch Brief · P0-S3（Wave 1 并行 · 原创设计系统、三语体系与全屏铁道地图应用主壳）

> **执行轮次**：Wave 1（需在 `P0-W0` 合入 `integration/phase-0` 后启动；与 `P0-S1`、`P0-S2` 三路并行）  
> **推荐订阅模型**：Claude（设计系统与体验主架构）  
> **基准分支**：`integration/phase-0`（已合入 `P0-W0`）  
> **新建分支**：`feat/p0-ui-web-shell`  
> **建议工作树路径**：`E:\Workteree\SENKIRO\p0-ui-web-shell`  
> **独占路径 `ownedPaths`**：
> - `packages/ui-kit/**`
> - `apps/web/**`
> - `docs/dispatch/reports/p0-s3-ui-web-shell.md`

---

## 📋 一键复制启动提示词（直接粘贴给新工作树内的 Agent）

````markdown
你正在独立 Git Worktree 中执行 SENKIRO 主线 Phase 0 Wave 1 并行任务 `P0-S3`。
请先完整阅读以下资料：
1. `docs/brand-v1.0.md`（SENKIRO 品牌视觉气质、模块命名体系与禁用写法）
2. `docs/plan-v1.0.md`（§0.1 D-02/D-05、§0.3 技术规范）
3. `docs/01-domain-contract-v1.0.md`（§1 诚实性规则、§2 一级三语、§6 `AppSearchParams` URL 深链契约）
4. `docs/dispatch/HANDOFF_PROTOCOL.md`
5. `packages/contracts/src/` 下的实际 TypeScript 定义

### 你的边界铁律
- **当前分支**：确认基于合入 `P0-W0` 后的 `integration/phase-0` 切出 `feat/p0-ui-web-shell`。
- **独占修改范围 `ownedPaths`**：仅允许创建/修改 `packages/ui-kit/**`、`apps/web/**`、`docs/dispatch/reports/p0-s3-ui-web-shell.md`。严禁修改根 `package.json`、`packages/contracts`、`packages/station-3d` 等他人目录！
- **禁止导入未合入的同波次包**：由于本任务与 `P0-S1`/`P0-S2` 并行，你在 Wave 1 阶段**只能依赖 `@senkiro/contracts` 和 `@senkiro/ui-kit`**；在 `apps/web` 中通过清晰的槽位接口（Slot / Lazy Panel）预留 `StationExplorer` 与 `LocalDbStatusProbe` 挂载点，最终联调接线由主控在集成分支统一完成！
- **Zero-Codegen 约束**：使用 `@tanstack/react-router` 时**必须使用纯代码路由树（`createRootRoute` / `createRoute`）**，严禁引入 `@tanstack/router-plugin` 或路由文件自动生成器！
- **品牌与版权铁律**：UI 署名严格使用 `SENKIRO`（及子模块 `Atlas / Route / Tickets / Journey / Profile`）；严禁复制 JR/私铁/地铁官方 Logo、官方地图图片或站内图。
- **Git 提交署名**：每次 `git commit` 末尾必须包含：
  `Co-authored-by: gemini-code-assist[bot] <176961590+gemini-code-assist[bot]@users.noreply.github.com>`

### 分里程碑执行要求
- **M1（`@senkiro/ui-kit` 原创日式导视设计系统）**：
  - 搭建 `CSS Variables` 语义设计令牌 + `CSS Modules` + `@radix-ui/react-*` 无头无障碍原语（禁止 Tailwind，确保高密度铁路导视质感与暗/亮双主题一致）：
    - 浅色（和纸白基底 + 墨灰文字 + 精密细线）与深色（石墨 `#181c22` / `#262b33` 基底 + 高对比可读正文），严格按路线识别色仅作细色条/站号徽章点缀，不铺满大背景；
    - 交付核心原子组件：`<LineBadge />`（站号前缀+识别色条）、`<ProvenanceTag />`（展示 `DataNature` 与点击溯源）、`<UnknownValue />`（未核实 `null` 诚实占位，三语文案）、`<SegmentedControl />`、`<FloatingCard />`、`<DrawerPanel />`（桌面侧栏 / 移动端 Bottom Sheet 响应式无障碍兼容）；
    - 编写组件渲染与无障碍属性单元测试，绿灯 `git commit`（M1）。
- **M2（`apps/web` 全屏地图主壳、三语体系与强类型 URL 路由）**：
  - 基于 `Vite + React 19 + @tanstack/react-router（纯代码路由） + zod + zustand` 搭建 Web 主应用：
    - 一级三语体系（`zh-CN / ja / en`）：完整翻译壳层文案、模块标题、区域切换（`京阪神核心圈 / 关东预览区`）、诚实性说明与未知提示，使用 `@senkiro/contracts` 的 `resolveLocalizedName` 展示实体名称；
    - **全屏铁道地图底板主壳**（符合 D-02 首页形态）：全屏 `100dvh` 背景画布容器（Phase 0 提供无需密钥的精密坐标网格/区域中心预置与 `MapLibre GL JS` 挂载就绪态，含梅田/京都/新宿枢纽快速入口卡片，无任何虚假线路绘制）；
    - **左上悬浮中枢（Floating Command Dock）**：集成快捷出发/到达搜索框入口（点击切换或展开 `Route` 面板）与五大一级模块紧凑导航（`Atlas` / `Route` / `Tickets` / `Journey` / `Profile`），支持移动端窄屏适配与键盘导航；
    - 强类型 `AppSearchParams` 双向同步：切换语言、深浅色主题、区域（`kansai` / `kanto`）、模块或枢纽预览时实时反应到 URL Query 且刷新不丢失。
  - 绿灯 `git commit`（M2）。
- **M3（组件与路由测试、构建验收与交付报告）**：
  - 编写 Vitest + Testing Library 单测：覆盖 `zh-CN / ja / en` 三语切换、浅色/深色主题切换、`kansai / kanto` 区域切换、`AppSearchParams` Zod 校验与异常参数安全回退、五大模块路由切换及桌面/窄屏布局无报错。
  - 运行 `pnpm --filter @senkiro/ui-kit --filter @senkiro/web check && pnpm ... build && pnpm ... test` 全部零警告通过。
  - 按 `docs/dispatch/HANDOFF_PROTOCOL.md` 撰写并提交 `docs/dispatch/reports/p0-s3-ui-web-shell.md`（`READY_FOR_MERGE`）。
````

---

## 视觉与诚实性提醒

- 枢纽快捷入口（梅田、京都、新宿）在 Phase 0 阶段如果对应数据尚未注入：京都明确标注「Phase 1 建设中（诚实占位）」，梅田与新宿标注为「待连接 `@senkiro/station-3d` 枢纽槽位」，切勿编造假路线或假时刻。
- 若 5 小时窗口配额接近 95%，在当前绿灯 Commit 停下并写入 `PAUSED_QUOTA` 交接报告。
