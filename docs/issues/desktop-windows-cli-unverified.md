---
title: "desktop: Windows 打包形态下的自带 CLI 安装与用户 Path 写入没在真 Windows 上跑过"
labels: [未验证, scope:desktop, P2]
---

## 现象

本轮给桌面壳加了「装了桌面版，终端里就能敲 `adelie`」（`cli-link.ts` / `cli-install.ts`）。
它在 **Linux + Xvfb** 上真跑通了：启动脚本写进 `~/.local/bin/adelie`、可执行、直接跑得出
`adelie 0.1.0`（证据见下）。但**打包后的 Windows 形态一次都没跑过**，而 Windows 恰好是
差异最大的那条路：

- 启动脚本是 `.cmd`（`set ELECTRON_RUN_AS_NODE=1` + `"<exe>" "<cli.js>" %*`），
  语法只在纸上验过；
- 用户 Path 的写入走 PowerShell 的 `[Environment]`（读用户级 Path → `mergeUserPath` 合并 →
  写回），而不是 `setx`（`setx` 会把超过 1024 字符的 Path 截断）；
- CLI 入口的位置：打包后是 `<app>/cli-dist/cli.js`，靠 `electron-builder.yml` 里
  `from: ../cli/dist` → `to: cli-dist` 的映射带进去，而这个布局没在真安装包里核对过。

## 复现

```bash
cd packages/desktop && pnpm build
pnpm pack:win        # 需要 Windows 环境或 wine；本机没有
```

装完之后在**新开的**终端里：

```bat
where adelie
adelie --version
```

Linux 侧等价验证（这一条跑过，通过）：

```bash
HOME=/tmp/h XDG_CONFIG_HOME=/tmp/c xvfb-run -a ./node_modules/.bin/electron . --no-sandbox
/tmp/h/.local/bin/adelie --version     # → adelie 0.1.0
```

## 期望

在真 Windows（或 CI 的 windows-latest）上装一次、确认三件事：

1. `%LOCALAPPDATA%\Adelie\bin\adelie.cmd` 存在且内容含 marker；
2. 新开终端里 `adelie --version` 能跑（说明 Path 合并生效、`ELECTRON_RUN_AS_NODE` 在
   打包后的 exe 上确实生效）；
3. 安装目录里 `cli-dist/cli.js` 旁边的 `assets/`、`web-dist/` 都在（`cli.js` 会按相对
   路径找它们）。

## 影响

- 只有 Windows 用户踩到，而 Adelie 桌面端目前**只做 Windows** —— 也就是全部桌面用户。
- 失败时的表现不是崩溃，而是「装了但敲不到」或者敲了报模块找不到：用户会以为是自己
  的环境问题，不会报给我们。
- 绕过办法：在 Windows 上手动 `set ELECTRON_RUN_AS_NODE=1` 后跑 exe 指向 cli.js；
  或者干脆用 npm 装 `@lmliheng/adelie`。

## 证据

- 已跑通的 Linux 侧：`packages/desktop/src/cli-link.ts`（脚本生成）、`cli-install.ts`
  （`ensureCliCommand` / `persistUserPath`）；启动日志一行
  `自带 CLI：已安装 …/.local/bin/adelie；… 不在 PATH 里：…`。
- 单测：`packages/desktop/test/cli-link.test.ts`（17 条）、`test/cli-install.test.ts`（6 条）——
  只证明纯函数对，**不证明打包形态对**。
- 未验证的部分：`windowsLauncherScript` 的 `%*` 传递、
  `persistUserPath` 里两条 `powershell.exe` 调用的编码与退出码、
  `electron-builder.yml` 的 `cli-dist` 映射。
- 参考实现：`docs/research/penguin-desktop-features.md` §1「安装 penguin 命令（Windows）」
  —— Penguin 用 `reg add HKCU\Environment /t REG_EXPAND_SZ`。
