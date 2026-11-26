# 默认提示词亲自核对交付物，精修过程中也先落一份可用的候选

- **Date:** 2026-11-27
- **Type:** feat
- **Scope:** `core`

[English](2026-11-27-default-prompt-deliverable-check.md)

移植自上游 PenguinHarness（#1880，提交 `ef6c8ce99`）。

内置的系统提示词原来只说「交付前检查请求里的每个问题都解决了」「用项目自己的命令验证」—— 两句话都没说**拿什么去比**，于是一个把字面量、路径、筛选条件或要求的输出差一点的交付物，照样会被报成「已验证」。

`# Success criteria` 现在写明了核对的对象：用户的明确要求，包括字面量、路径、筛选条件与要求的输出；指定了确切内容时整份比对（文件、回复、字段），做转换或筛选时各取一个该被改动 / 该被包含的用例和一个该被保留 / 该被排除的用例来查。项目有文档的检查照旧跑，但文档检查覆盖不到的要求或具体风险要补一个针对性的检查 —— 并且只报真正观察到的结果。

另有两处小规则：`# Stop rules` 说同一个失败反复出现、上一次检查没能缩小原因时，先用一个便宜的办法分清最可能的几种原因，而不是直接重跑整套；`# Tool use` 要求候选手里已经有了要求格式、该有的部分都在时，先把它存到要求的路径再继续精修，免得长构建跑完只剩一段对文件的描述。

## 细节

- `packages/core/src/state/default-config.ts`：`DEFAULT_SYSTEM_PROMPT` 的 `# Success criteria`（两行重写）、`# Stop rules`（加一行）、`# Tool use`（加一行；「命令非交互运行」那一行补上无人值守 Debian 安装、要活过会话的服务、后台完成通知与退出状态）。
- `packages/core/src/state/kernel-history.ts`：`KERNEL_VERSION` `2026-11-18` → `2026-11-27`；旧的提示词 tab 哈希移进 `KERNEL_SUPERSEDED_TAB_HASHES.prompt`，重算出的哈希写进 `KERNEL_DEFAULT_TAB_HASHES.prompt`；世代清单加一条说明移动了什么。只有提示词这一个 tab 移动。

## 兼容

默认值有实质变更，所以内核版本前进：提示词 tab 从没被用户改过的 Agent，下次装载时自动前进；改过的整块保留，与从前一致。不动接口、不动已存数据、没有新依赖；配置里的 `kernel_version` 在内核更新应用时重新打戳。
