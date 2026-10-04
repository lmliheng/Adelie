// src/api/types.ts
//
// 后端契约的 TypeScript 副本（docs/api.md v1）。
//
// 这里刻意**不**引入 core 的类型包：web 是独立产物，它只认 HTTP 形状，
// 从内存里放进去的类型一旦和 wire 上的实际字段分叉，就变成了「编译通过、线上崩」。
// 所以 wire 上的 payload 一律按 unknown 对待，收窄放在 timeline/lib 里做。

/** docs/api.md 第 3 节：会话摘要 */
export interface SessionSummary {
  id: string
  workspace: string
  createdAt: number
  lastActiveAt: number
  taskCount: number
  title: string
}

/** 第 1 节：健康检查 */
export interface HealthInfo {
  ok: boolean
  name: string
  version: string
  uptimeMs: number
}

/** 「用哪个模型」：提供方与模型名是一条引用，不拆成两个平铺字段（契约 §2） */
export interface ModelRefInfo {
  provider: string
  model: string
}

/** 第 2 节：运行配置。apiKey 只写不读，所以这里只有 hasApiKey */
export interface ConfigInfo {
  workspace: string
  model: ModelRefInfo
  baseUrl: string | null
  hasApiKey: boolean
  approvalPolicy: string
  limits: { maxIterations: number; maxTokens: number | null }
  version: string
  /** 这次请求是以谁的名义发出的。界面靠它决定哪些字段可编辑、要不要显示「用户」 */
  identity: IdentityInfo
}

/** 身份（契约 §0）。`host` = 本机上没登录的那位（他就是管理员） */
export interface IdentityInfo {
  kind: string
  name: string
  isAdmin: boolean
}

/** 第 1 节：GET /api/auth/me。匿名时只有 authenticated: false */
export interface AuthMe {
  authenticated: boolean
  user?: {
    kind: string
    name: string
    isAdmin: boolean
    id: string | null
    hasPassword: boolean
  }
}

/** 第 1 节：用户管理里的一个账号 */
export interface UserInfo {
  id: string
  name: string
  isAdmin: boolean
  hasPassword: boolean
  createdAt: number
  isSelf: boolean
  sessionCount: number
}

/**
 * 第 2 节：PATCH /api/config 的请求体。
 *
 * `model` 是一条引用：provider 必给；只给 provider 表示「用这一家的默认模型」
 * （服务端按模型目录决定是哪个）。
 */
export interface ConfigPatch {
  workspace?: string
  model?: { provider: string; model?: string }
  baseUrl?: string | null
  apiKey?: string
  maxIterations?: number
  maxTokens?: number | null
  /**
   * 审批口径（契约 §2）：`always-ask` / `read-only` / `allow-all`，三档见
   * `lib/composer-options.ts`。值不合法服务端回 400 `bad_request`。
   * 它决定的是「我发起的这一轮要不要停下来问我」，所以不是管理员专属。
   */
  approvalPolicy?: string
}

/**
 * 牌价：美元 / 百万 token（契约 §2）。`cacheRead` 省略表示这家没公布缓存价，
 * 那时命中的输入按 `input` 算（会高估，core 的 `usage/rates.ts` 里认下了这件事）。
 */
export interface ModelRates {
  input: number
  cacheRead?: number
  output: number
}

/** 第 2 节：GET /api/models —— 能选哪些模型。内容来自服务端的模型目录 */
export interface CatalogModel {
  id: string
  label: string
  default?: boolean
  /**
   * 牌价。**缺席 = 没定价**（人民币报价的厂商、目录外手填的模型名），界面照实说
   * 「未定价」而不是编一个数字 —— 编价格比留空更坏，这一点与 core 一致。
   */
  rates?: ModelRates
}

export interface CatalogGroup {
  id: string
  label: string
  /** 密钥所在的环境变量**名**（不是密钥本身），用来告诉用户该配哪一个 */
  envKey: string
  hasApiKey: boolean
  models: CatalogModel[]
}

export interface ModelCatalog {
  default: string
  groups: CatalogGroup[]
}

/** 第 2 节：GET /api/tools */
export interface ToolInfo {
  name: string
  description: string
  requiresApproval: boolean
}

/**
 * 事件流里的一条事件。
 *
 * 两种来源：`GET /api/sessions/:id` 的 `events`（带 v/seq/ts），
 * 以及 SSE 的 `event:` 帧（带 timestamp）。两者都收窄成这一个形状，
 * 让「历史回放」和「实时流」走同一个映射函数（见 lib/timeline.ts）。
 */
export interface SessionEventLike {
  type: string
  payload: unknown
  /** ms 时间戳；缺省用 0，渲染时按「未知时间」处理 */
  ts: number
}

/** SSE `approval_request` 帧里的待审批动作（core 的 PendingAction 形状） */
export interface PendingActionLike {
  id: string
  runId: string
  createdAt: number
  source: {
    thought: string
    decision: { type: 'Action'; tool: string; params: Record<string, unknown> }
  }
  preview: {
    tool: string
    summary: string
    affectedFiles: Array<{ path: string; changeType: string; diffPreview?: string }>
    riskLevel: 'low' | 'medium' | 'high'
  }
  status: string
  expiresAt: number
}

/** `run_finished` 帧里的用量 */
export interface TokenUsageLike {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cacheHitTokens?: number | null
  cacheMissTokens?: number | null
}

/**
 * `run_started` 帧（契约 §4）。
 *
 * 实时流里没有 `task_started`（它由这一帧表达），而这一帧带着**这一轮真正用的模型**：
 * 会话中途换过模型时，按当前配置去查价目表会算错钱，所以模型必须跟着帧走。
 */
export interface RunStartedInfo {
  runId: string
  task?: string
  model?: ModelRefInfo
}

/** `run_finished` 帧（第 4 节） */
export interface RunFinishedInfo {
  runId: string
  stopReason: unknown
  usage: TokenUsageLike | null
  fileChanges: Array<{ tool: string; path: string; at?: number }>
  iterations: number | null
}

/** 会话详情（第 3 节）。runs 我们不用来渲染（事件流才是事实源），只保留形状 */
export interface SessionDetail {
  session: SessionSummary
  runs: unknown[]
  events: SessionEventLike[]
}

/**
 * 一个桶里的用量合计（契约 §2 的 `Totals`）。
 *
 * `costUsd` 只累计**有价**的那些轮，`unpricedRuns` 数的是没价的 —— 两者必须一起看：
 * 光标着 0 会读成「没花钱」，实际可能是「没定价」。
 */
export interface UsageTotals {
  runs: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  costUsd: number
  unpricedRuns: number
}

export type UsageModelTotals = UsageTotals & { provider: string; model: string }

export type UsageSessionTotals = UsageTotals & { sessionId: string; lastActiveAt: number }

/** 按**本地日期**分桶（`YYYY-MM-DD`），从早到晚 */
export type UsageDayTotals = UsageTotals & { date: string }

/**
 * `GET /api/usage`（契约 §2）。
 *
 * 它是服务端当场扫事件流算出来的**派生视图**，不是一张表：只落 token、成本永远现算，
 * 所以这里的钱是「按今天的牌价算出来的一个视图」。界面不再自己聚合第二遍 ——
 * 两份聚合迟早对不上，而那时候没人知道该信谁。
 */
export interface UsageReport {
  summary: { today: UsageTotals; last7d: UsageTotals; total: UsageTotals }
  byModel: UsageModelTotals[]
  bySession: UsageSessionTotals[]
  series: UsageDayTotals[]
  /** 真的读了事件的会话数（空会话不算） */
  sessionsScanned: number
  /** 读不动的那几条（删了一半、权限不足）—— 少算了几条要说得出来 */
  unreadableSessions: number
  /** 服务端的「现在」：今天 / 最近 7 天的分界由它定，界面不该有自己的表 */
  now: number
}
