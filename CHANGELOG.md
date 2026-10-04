# CHANGELOG

## 未发布 — 重构 P1–P2（对照 penguin-harness 的设计）

分六期重构（方案见 docs/redesign.md）。P1 与 P2 已落地并通过全仓验证。

### P1 — 模型目录与多厂商

- `adelie-core/src/config/model-catalog.ts`：一张表登记四家提供方（deepseek / openai /
  kimi / qwen）—— 端点、密钥环境变量、可选模型；`PROVIDER_NAMES`、
  `PROVIDER_ENV_KEYS`、`DEFAULT_PROVIDER`、`providerGroup`、`envKeyForProvider`、
  `defaultBaseUrlForProvider`、`defaultModelForProvider` 都从它派生。
- 新增 `adelie-providers` 的 `kimi.provider.ts`（`MOONSHOT_API_KEY`）与
  `qwen.provider.ts`（`DASHSCOPE_API_KEY`，DashScope 兼容模式）；`Provider.ts` 的密钥表
  与工厂改为从目录派生，加一家厂商 = 加一组。
- CLI 的 `--provider` 合法值与默认模型走目录；服务端 `writeApiKey` 与 CLI
  `writeUserEnvKey` 写出的 `.env` 权限收到 **0600**（对已存在的文件也 `chmod`）。
- 删掉两个 0 字节的 `anthropic.provider.ts` / `gemini.provider.ts`。
- 新增 26 个测试（core 7 / providers 13 / server 6）。

**未验证**：kimi / qwen 的模型 id 取自公开文档，本机没有密钥，**从未发过真实请求**。

### P2 — 模型引用贯穿全局

- `adelie-core/src/types/ModelRef.ts`：`{ provider, model }` 一条引用，配
  `formatModelRef`（只用于显示）、`parseModelRef`（只切第一个斜杠）、`sameModelRef`、
  `isModelRef`（会话头/事件流是 `unknown`，走判据而非断言）。
- 它现在贯穿三处：**配置**（`ServerSettings.model` / CLI `SessionSettings.model`）、
  **会话头**（`SessionStore` 的 `SessionMeta.model`）、**run 事件头**
  （`task_started.payload.model`）。用量与成本将来按它归属。
- 服务端：`GET /api/models` 新增（groups 带 id/label/envKey/hasApiKey/models，**不含
  端点**），成为界面下拉框的唯一出处；`PATCH /api/config` 收 `model` 对象，`model` 省略
  时「同家沿用、换家落默认」；保留 0.1 客户端的平铺 `provider` 兼容字段。
- 会话视图新增 `model`（建的时候）与 `lastModel`（最近一轮实际用的，来自最后一条
  `task_started`）—— 两者不一致就是中途换过模型。
- CLI：`/model 提供方/模型` 或只给型号；`/status`、密钥状态、provider 构造都读当前模型
  的提供方。
- Web：设置弹窗从 `GET /api/models` 渲染提供方下拉（换家自动落到新家默认模型）与模型
  `datalist`（可手填），并显示该配哪个环境变量、配没配。

**未接入**：`packages/cli/src/vue-tui/composable/useAgent.ts` 仍硬编码 `DeepSeekProvider`
（CLI 的实验 TUI 路径，P2 未动）。

## 0.1.0 — 2026-10-04

第一个版本：把 AgentCode 里的 agent 应用迁到 Adelie，并给它加上三种新外壳。

### 引擎（从 AgentCode 迁入并改名）

- `adelie-core` / `adelie-providers` / `adelie-tools` / `adelie-runtime`：ReAct 循环、计划与
  真 replan、审批（默认拒绝 + 决定入事件流）、多重预算与 token 闸门、上下文折叠、
  交付物断言与回归验收、会话持久化 / 恢复 / 导出、MCP stdio 客户端、fs-guard 边界。
- 用户级配置目录 `~/.adelie/`；工作区指令文件认 `ADELIE.md` / `AGENTS.md` / `CLAUDE.md`。
- 迁移验证：类型检查与构建通过，**557 个测试通过 / 7 个跳过**（core 66、providers 37、
  tools 190、runtime 149、cli 115）。

### 新增

- `adelie-server`：HTTP + SSE 后端（会话、对话流、工具审批、取消、静态托管），契约见 docs/api.md。
- `adelie-web`：React + Vite 的对话界面，移动优先，含工具时间线、审批卡、设置与用量；可安装 PWA。
- `adelie-desktop`：Electron 壳（Windows）：挑端口、内置服务端、单实例、优雅退出；NSIS 安装包与免安装版。
- `adelie` CLI 新增 `--version`。
- 品牌：名字 Adelie 与图标（brand/BRAND.md）。
