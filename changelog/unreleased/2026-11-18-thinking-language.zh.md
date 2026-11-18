# 默认提示词请模型用用户的语言思考，而不只是用用户的语言回答

- **Date:** 2026-11-18
- **Type:** feature
- **Scope:** `core`

[English](2026-11-18-thinking-language.md)

默认系统提示词整篇是英文，语言那句话只管**回复**：`always reply in the user's language`。于是
即使对话是中文，模型的思考（界面上那块带思考的过程，用户看得到）也照样用英文写，读起来像一段
旁白，和它正在回答的那个用户无关。

现在 `# Personality` 里紧接着回复那条，多了一句要求思考也用同一种语言：思考是给用户看的，所以
它与回复同语，不默认退回英文。这是一句提示词，不是开关：模型有多听话各不相同，能减少英文思考，
不保证清零。

## 细节

- `packages/core/src/state/default-config.ts`：`DEFAULT_SYSTEM_PROMPT` 的 `# Personality` 一句
  （英文原文仍用英文写，因为它本就是这个模板的语言）。
- 这是默认值的实质变更，按内核版本机制走：
  `packages/core/src/state/kernel-history.ts` 的 `KERNEL_VERSION` 由 `2026-11-15` 前进到
  `2026-11-18`；`KERNEL_DEFAULT_TAB_HASHES.prompt` 写进新哈希
  `bdfdd83c…a2af2`，旧哈希 `6dc01249…69825` 追加进 `KERNEL_SUPERSEDED_TAB_HASHES.prompt`（冻结，
  记录它曾经发出过）；世代清单加一行说明移动了什么。
- 效果：任何 Agent 的 `system_config.yaml` 只要 `kernel_version` 落后于当前版本，就会在下次装载时
  按 tab 判定——**没被改过的 prompt tab 自动前进**到新默认，被用户改过的 tab 照旧整块保留。也就是
  说这条规则会随新版本抵达所有 Agent，而不是只影响新建的。

## 测试

- `packages/core/test/kernel-version.test.ts` 19 条全过（pinned-hash 门禁精确点名 `prompt` 一个 tab
  移动，改完后归零；另有 LEGACY 模板重建、tab 归属、`isKernelOutdated` 与 `applyKernelUpdate` 的
  各条）。
- `packages/core` 全量：70 个文件 / 1456 条通过（6 条跳过）。
- 新哈希取自 `computeKernelTabHashes(defaultSystemConfig())`，其余六个 tab 与上代一致。

## 兼容性

提示词文本与内核版本号变化；配置格式、接口都没动。已存的 Agent 配置由既有内核更新机制处理：
未改动的 prompt tab 前进，改动过的保留，恢复默认随时可用。
