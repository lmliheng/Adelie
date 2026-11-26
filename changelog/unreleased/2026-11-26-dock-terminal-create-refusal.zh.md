# 从停靠面板选择器里开的终端起不来时，原因留在选择器下面

- **Date:** 2026-11-26
- **Type:** fix
- **Scope:** `web`

[English](2026-11-26-dock-terminal-create-refusal.md)

空着的停靠面板显示的是选择器；在它上面点「终端」而服务端起不来一个 shell 时，屏幕过去和点之前一模一样：那一行还在、终端没出现，原因只在一条六秒后自己消失的通知里。再点一次是唯一能做的事，而屏幕上没有一句话说明发生了什么。

选择器就是发起这次请求的那个表面，所以那句话现在留在它下面 —— 界面自己的措辞加上服务端的理由（响应体里的 `error.message`，不是整行原始线路信息）—— 直到下一次尝试；后来某次成功会把这句话收走，新的尝试会替换它。没有自己表面的调用者照旧走通知：已打开标签页上按「+」，或者停靠面板收起时按终端快捷键（`dock.spec.mjs` 仍钉着那条路）。

## 细节

- `packages/web/src/features/dock/dock-terminal.ts`：一个模块级 store（`subscribeTerminalCreateRefusal` / `readTerminalCreateRefusal` / `clearTerminalCreateRefusal`），只在选择器在屏时写入 —— 即 `dockViews()` 里有一个没有标签页的视图；另有 `terminalCreateRefused(detail)`：响应体带 `error.message` 时用它，否则保留整行详情。
- `packages/web/src/features/dock/dock-panel.tsx`：选择器下面的 `role="alert"` 一行（`data-testid="dock-terminal-create-refusal"`），有标签页取代选择器时收走。
- `packages/web/src/lib/strings{,-en}.ts`：`terminal.createRefused(reason)`。
- `packages/web/test/dock-terminal-create-refusal.test.ts`（5 条）与
  `packages/web/e2e/dock-terminal-create-refusal.spec.mjs`（选择器这条路：那句话活过 toast 的寿命、通知区 0 条、恢复后一次成功把它清掉）。

## 兼容

只改 Web App，而且只改空选择器这条路：键盘那条路与已有标签页上的「+」仍然用通知，终端接口没有变化。
