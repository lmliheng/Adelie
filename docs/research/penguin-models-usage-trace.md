# PenguinHarness：Agent/模型分离 + 供应商适配 + 用量成本 + Trace

只读调研 `/root/penguin-harness`，对照 `/root/Adelie`。路径均为仓库相对路径，签名摘自源码原文。

## 结论先行
1. **Agent 从不绑定模型。** 模型在 **Session 创建时**由 `(provider, model_id)` 配对确定并写进 `session_meta`；同一 Agent 可用不同模型跑不同 Session（`packages/docs/content/models.zh.md` §「模型与 Agent」）。Agent 的 `system_config.yaml` 只放生成参数（`max_tokens`/`thinking_level`/`timeout_ms`），无模型字段。
2. **配对引用是全局唯一寻址格式**：两个独立字段，任何环节都不许拼成字符串（`packages/core/src/state/project-config.ts:41`）。
3. **协议适配全部下沉到 `@prismshadow/agenthub`**；core 只留 `LLMInterface.streamGenerate` 一个方法，`packages/core/src/llm/*` 做的是 OmniMessage ⇄ AgentHub Uni* 的翻译，不按厂商分支。
4. **用量只存 token、不存钱**，成本查询时按当前价格现算（`usage_records` 表 + `UsageService`）。Kimi/Qwen 靠 catalog 分组 + 行级 `client_type`/`base_url` 固化接入，不需要新代码。
5. **Trace 是 append-only JSONL**，一个文件 = 一段完整模型上下文；`partial_*` 不落盘。
6. Adelie 的差距是「一个 provider 名 + 一个模型名字符串」：没有模型表、没有 `client_type`、密钥表只有 DeepSeek、用量只累加 token 不折价。

## 1. Agent 与模型怎么分离

### 1.1 配置层落点
| 文件 | 承担什么 |
| --- | --- |
| `packages/core/src/state/project-config.ts` | `ProjectConfig`/`ModelEntry`/`ModelRef`/`ModelPricing`、默认值与校验、TOML 读写 |
| `packages/core/src/state/model-catalog.ts` | 内置模型目录 `MODEL_PROVIDERS` + `MODEL_CATALOG` |
| `packages/core/src/state/default-config.ts` | Agent 的 `SystemConfig`（含 `model` 生成参数块） |
| `packages/core/src/agent.ts` / `session.ts` | Session 创建/恢复时解析模型；会话内换模型 |
| `packages/cli/src/commands/config.ts` | `penguin config model add/default/vision/list/remove` |
| `packages/cli/test/config-model.test.ts` | 上述命令集成测试（落盘 0600 的 `.project_config.toml`） |
| `packages/cli/test/switch-model-command.test.ts` | `/switch-model` 解析与 409 文案 |

### 1.2 数据形状
```ts
// packages/core/src/state/project-config.ts:41
export interface ModelRef { provider: string; model_id: string }   // model_id 原样发给 AgentHub
// :71
export interface ModelEntry {
  provider: string; model_id: string; context_window?: number; vision?: boolean;
  client_type?: string;   // AgentHub 协议名；自定义/三方端点必须显式给
  display_name?: string; max_tokens?: number; fast_mode?: boolean;   // 逐模型覆盖 Agent 的值
  pricing?: ModelPricing; api_key?: string; base_url?: string; created_at?: string;
}
// :59
export interface ModelPricing { unit: "usd_per_mtok"; cache_read: number; cache_write: number; output: number }
// :170
export interface ProjectConfig {
  name?: string; default_model?: ModelRef; vision_model?: ModelRef;
  default_chat?: ProjectChatDefaults;   // { agent_id?, workspace?, approval_mode?, thinking_level? }
  command_policy?: CommandPolicyConfig; plugins?: PluginTables; models: ModelEntry[];
}
```
Agent 侧**没有** `model` 字段，只有参数（`packages/core/src/state/default-config.ts:397`）：
```ts
model?: { max_tokens?: number; thinking_level?: ThinkingLevelName; timeoutMs?: number };
```

### 1.3 Session 如何绑定模型
`Agent.createSession`（`packages/core/src/agent.ts:669`）先校验配对，再回落项目默认：
```ts
if ((opts.modelId === undefined) !== (opts.provider === undefined))
  throw new Error("A model reference must be given as a (provider, model_id) pair: …");
let ref: ModelRef;
if (opts.modelId !== undefined && opts.provider !== undefined) ref = resolveModelRef(this.projectConfig, opts.modelId, opts.provider);
else if (this.projectConfig.default_model) ref = this.projectConfig.default_model;
else throw new Error("No modelId was specified and the Project config has no default_model. …");
```
绑定结果进 `SessionSpec.creationRef`，由 `assembleContext` 读成 `AssembledContext.modelEntry`（`agent.ts:264,329`）——**凭证、`context_window`、`max_tokens`、`fast_mode` 全从这条 entry 取**；`session_meta` 记 `provider`/`model_id`/`model_context_window`（形状见 `packages/server/test/usage.test.ts:54`）。恢复会话时模型从 Trace 的 `session_meta` 读回并要求仍在配置里（`agent.ts:806`）：
```ts
const ref: ModelRef = { provider: meta.provider, model_id: meta.model_id };
const modelEntry = getModel(this.projectConfig, ref);
if (!modelEntry) throw new Error(`The original Session's Model is not in the Project config: …`);
```

### 1.4 会话中途换模型
| 操作 | 行为 | 落点 |
| --- | --- | --- |
| `/switch-model <provider> <model_id>` | **同一条 Session**：旧模型做一次 summarize 压缩关掉当前上下文，再在新模型上开下一段 | `session.ts:948`；`packages/cli/src/switch-model-command.ts`；HTTP `POST /api/projects/:p/sessions/:sessionId/switch-model`（`packages/server/src/http/routes/sessions.ts:1371`） |
| `/model`（交接） | **另开新 Session**，首条消息带 `[model_switch_from]`（源 session id + Trace 路径），历史不注入 | `packages/core/src/omnimessage/markers/origin-blocks.ts:335`；`packages/server/src/services/session-service.ts:667` |

```ts
// packages/core/src/session.ts:948
async *switchModel(opts: ModelSwitchOptions): AsyncGenerator<OmniMessage, StopReason>
// :219 —— 组合层注入的两件事
export interface ModelSwitchSupport {
  validate(ref: ModelRef): Promise<void>;
  reassembleInitialContext(ref: ModelRef): Promise<Omit<SessionOpenedContext, "llm">>;
}
export interface ModelSwitchOptions { provider: string; modelId: string; signal?: AbortSignal }
export class ModelSwitchRefusedError extends Error {
  constructor(readonly reason: ModelSwitchRefusal, message: string)
  // reason: model_not_configured | model_unavailable | compaction_not_configured
}
```

### 1.5 默认模型 vs per-agent 默认
**Penguin 里不存在 per-agent 默认模型**（全仓无 `agent_model`/`agentModel`）。默认只有 `ProjectConfig.default_model`（`defaultProjectConfig()` 写 `{ provider: "deepseek", model_id: "deepseek-flash" }`，`project-config.ts:235`），新建 Session 时复制一次即归 Project 自己所有，「sync presets」不改它。`default_chat.agent_id` 只预选 Agent，**模型仍是 top-level `default_model`**（`project-config.ts:156` 明写「The default Model is deliberately NOT here」）。其它可选模型处都显式给配对或同时省略：定时任务（`packages/server/src/runtime/schedule-file.ts:38`）、`run_subagent` 的 `provider`+`model_id`（`default-config.ts:822`）、`penguin run/chat`；省略时统一回落 `default_model`。

## 2. 供应商适配

### 2.1 真实接口
```ts
// packages/core/src/interfaces/llm.ts:20
export interface GenerativeModelConfig {
  modelId: string; apiKey?: string; resolveApiKey?: () => Promise<string | undefined>; baseUrl?: string;
  clientType?: string;   // 'openai-chat' | 'openai-responses' | 'ant-messages' | 'claude-4-8' | 'deepseek-v4' | …
  tools: ToolDefinition[]; systemPrompt?: string;
  contextWindow?: number; maxTokens?: number; fastMode?: boolean;
  thinkingLevel?: ThinkingLevelName; requestTimeoutMs?: number; sessionId?: string; toolCallIds?: ToolCallIdAllocator;
}
export interface GenerativeModelParameters { newMessages: OmniMessage[]; signal?: AbortSignal; thinkingLevel?: ThinkingLevelName } // :90
export interface LLMOutcome { status: StopReason; errorCode?: ErrorCode; errorMessage?: string } // :122 completed|aborted|retryable|fatal
export interface LLMInterface { streamGenerate(p: GenerativeModelParameters): AsyncGenerator<OmniMessage, LLMOutcome> } // :151
```
`packages/core/src/llm/generative-model.ts`（1450 行）是唯一实现：
```ts
export class GenerativeModel implements LLMInterface { /* :934 */ }
async *streamGenerate(...): AsyncGenerator<OmniMessage, LLMOutcome>   // :1127
export function usageToTokenCounts(usage: UsageMetadata): TokenCounts // :254
export function mapThinkingLevel(name: ThinkingLevelName | undefined): ThinkingLevel | undefined  // :1386
export function toolDefinitionsToSchemas(tools: ToolDefinition[]): ToolSchema[]   // :1400
export function buildUniConfig(config: GenerativeModelConfig): UniConfig          // :1422
```
| 文件 | 作用 / 关键签名 |
| --- | --- |
| `packages/core/src/llm/list-models.ts` | `listEndpointModels(options: ListEndpointModelsOptions): Promise<string[]>`（:45），host 不必直接依赖 AgentHub |
| `packages/core/src/llm/context-limits.ts` | `resolveContextWindow(contextWindow: unknown): number \| undefined`（:120）、`effectiveMaxOutputTokens(...)`（:191）、`effectiveMaxContextLength(configured, contextWindow)`（:215） |
| `packages/core/src/llm/tool-call-ids.ts` | 无 id 厂商（Gemini 用函数名当 id）会话内唯一化：`ToolCallIdAllocator.allocate/markUsed`、`stripToolCallIdSuffix(id)`；见 §2.4 |

### 2.2 模型目录从哪来
`packages/core/src/state/model-catalog.ts`（3600 行）是唯一事实源，被 core 默认配置、server 初始配置、web/cli 展示共用；不 import Node 内置，可直接打给浏览器。
```ts
// :141
export interface ModelProviderInfo {
  id: string; label: string; envKey: string; envBaseUrlKey: string;
  apiKeyUrl?: string; modelsUrl?: string; gatewayBaseUrl?: string;
  oauth?: ModelProviderOAuth; bridgeAuth?: ModelProviderBridgeAuth; balance?: ModelProviderBalance;
  addable?: boolean; clientType?: string; recommended?: boolean;   // clientType = 组级协议钉
}
// :213
export interface ModelCatalogEntry {
  modelId: string; displayName: string; provider: string; supportsVision: boolean;
  contextWindow?: number; pricing?: ModelPricing; discount?: number; offPeakDiscount?: OffPeakDiscount;
  clientType?: string; baseUrl?: string; retired?: true;   // clientType/baseUrl = 行级协议与端点钉
}
export const MODEL_PROVIDERS: ModelProviderInfo[];   // :324
export const MODEL_CATALOG: ModelCatalogEntry[];     // :669
```
分组语义靠几个谓词表达（一条规则多处共用）：
```ts
export function isVendorGroup(providerId: string): boolean    // :2946 直连厂商：无 gatewayBaseUrl、无 clientType → 只能按 model_id 拼写路由
export function unroutableVendorModel(provider, modelId, clientType?): boolean  // :2966
export function isAddableGroup(providerId: string): boolean   // :2984 只有 custom/vllm/用户自建组可手加
export function providerClientType(providerId: string): string | undefined      // :2923 组级协议钉
export function canonicalClientType(clientType: string | undefined): string | undefined // :2891 'openai' → 'openai-chat'
export function resolveModelEnv(modelId: string, clientType?: string): ModelEnvInfo | undefined  // :3013 逐分支镜像 AutoLLMClient 路由
export function resolveModelCredential(entry, env = process.env): ResolvedModelCredential        // :3250
```

### 2.3 Kimi / Qwen / moonshot / dashscope 出现在哪
| 位置 | 内容 |
| --- | --- |
| `model-catalog.ts:443-450` | 厂商组 `moonshot`，label `"Moonshot (Kimi)"`，`envKey: "MOONSHOT_API_KEY"`，`modelsUrl: platform.kimi.com/docs/pricing` |
| `model-catalog.ts:462-479` | 两个 Qwen 网关组：`qwen-pay-as-you-go`（`gatewayBaseUrl: QWEN_PAYG_BASE_URL`）与 `qwen-token-plan`（`QWEN_TOKEN_PLAN_BASE_URL`） |
| `model-catalog.ts:283` | `QWEN_PAYG_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"`（:281 Token Plan 端点；:590 `QWEN_OFF_PEAK` 峰谷价） |
| `model-catalog.ts:2737-2761` | 直连 Moonshot 行 `kimi-k3`/`kimi-k2.6`/`kimi-k2.5`——**不写 `clientType`**，靠 id 自动路由；价格 `cny(...)` |
| `model-catalog.ts:2302-2400` | `qwen-pay-as-you-go` 行 `kimi/kimi-k3`、`kimi/kimi-k2.8-preview`、`qwen3.8-flash`、`qwen3.8-max`…每行**显式钉 `clientType: "openai-chat"` + `baseUrl`** |
| `packages/core/test/model-catalog.test.ts:1229/1295/1498/1985` | 断言 moonshot 行集合、Kimi/Qwen 的 CNY→USD（×7 复原）、`resolveModelEnv("kimi-k3") → MOONSHOT_API_KEY`、Qwen 峰谷 |
| `packages/web/test/vendor-group-models.test.ts:190-201` | `isVendorGroup("deepseek")===true`、`isAddableGroup("custom")===true`；厂商组不提供「添加模型」入口 |
| 其它 | `packages/ui/src/components/icons/logos/provider-logo.tsx`、`packages/web/src/features/models/*` |

**为什么必须钉 `client_type`**：`AutoLLMClient` 对 `client_type || model_id` 做子串匹配（见 `node_modules/.pnpm/@prismshadow+agenthub@0.4.15…/dist/autoClient.js` 的 `_clientClassForModel`），且从不看 `base_url`；网关行不钉协议就会被自己的拼写路由到错误的一手客户端。

### 2.4 `@prismshadow/agenthub` 的角色
- 依赖：`packages/core/package.json:74`、`packages/cli/package.json:41` 均为 `"@prismshadow/agenthub": "^0.4.15"`。它是**供应商协议适配层**：`AutoLLMClient` 按 `clientType` 选具体客户端并做 `UniMessage`/`UniEvent`/`UniConfig` 转换；core 只做 `OmniMessage ⇄ Uni*` 一层翻译。
- 已知协议族（读 `dist/` 目录即可）：`openai_chat`、`openai_responses`、`openai_chat_vllm_adapter`、`ant_messages`、`claude5`、`gpt6`、`gemini3_8`、`glm5_3`、`kimi_k3`、`minimax_m3`、`deepseek_v4`、`openai_embedding`。
- Kimi 走独立客户端：`autoClient.js` 中 `clientType` 含 `kimi-k3`/`kimi-k2.5`/`kimi-k2.6` → `KimiK3Client`；**Qwen 无独立客户端，走 `openai-chat`**（子串 `openai` 命中）。
- 关键方法（`dist/autoClient.d.ts`）：`constructor({ model, apiKey?, baseUrl?, clientType?, defaultHeaders? })`、`streamingResponseStateful({ message, config, signal? })`、`getHistory()/setHistory()`、`listModels(): Promise<string[]>`。另有 `listSupportedModels(currency?)` 注册表（`dist/registry.d.ts`：`base_url`/`client`/`input_modalities`/`context_window`/`pricing`），但 Penguin 的目录是**手抄进 `MODEL_CATALOG`**，不是运行时拉取。官方定性见 `packages/docs/content/architecture.zh.md:84,178`、`models.zh.md:597`。

## 3. 用量与成本

### 3.1 数据结构
```ts
// packages/core/src/omnimessage/types.ts:90
export interface TokenCounts { cache_read: number; cache_write: number; output: number; total: number }
// :352
export interface TokenUsagePayload { session: TokenCounts; request: TokenCounts }  // type: "token_usage"
```
四桶映射（`generative-model.ts:254`）：`cached_tokens → cache_read`、`prompt_tokens → cache_write`、`thoughts_tokens + response_tokens → output`。落表（`packages/server/src/db/schema.ts:98`）：
```sql
CREATE TABLE IF NOT EXISTS usage_records (
  id, ts, date, project_id, agent_id, session_id, origin_session_id, provider, model_id,
  cache_read, cache_write, output, total, status TEXT NOT NULL DEFAULT 'completed'
);  -- status: completed=成功，其余=失败(0 token)供成功率；成本不存，查询时按当次价格现算
```
写入器 `packages/server/src/runtime/usage-recorder.ts`：
```ts
export const ORIGIN_MODELS_MAX = 1000;
export class UsageRecorder implements UsageRecording { async record(ctx: UsageContext, msg: OmniMessage): Promise<void> }
```
规则：子会话 `session_meta` 建 `origin session_id → (provider, model_id)` 映射（子代理可能换模型），`token_usage` 按该映射归属行；`request_end` 且非 completed 也写一行 0 token。

### 3.2 成本怎么算 / 怎么聚合
```ts
// packages/server/src/services/usage-service.ts:67
export interface PricingRates { cacheRead: number; cacheWrite: number; output: number }
export interface TieredRates { peak: PricingRates; offPeak: PricingRates }   // :81 峰谷按记录自身 ts 定价
export function requestCostUsd(counts: {cacheRead;cacheWrite;output}, rates: PricingRates): number {   // :156
  return (counts.cacheRead*rates.cacheRead + counts.cacheWrite*rates.cacheWrite + counts.output*rates.output) / 1e6;
}
export function ratesAt(tiered: TieredRates, provider: string, modelId: string, at: Date): PricingRates    // :178
```
响应形状（`packages/server/src/api/types.ts:3302 / 3472`）：
```ts
export interface UsageGroupRow { key: string; provider?: string; cacheRead; cacheWrite; output; total; requests; cost: number | null; hasUncosted: boolean }
export interface UsageResponse {
  summary: { today: UsageBucket; last7d: UsageBucket; total: UsageBucket };
  groupBy: UsageGroupBy; groups: UsageGroupRow[]; granularity: UsageGranularity;
  series: UsageSeriesPoint[]; byAgentSeries: UsageAgentSeries[]; byModelSeries: UsageModelSeries[];
  errors: UsageErrors; agentIds: string[]; models: ModelRefDto[];
}
```
| 面 | 路径 |
| --- | --- |
| HTTP | `GET /api/projects/:p/usage`、`/usage/model-totals`、`/usage/errors`（`packages/server/src/http/routes/usage.ts:94,138,149`） |
| CLI | `penguin cost [--days n] [--by date\|agent\|model\|session] [--json]`（`packages/cli/src/commands/cost.ts`） |
| Web | 成本中心页；`packages/web/test/benchmark-metrics.test.ts`（评测曲线，标签键 = agentId · modelId · thinkingLevel） |
| 测试 | `packages/server/test/usage.test.ts`（835 行）：一条 `token_usage` 一行、子会话归属、峰谷按 `ts` 定价、`ORIGIN_MODELS_MAX` 淘汰回落 |

关键性质：只有 token 落库，成本**随价格变化即时重算**；同一 `model_id` 跨不同 `provider` 分开统计。

## 4. 一次对话的 Trace

### 4.1 存什么、什么粒度
`packages/core/src/trace/writer.ts`：
```ts
export interface WriterOptions { tracesDir: string; sessionId: string; date?: Date; dateDir?: string; startIndex?: number }
export class Writer {
  currentPath(): string                     // <tracesDir>/<yyyy-mm-dd>/<sessionId>_<index3>.jsonl
  async write(msg: OmniMessage): Promise<void>
  async writeAll(msgs: OmniMessage[]): Promise<void>
  async aggregateAndWrite(msgs: OmniMessage[]): Promise<void>
  async rotate(): Promise<void>             // 压缩/换模型 → 新文件
}
export async function readTrace(path: string): Promise<OmniMessage[]>
```
- **粒度 = 一条 OmniMessage 一行 JSON**；只写「可记录」消息：`session_meta`、完整 `model_msg`、全部 `event_msg`；`partial_*` 跳过，`origin` 非空的子会话消息不写（`writer.ts:63` `isRecordable`）。
- **append-only**：`open(O_APPEND)` + 一次 `write(2)` + close；不用 `fs.appendFile`（>512KiB 会被 Node 分块，崩了就撕行）；写前探尾，非 `\n` 结尾则先补 `\n`。**一个文件 = 一段完整模型上下文**，压缩或换模型时 `rotate()` 开新编号文件。
- 事件含 `request_begin`/`request_end`/`token_usage`/`compaction_begin`/`compaction_end`/`abort`/`approval_decision`/`tool_list_ready`/`subagent` 指针等。

### 4.2 与消息/事件流的关系、怎么读出来
`packages/core/src/trace/resume.ts` 是重放核心：
```ts
export interface ResumeResult {
  history: CompleteModelMessage[];   // 已提交轮次，一次性 setHistory
  carryOver: OmniMessage[];          // 未提交输入，恢复后第一次 run 重发
  contextClosed: boolean; pendingSummary?: OmniMessage; openingSummary?: OmniMessage;
  sessionTokens: TokenCounts; lastRequestTotal: number; sessionTurns: number;
  renderMessages: OmniMessage[]; meta: SessionMetaMessage | null;
  danglingCompaction?: { reason: CompactionReason; mode: CompactionMode };
}
export function resumeTrace(messages: OmniMessage[]): ResumeResult                      // :296
export function parseTraceLines(content: string, options?: ParseTraceLinesOptions): OmniMessage[]  // :129 容忍截断尾行
export async function readTraceTolerant(path: string): Promise<OmniMessage[]>          // :167 跳过中间损坏行
export async function findLatestTraceFile(tracesDir: string, sessionId: string): Promise<LocatedTraceFile | null>
export async function latestSessionId(tracesDir: string): Promise<string | null>
```
归属按**位置**而非内容：`request_begin`→`request_end` 之间的 assistant 消息是该请求输出；用户侧消息算下一个请求输入。读取入口是 `packages/server/src/http/routes/agent-traces.ts`，前缀 `/api/projects/:projectId/agents/:agentId/traces`（`packages/server/src/services/agent-routes.ts:47`）：

| 方法 | 路径 | 内容 |
| --- | --- | --- |
| GET | `/` | 会话索引（分类、分页） |
| GET | `/:sessionId/:index` | 单个 Trace 文件事件（`offset`/`limit`） |
| GET | `/:sessionId/:index/analysis` | 请求配对、工具耗时、重连/压缩次数、Token 趋势 |
| GET | `/:sessionId/:index/download` | 原始 `.jsonl` 附件 |
| POST | `/import` | 上传 Trace（owner） |

CLI **没有**直接读 Trace 文件的命令：`penguin ls` 走 `GET /agents` + 会话列表，聊天历史走 `GET /messages`（`packages/cli/src/server-session.ts:142`）；`resumeTrace` 只在 Agent 恢复会话时由 core 调用。

## 5. 对照 Adelie 的差距

| 维度 | Adelie 现状（真实文件） | Penguin 做法 | 要动的文件 |
| --- | --- | --- | --- |
| 模型引用 | 裸字符串 `AppSettings.model`；`AgentProviderConfig.modelName: string` | `{ provider, model_id }` 配对，全链路不拼接 | `packages/core/src/types/AgentProvider.ts`、`packages/server/src/settings.ts`、`routes/config.ts`、`packages/web/src/api/types.ts` |
| provider 枚举 | `ProviderName = 'deepseek' \| 'openai'`（`core/src/types/Args.ts:12`）；`ProviderType` 同构（`providers/src/Provider.ts:12`） | provider = 分组 id + 行级 `client_type` | 同上 + `packages/providers/src/Provider.ts` |
| 模型目录 | **不存在** | `MODEL_PROVIDERS` + `MODEL_CATALOG` + `isVendorGroup`/`unroutableVendorModel` | 新增 `packages/core/src/config/model-catalog.ts` 并从 `core/src/index.ts` 导出 |
| 协议适配 | 单一 chat-completions 实现塞在 `deepseek.provider.ts`（668 行），每家复制/子类；`anthropic.provider.ts`、`gemini.provider.ts` **是 0 字节空文件**却被 `index.ts` 的 `export *` 引用 | 协议适配交给 AgentHub，core 只做 OmniMessage 翻译 | `packages/providers/src/*`（改为 `client_type` 驱动）、`index.ts` |
| 密钥表 | `PROVIDER_API_KEY_ENV` 只有 deepseek/openai；`KEYS_FROM_USER_ENV = ['DEEPSEEK_API_KEY']`（`core/src/config/user-env.ts:22`） | 每组 `envKey` + 逐 entry 的 env 回落规则 | `providers/src/Provider.ts`、`core/src/config/user-env.ts`、`server/src/settings.ts` |
| 会话绑定 | 每轮现取 `settings.model`（`server/src/turn.ts:175`、`cli/src/cli.ts:888`）；会话头不记模型 | 创建时定死进 `session_meta`，换模型走 `switchModel` | `server/src/turn.ts`、`core/src/persistence/*`、`server/src/routes/sessions.ts` |
| 中途换模型 | `/model <名称>` 只改 `host.state.model`，下一轮生效，无压缩/无交接；提供方进程级不可变（`cli/src/utils/slash-commands.ts:160`） | 压缩后开新上下文（同会话）或 `[model_switch_from]` 交接（新会话） | `cli/src/utils/slash-commands.ts`、`server/src/routes/chat.ts` |
| 用量/成本 | 单轮 `DecisionPayload.usage`；累计 `TokenUsageRecord`（含 `cacheComplete`/`complete` 缺失标记），**只有 token、没有价格**；Web 按轮显示 token（`web/src/components/TurnView.tsx:49`） | 只存 token 的 `usage_records` 表 + 现算 cost + 峰谷 + 项目级 summary/groups/series + `penguin cost` | `core/src/types/ReAct.ts`、`runtime/src/agent.runtime.ts:458`、`server/src` 用量聚合、`web/src/components/*` |
| 事件/Trace | 事件溯源 JSONL（`core/src/persistence/events.ts`，`SESSION_EVENT_SCHEMA_VERSION = 1`），`GET /api/sessions/:id` 读回、`markdown` 导出 | append-only Trace + `resumeTrace` + `/traces` 分析/下载/导入 | 已有基础；补 Trace 索引 + 分析 + segment 定位 |

### 可执行清单
1. **引入配对引用**：新增 `core/src/types/ModelRef.ts` → `interface ModelRef { provider: string; model_id: string }` + `sameModelRef`/`formatModelRef`；`AgentProviderConfig` 改为 `ModelRef & { clientType?, baseUrl?, apiKey?, maxTokens?, temperature?, timeout?, stream? }`。
2. **建目录**：新增 `core/src/config/model-catalog.ts`，先只放三组——`deepseek`（`deepseek-chat`/`deepseek-flash`，直连不钉协议）、`moonshot`（`kimi-k2.6`/`kimi-k3`，`MOONSHOT_API_KEY`，`https://api.moonshot.cn/v1`，`clientType: 'openai-chat'`）、`qwen-pay-as-you-go`（`qwen3.8-flash`/`qwen3.8-max`/`kimi/kimi-k3`，`https://dashscope.aliyuncs.com/compatible-mode/v1`，`clientType: 'openai-chat'`）；带 `isVendorGroup`/`unroutableVendorModel`/`resolveModelCredential` 三个谓词。
3. **拆 provider 工厂**：`createProvider(type, config)` → `createClient(entry)`，按 `client_type` 分支（当前只需 `openai-chat` 与 `deepseek` 两条）；把 `deepseek.provider.ts` 的 chat-completions 实现提为通用实现，Kimi/Qwen 复用（都是 OpenAI 兼容，只换 `baseUrl`/key）；删掉或补齐 0 字节的 `anthropic.provider.ts`/`gemini.provider.ts`（当前 `export *` 对空文件是无效声明）。
4. **密钥表对齐目录**：`ProviderType`/`PROVIDER_API_KEY_ENV` 改为按分组 id 查目录的 `envKey`；`KEYS_FROM_USER_ENV` 补 `MOONSHOT_API_KEY`、`DASHSCOPE_API_KEY`。
5. **会话绑定 + 头部记录**：`AppSettings.model: string` → `ModelRef`（PATCH `/api/config` 接受成对或同时省略）；会话摘要/事件头写 `provider` + `model_id`，恢复时按头部解析。
6. **换模型语义**：把 `/model` 分成两条——同会话换模型（旧模型 summarize 后开新上下文段）或另开会话 + `[model_switch_from]` 首条块。
7. **用量定价**：`TokenUsageRecord` 增加 `provider`/`modelId` 归属字段；新增价格表与 `cost = (cacheRead*r1 + cacheWrite*r2 + output*r3)/1e6`；服务端加 `GET /api/usage`（summary + groupBy）——Adelie 已有全量事件读回，可先「读事件现算」而不落库。
8. **Web/CLI 展示**：`SettingsDialog` 的 provider `<select>` 改为按目录分组 + 模型下拉；`TurnView` 补单价与轮成本；CLI `/model` 提示改成 `<provider> <model_id>`。

**未验证说明**：按只读要求，本报告未运行 `/root/Adelie` 或 `/root/penguin-harness` 的任何构建/测试；Adelie 侧结论均来自源码静态阅读。
## 最后：Adelie 的最小改动

Adelie 落地「Agent 与模型分离 + 至少适配 Kimi/Qwen」的最小改动是**两次改字段 + 一张三行表**：把 `ProviderName` / `AgentProviderConfig.modelName` / `AppSettings.model` 这一串裸字符串换成 `ModelRef { provider, model_id }` 配对（provider 变成目录里的分组 id，因此 `'deepseek' | 'openai'` 联合类型与 `PROVIDER_API_KEY_ENV` 一并改为「查目录得到 `envKey`/`baseUrl`/`client_type`」），新增 `packages/core/src/config/model-catalog.ts` 只写三组（deepseek、moonshot + `MOONSHOT_API_KEY` + `https://api.moonshot.cn/v1`、qwen-pay-as-you-go + `https://dashscope.aliyuncs.com/compatible-mode/v1`，后两者都标 `client_type: 'openai-chat'`），再把 `createProvider` 从「按厂商名 new 一个类」改成「按 `client_type` 复用同一个 chat-completions 实现、只换 `baseUrl` 与 key」——Kimi 与 Qwen 因此**不需要新写任何 provider 类**。Agent 侧本就只持有 `AgentProvider` 接口，所以「Agent 与模型分离」自动成立，剩余工作只是把选中的 `(provider, model_id)` 写进会话头并在恢复时读回，以及在 `/api/config`、CLI `--model/--provider`、Web 设置弹窗三处把「模型名输入框」换成「分组 + 模型」两级选择。用量与 Trace 可以第二步再做：Adelie 已有逐轮 `usage` 与事件溯源，加一个「按 `(provider, model_id)` 现算成本」的纯函数即可，无需先落数据库。
