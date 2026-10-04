---
title: "providers: Kimi 与通义的端点、模型 id 从未发过真实请求"
labels: [未验证, scope:providers, P2]
issue: 5
---

## 结论是什么

模型目录（`packages/core/src/config/model-catalog.ts`，`d3024f5` 引入）里这两组的
`baseUrl` 与 `models[]` 是照公开文档写的，对外表现得像「已支持」：

| 组 | 端点 | 模型 |
| --- | --- | --- |
| `kimi` | `https://api.moonshot.cn/v1/chat/completions` | `kimi-latest`（默认）/ `kimi-k2-0905-preview` / `moonshot-v1-32k` |
| `qwen` | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | `qwen-plus`（默认）/ `qwen-max` / `qwen-turbo` / `qwen-long` |

## 为什么没验证

本机（`64.83.2.109`）没有 `MOONSHOT_API_KEY` / `DASHSCOPE_API_KEY`，vault 里也没有。
已验证的范围只到「缺密钥时报的是『缺少 MOONSHOT_API_KEY』而不是『不支持的提供方』」——
也就是**装配**对了，**请求**没发过。

## 怎么才能验证

1. 把任一家的 key 放进 vault（`penguin config vault set MOONSHOT_API_KEY ...`）；
2. `adelie --provider kimi --model kimi-latest -p "说一个字"`，看到真实回复即可；
3. 通义同理，并额外确认 `qwen-long` 的上下文上限与我们在 `maxTokens` 上的口径没有冲突。

## 在此之前的影响

用户在设置里选中 Kimi/通义后，如果任何一个 id 或端点是错的，会收到厂商的 404/400，
而不是一条「这个模型我们没验证过」的提示。缓解办法只有一条：错哪改哪 ——
端点与 id 都在目录那张表里，改它不用动代码。

## 证据

- `packages/core/src/config/model-catalog.ts` 文件头的注释已写明「未在真机上发过真实请求」
- `docs/redesign.md` §4 的「未验证」一段、`CHANGELOG.md` 未发布一节
- P1 的真机验收只覆盖到报错文案（`docs/redesign.md` §10）
