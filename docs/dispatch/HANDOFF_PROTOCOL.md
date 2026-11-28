# SENKIRO 多工作树人工分发与交接总规程（Handoff Protocol v1.0）

> **适用模式**：Chief Coordinator（主控）输出自包含派单书与提示词 → Morii 手动在 GUI 新建 Git Worktree 并粘贴提示词分发任务 → 子工作树完成并生成交接报告 → 回主控验收、增量 `--no-ff` 合并与下游推进。

---

## 1. 新建工作树四要素规范

每次分发新任务前，派单书必明确定义以下四要素：

| 要素 | 规范说明 | 示例 |
| --- | --- | --- |
| **Base Branch（基准分支）** | 必须从当前阶段最新的集成线分支切出 | `integration/phase-0` |
| **Target Branch（新建分支）** | `feat/<session-slug>` | `feat/p0-w0-contracts` |
| **Worktree 路径建议** | 推荐仓库外 `E:\Workteree\SENKIRO\<slug>`，或仓库内已 `.gitignore` 忽略的 `E:\SENKIRO\worktrees\<slug>` | `E:\Workteree\SENKIRO\p0-w0-contracts` |
| **`ownedPaths`（独占路径白名单）** | 该工作树唯一允许创建/修改/删除的路径 glob 列表 | `packages/contracts/**` |

> **创建工作树示例命令（可在 Git GUI 或终端执行）**：
> ```powershell
> git -C "E:\SENKIRO" worktree add -b feat/p0-w0-contracts "E:\Workteree\SENKIRO\p0-w0-contracts" integration/phase-0
> ```

---

## 2. 并行隔离五大铁律（Zero Cross-Zone Edits）

1. **严禁越界改文件**：子工作树只能修改派单书 `ownedPaths` 范围内的文件。严禁顺手修改 `docs/01-domain-contract-v1.0.md`、他人负责的 `packages/*` 或根 `package.json`（`P0-W0` 除外）。
2. **契约变更申请走报告通道**：若实现中发现 `packages/contracts` 缺少字段或根 `package.json` 需要增补共享依赖，**不得擅自修改**，必须写入交接报告 `docs/dispatch/reports/<session-id>.md` 的 `## Contract Requests` 小节并停下，交由主控统一升级契约并合入 `integration/phase-X` 后再 `git merge integration/phase-X`。
3. **只读读取历史 Lab 基准**：迁入 Lab A/B/C 资产时，仅使用 `git show <lab-branch>:<path>` 只读查看或复制提取至正式 `packages/*`；**严禁切分支、严禁修改 `labs/` 或 `labs/_worktrees/*` 内任何文件**。
4. **Zero-Codegen（零代码生成）红线**：禁止引入需要生成临时源码文件才能通过 `typecheck` 的工具链（如 GraphQL/Prisma/路由文件生成器）；所有依赖安装后必须直接通过 `pnpm check && pnpm build && pnpm test`。
5. **统一 Git 提交署名**：每次里程碑 `git commit` 必须保留清晰的提交信息，并在末尾附带项目规定的 Trailer（若所在工具要求标注自身 Co-authored-by 可并列附带）：
   ```text
   Co-authored-by: gemini-code-assist[bot] <176961590+gemini-code-assist[bot]@users.noreply.github.com>
   ```

---

## 3. 5 小时窗口「95% 配额安全停机接力」规程

为避免订阅额度耗尽导致长上下文丢失，每份派单书均切分为 `M1 / M2 / M3` 原子里程碑（约 30～45 分钟/档）：

1. 每完成一个里程碑，立即运行本包级检查（如 `pnpm --filter <pkg> test`）并在绿灯状态下执行 `git commit`。
2. 当检测到当前账号 5 小时滚动窗口用量接近 **95%**（或需要换人接手）时，**必须立即停止新开代码改动**：
   - 确保当前工作区没有半截报错（必要时将未收尾试写回滚到上一个绿灯 Commit，或完成当前小步单测再提交）；
   - 将 `docs/dispatch/reports/<session-id>.md` 状态标记为 `Status: PAUSED_QUOTA`；
   - 在报告中写明：当前分支名、最新绿灯 Commit SHA、已完成里程碑、已通过检查命令、未完成步骤以及「给下一任接手模型的恢复指令」；
   - 提交该交接报告。另一空闲模型只需基于同一工作树目录和交接报告即可秒级接续。

---

## 4. 标准交接报告格式（`docs/dispatch/reports/<session-id>.md`）

每个子工作树结束（无论是 `READY_FOR_MERGE` 还是 `PAUSED_QUOTA`）必须在 `ownedPaths` 内写出对应的交接报告：

```markdown
# Dispatch Report — <Session ID>

- **Status**: `READY_FOR_MERGE` | `PAUSED_QUOTA` | `BLOCKED`
- **Branch**: `feat/...`
- **Base Commit**: `<sha>`
- **Head Commit**: `<sha>`
- **Model Used**: `<model name>`

## 1. Owned Paths Check
- Modified/created files stay strictly inside `ownedPaths`: `YES` / `NO`
- Output of `git diff --name-only <base>...HEAD`:
  - ...

## 2. Milestones Completed
- [x] M1: ...
- [x] M2: ...
- [ ] M3: ...

## 3. Verification Results (Real Runs Only)
- Command: `pnpm ...` → Exit `0`, summary: `...`
- Unrun checks (if any): `...`

## 4. Contract Requests (if any)
- None / List requested interface or root dependency changes with rationale.

## 5. Open-Source & Honesty Self-Check
- [ ] No API keys, tokens, `.env` or `data/raw/` committed
- [ ] No fabricated station/fare/schedule facts; unknowns use `null`
- [ ] Synthetic data / non-valid tickets explicitly guarded

## 6. Resume Instructions (Required if PAUSED_QUOTA or BLOCKED)
- Exact next step to execute upon resume.
```

---

## 5. 回主控汇合操作 SOP

当某工作树完成并报告 `READY_FOR_MERGE` 时，Morii 只需在主控会话输入一句指令，例如：

> 「`feat/p0-w0-contracts` 已完成，报告在 `docs/dispatch/reports/p0-w0-contracts.md`，请主控核验并合入 `integration/phase-0`。」

主控随后依次执行：
1. 核验 `git diff --name-only integration/phase-0...feat/<slug>` 是否 100% 落于 `ownedPaths`；
2. 检查 `git ls-tree` 开源合规性（无密钥/无受限 raw 数据）；
3. 在 `integration/phase-0` 执行 `git merge --no-ff feat/<slug>` 并运行全量验证命令；
4. 若为 `P0-W0` 完成，正式放行 Wave 1 三路工作树从更新后的 `integration/phase-0` 切出并同步启动！
