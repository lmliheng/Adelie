---
title: "cli: 实验 TUI 仍硬编码 DeepSeekProvider，换不到别家"
labels: [欠账, scope:cli, P3]
issue: 2
---

## 欠了什么

`packages/cli/src/vue-tui/composable/useAgent.ts` 直接 `new DeepSeekProvider(...)`，
不看 `ModelRef`：

```
3:import { DeepSeekProvider } from 'adelie-providers'
75:        const provider = new DeepSeekProvider({
```

于是 CLI 主流程（`src/cli.ts`，P2 已改成读 `host.state.model.provider`）能换家，
而这条实验 TUI 路径不能 —— 在 Kimi 的密钥下它会拿 DeepSeek 的端点去请求。

## 为什么当时这么办

它是实验路径，没接进 `cli.ts` 的入口，P1/P2 都只动主流程；顺手改它会把两件事
混在一个提交里（而且它自己也没有测试）。

## 什么条件下该还

两条路，任选：

1. 让 `useAgent.ts` 与 `cli.ts` 共用同一个 provider 构造入口（`createProvider(provider, ...)`
   加上模型目录），顺带给它补一条测试 —— 那就等于把它接成正式路径；
2. 或者删掉整个 `vue-tui/`，承认这条路不走了。

在这之前它只能是「知道了，别用」：`README.md` 里没有提它，因为没有人在用。

## 证据

- `packages/cli/src/vue-tui/composable/useAgent.ts:3`、`:75`
- 对照：`packages/cli/src/cli.ts` 的 `runOne()`（P2 改为读 `host.state.model.provider`）
- 记于 `CHANGELOG.md` 的 P2 一节与 `docs/redesign.md` §11
