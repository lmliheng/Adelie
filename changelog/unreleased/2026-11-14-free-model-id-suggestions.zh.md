# 用 AI 生成 id 只用项目里的免费模型

- **Date:** 2026-11-14
- **Type:** feature
- **Scope:** `server`, `web`, `docs`

[English](2026-11-14-free-model-id-suggestions.md)

每个 id 输入框旁边的**用 AI 生成**（项目、Agent、Benchmark、组织、频道）此前用的是**这个项目配置的默认模型** —— 而新建项目的种子默认是 `deepseek/deepseek-flash` 这类付费模型，于是一个只是想给项目起个 id 的动作，会按你自己的 key 花钱。它不挂会话、也不进成本中心（代码里就不记账），但厂商那边是真扣的。

现在这条请求只找**免费模型**：这个项目里 `pricing` 三个桶都是 0 的条目（模型页面上带「免费」标记的那种）。这类免费端点常被限流、也常被下架，所以不是一个，而是**按配置顺序依次试**：最多 4 个、合计不超过 30 秒，一个不给回答就换下一个，任何一个给了可用 id 就返回。项目里凡是配了 key 的 $0 条目都在这条链上 —— OpenRouter 的 `:free` 系列和 `openrouter/free` 免费路由就在其中。

**项目的默认模型不再参与这一步**，所以生成 id 永远不会花钱。代价是：项目里没有能用的免费模型时，中文名会退到名称的 ASCII 转写；连转写都做不出（纯中文、没有 ASCII）时，落到带日期的占位 id 并说明原因 —— 原因码从 `no_default_model`（未配置默认模型）改成 `no_free_model`（这个项目里没有可用的免费模型），中文与英文文案同步改了。

## 细节

- `packages/server/src/services/project-config-service.ts`：`completeOnce` 从「读 `default_model` 那一条」改成「走一遍免费条目」。新增纯函数 `freeModelEntries(raw)` —— 按配置顺序取出 `pricing` 存在且三个桶都是 0 的条目，同一引用只留一次；没有 `pricing` 的算「未定价」而不是免费，自建（vLLM/custom）那种「谁都不收费但目录里写不出价格」的行也刻意不算。
- 候选**构造不出来**（没有凭据、id 无法路由）时直接跳过，既不占用 4 次尝试、也不花等待时间 —— 否则一个塞满不可用免费行的配置会吃掉可用那条的预算。每个尝试的超时取「单次上限（15 秒）」与「剩余预算」的较小值，所以最后一条也不会超时。
- 一次都没发出去（项目里没有免费条目，或没有一条能用）→ `cause: "no_model"`；发出去过但都没回答 → `cause: "failed"`。两者都由路线记进错误中心（`id_suggest` / `id_suggest_failed`），错误面板能说明为什么只给了占位 id。
- `packages/server/src/api/types.ts`：`SemanticIdSuggestReason` 的 `no_default_model` 改名 `no_free_model`。前端遇到不认识的原因码仍会照常画一句说明（`reasonUnknown`），所以新旧前端/服务端混用不会丢提示。
- `packages/web/src/lib/strings.ts`、`strings-en.ts`：`no_free_model` 与 `model_failed` 两句改成说「免费模型」。

## 测试

- `packages/server/test/utility-completion.test.ts`：`freeModelEntries` 的取舍、配置顺序、去重与「缺桶算 0、任一桶有价就不算免费」；`completeOnce` 在项目里只有付费条目（哪怕它就是默认模型）时报 `no_model` 并给出新文案；两条没有凭据的免费行时，会**跳过第一条**、报告第二条的死因 —— 这条只有在真的往下走了才成立。另加 `utilityCompletionConfig` 的超时参数：默认 15 秒、走链时按剩余预算缩短。
- `packages/server/test/suggest-id-routes.test.ts`、`packages/server/test/organization-runtime.test.ts`：原因码与新文案同步。
- `packages/web/test/id-suggest-notice.test.ts`：原因字典与新码对齐。

## 兼容性

线上协议只换了一个枚举值（`reason`），没有新依赖、没有 Project 配置变更、没有数据库变更。行为上是**变化**而不是纯增量：以前从默认模型拿到的 id，现在只有在项目里配了可用的免费模型时才会出现；否则退到名称转写或占位 id。想改回去就在项目里把一个 $0 条目配上 key。
