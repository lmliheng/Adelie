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

/** 第 2 节：运行配置。apiKey 只写不读，所以这里只有 hasApiKey */
export interface ConfigInfo {
  workspace: string
  provider: string
  model: string
  baseUrl: string | null
  hasApiKey: boolean
  approvalPolicy: string
  limits: { maxIterations: number; maxTokens: number | null }
  version: string
}

/** 第 2 节：PATCH /api/config 的请求体 */
export interface ConfigPatch {
  workspace?: string
  provider?: string
  model?: string
  baseUrl?: string | null
  apiKey?: string
  maxIterations?: number
  maxTokens?: number | null
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

/** `run_finished` 帧（第 4 节） */
export interface RunFinishedInfo {
  runId: string
  stopReason: unknown
  verification: unknown
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
