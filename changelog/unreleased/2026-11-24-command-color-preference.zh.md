# 命令只在用户设了 `NO_COLOR` 时才丢颜色

- **Date:** 2026-11-24
- **Type:** fix
- **Scope:** `core`

[English](2026-11-24-command-color-preference.md)

Agent 用 `exec_command` / `input_command` 启动的命令，过去无条件收到 `NO_COLOR=1`。用户自己想看颜色
（或某个工具只是因为看见 `NO_COLOR` 就整段换成纯文本）时，唯一的出路是往密钥保险柜里塞 `FORCE_COLOR`。
现在这条变量不再被钉死：宿主环境里有 `NO_COLOR` 就照常继承，没有就不给 —— 保险柜里的值也照常生效。

## 细节

- `packages/core/src/environment/tools/command/session-manager.ts`：`HARDENED_ENV` 去掉 `NO_COLOR: "1"`。
  同一张表里 `TERM=dumb`、`PAGER` / `GIT_PAGER`、`GIT_EDITOR`、`GIT_TERMINAL_PROMPT` 一个没动 —— 它们治的是
  「命令卡在等人输入」，颜色不在其列。`FORCE_COLOR` / `CLICOLOR_FORCE` 仍照旧从子进程环境里**移除**（不是置空：
  Node 把空的 `FORCE_COLOR` 读成「强制 16 色」），所以管道里的命令仍然不会被一个继承来的强制色变量刷成
  ANSI 转义串；这正是仓库里 `#102` 那条规则，没有回退。
- `packages/web/src/lib/strip-ansi.ts` 的文件头注释跟着改：渲染时剥 ANSI 仍然保留，但它防的是「修复前录下的
  Trace」与「自己硬上色的程序」，不再是「命令工具钉了 `NO_COLOR=1`」。
- `packages/docs/content/configuration.{zh,en}.md` 的环境表：`NO_COLOR` 从「始终取固定值」那一行里移出，
  并写清它现在的规则。

## 兼容性

接口、数据根、密钥保险柜的语义都没变。唯一的可见差别是：Agent 跑的命令不再默认看到 `NO_COLOR`；想保持旧行为
在保险柜里设一个 `NO_COLOR` 即可，想强制上色设 `FORCE_COLOR`。
