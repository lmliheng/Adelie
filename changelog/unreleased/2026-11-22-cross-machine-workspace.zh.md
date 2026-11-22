# 从别的机器搬过来的会话，接着发消息就能继续

- **Date:** 2026-11-22
- **Type:** fix
- **Scope:** `core`, `server`

[English](2026-11-22-cross-machine-workspace.md)

把一段 Trace 从另一台机器导入进来（或者在本机清理把临时工作区收走之后），那个会话就再也发不出
消息了：恢复时它照着 Trace 里记的路径去找工作区，那是**那台安装**的路径，本机没有，于是报
`The original Session's Workspace no longer exists: …; cannot resume.`

现在分两种判法。「没给目录时自动建的那个」临时工作区（`workspaces/tmp-<8hex>`）在本机按同名重建：
它里面没有任何用户的东西，不重建的话迁移过来的会话就永远接不下去。用户自己指过的那个目录
**一个字都不动**——里面的文件是他的，一个悄悄换到别处跑起来的会话比一个拒绝恢复的会话更糟——
它不在时恢复照旧失败，只是理由变成了界面里已有的那句 `workspace_missing`，不再是英文原文。

## 细节

- `packages/core/src/internal/session-support.ts`：新增 `isTemporaryWorkspace()` 与
  `adoptTemporaryWorkspace()`（在本机 `workspaces/` 下按同名递归建目录，幂等），
  `createTempWorkspace` 改用同一组常量。
- `packages/core/src/agent.ts`：新增导出类 `WorkspaceGoneError`；`resumeSession` 遇到不存在的工作区时，
  只有临时工作区会重建，其余照旧抛错（原来那条「不是目录」的错误保留）。
- `packages/core/src/index.ts`：桶导出加上 `WorkspaceGoneError`。
- `packages/server/src/runtime/session-manager.ts`：恢复时把这个错误翻译成
  `HttpError(409, "workspace_missing")`，界面因此说中文那句。
- `packages/docs/content/sessions-and-traces.{zh,en}.md`：恢复那节写清两种工作区的差别，迁移那节
  补一句导入后的会话怎么处理。

## 测试

- `packages/core/test/resume.test.ts`（+2，1 条改名）：临时工作区不存在时在本机重建；用户选的目录
  不存在时**不**自动创建（PRN-004）。
- `packages/server/test/session-loader.test.ts`（改 1 加 1）：用户选的目录不见了回 `409 workspace_missing`；
  别的安装的临时工作区在本机重建后能加载。

## 兼容性

只多了一个可选行为与一个错误类型；数据根、Trace 格式与接口形状都没变。
