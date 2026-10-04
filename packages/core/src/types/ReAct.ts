import type { ToolResult } from './Tool.js'

/**
 * @三种决策
 *
 * 没有「重新规划」这一种：计划不是运行时状态，而是模型自己的工作文件
 * （`PLAN.md`，见 AgentRuntimeConfig.planFile）—— 换路线就是把那个文件改掉，
 * 不需要一条专门的控制流。
 */
export type ModelDecision = Action | Final | BatchAction

export interface Action {
    type: 'Action';
    tool: string;           // 工具名称
    params: Record<string, unknown>; // 工具参数
    thought?: string;       // 模型的思考过程
    /**
     * 模型返回的工具调用标识，用于把工具结果与调用配对。
     * 可选：MockProvider 等不经过 Provider 边界的来源可以不带。
     */
    toolCallId?: string;
    /**
     * 参数无法解析为合法对象时的失败说明（含原始调用内容与原因）。
     * 存在时运行时 MUST 拒绝执行该动作并记录失败观察。
     */
    paramsParseError?: string;
}


export interface Final {
    type: 'Final';
    answer: string;         // 最终的回答或总结
    thought?: string;
}

export interface BatchAction {
    type: 'BatchAction';
    actions: Array<{
        tool: string;
        params: Record<string, unknown>;
        thought?: string;
        /** 见 Action.toolCallId */
        toolCallId?: string;
    }>;
    thought?: string;
}

/**
 * @RuntimeState
 */
export interface AgentRunState {
    taskId: string;                 // 运行任务的唯一 ID
    taskDescription: string;        // 这一轮的任务目标（原来挂在 plan.originalGoal 上）
    decisions: ModelDecision[];     // 所有历史决策
    observations: Observation[];    // 所有历史观察
    toolCallCount: number;          // 工具调用总次数
    iterationCount: number;         // 思考-行动循环次数
    startTime: number;              // 开始时间戳
    fileChanges: FileChange[];      // 变更过的文件
    /**
     * 每次需要审批的操作及其决定。
     *
     * 这是审计的事实源：谁批准了什么、依据是什么（人 / 策略 / 超时）、什么时候。
     * 之前审批只留一行 console.warn，事后无法回答这些问题（见 run_test/PRD.md 第 3 节）。
     */
    approvals: ApprovalRecord[];
    tokenUsage: TokenUsageRecord;   // 累计 token 用量
    contextSize: ContextSizeMetric; // 当前上下文大小
    stopReason?: StopReason;        // 停止的原因
}


/**
 * 一次审批的记录。
 *
 * 只带审计需要的字段：动作、风险、结果、依据、时间。完整参数留在对应决策里。
 */
export interface ApprovalRecord {
    /** PendingAction.id，与审批请求一一对应 */
    id: string;
    tool: string;
    summary: string;
    riskLevel: 'low' | 'medium' | 'high';
    /** 受影响的文件路径（相对工作区根） */
    affectedFiles: string[];
    decision: 'approve' | 'reject';
    /** 决定的来源：交互层的人 / 显式策略 / 等待超时 / 回调抛错 */
    source: 'reviewer' | 'policy' | 'timeout' | 'error';
    /** 请求创建时间 */
    requestedAt: number;
    /** 决定时间 */
    decidedAt: number;
}


/**
 * 一次文件变更记录。
 *
 * 只保留可供人判断的最小信息：哪个工具动了哪个文件。具体参数留在对应决策里。
 */
export interface FileChange {
    tool: string;
    path: string;
    at: number;
}


/**
 * 累计 token 用量。
 *
 * 只承载「累计消耗」这一口径：它是各轮用量之和，用于成本统计。
 * 「当前上下文大小」是另一个语义不同的口径，不在本结构内（见 design.md D8）。
 */
export interface TokenUsageRecord {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    /**
     * 命中前缀缓存的输入 token 累计。
     *
     * `null` 表示至今没有任何一轮的响应提供过这个数 —— 与「累计为 0」不同：
     * 前者是拿不到，后者是确实一次都没命中。
     */
    cacheHitTokens: number | null;
    /** 未命中前缀缓存的输入 token 累计。`null` 的含义同上 */
    cacheMissTokens: number | null;
    /**
     * 每一轮的响应是否都提供了缓存命中量。
     * false 表示上面两个值偏低而非准确 —— 缺失的轮次不计入而不是补 0。
     */
    cacheComplete: boolean;
    /**
     * 每一轮模型响应是否都返回了用量。
     * false 表示累计值不完整 —— 缺失的轮次不计入而不是补 0。
     */
    complete: boolean;
}


/**
 * 度量的来源。
 *
 * 实测与估算的可信度不同，混同会让基于阈值的判断失去依据，
 * 因此每项度量都必须标明来源。
 */
export type MetricSource = 'measured' | 'estimated' | 'unknown';


/**
 * 当前上下文大小。
 *
 * 与累计消耗是两个语义不同的口径（见 design.md D6）：每轮都重发完整历史，
 * 因此「当前上下文大小」就是最近一轮请求的输入量，而累计消耗是各轮之和，
 * 二者相差数倍 —— 混成一个数字会让预算判断严重误触发。
 */
export interface ContextSizeMetric {
    /** 最近一轮请求的输入 token 数；尚未发起过模型请求时为 null */
    tokens: number | null;
    source: MetricSource;
}




/**
 * 观察「送进模型」的那一份的度量。
 *
 * `result.data` 存的是工具的原始产出，而真正发给模型的是经输出预算
 * （见 output-budget）截断后的那一份 —— 两者可能差几个数量级。只留原始产出
 * 的话，「token 花在哪」事后无法归因：看上去是一个 200 字符的结果，实际可能
 * 送了 20000 字符；反过来，明明很大的一份结果也可能因为工具声明了预算而只送了
 * 一小段。这里把两个数字都记下来。
 *
 * 注意它只覆盖「截断」，不覆盖「历史折叠」：折叠是每次请求现算的视图变换
 * （见 context-fold），同一份观察在不同轮次送出的内容并不相同，因此那种变化
 * 由 `context_folded` 事件记录，不写在这里。
 */
export interface ObservationDelivery {
    /** 工具产出的原始字符数（data + error 的序列化长度） */
    rawChars: number;
    /** 实际送进模型的内容字符数（截断后） */
    deliveredChars: number;
    /** 是否被输出预算截断 */
    truncated: boolean;
    /** 截断时全文的落盘位置，未截断为 null */
    fullOutputPath: string | null;
}

export interface Observation {
    action: Action;         // 导致此观察的原始 Action
    result: ToolResult;     // 工具执行结果
    timestamp: number;      // 记录时间戳
    /**
     * 送入模型的那一份的度量。老会话的观察没有这个字段（那时还没记），
     * 读取方按「未知」处理，不要当成 0。
     */
    delivery?: ObservationDelivery;
}


/**
 * @停止原因
 */
export type StopReason =
    | { type: 'max_iterations'; limit: number } // 最大迭代
    | { type: 'max_tool_calls'; limit: number } // 工具调用次数
    | { type: 'max_tokens'; limit: number } // 累计 token 用量上限（成本闸门）
    | { type: 'max_file_changes'; limit: number } // 文件变更数量
    | { type: 'timeout'; durationMs: number } // 响应超时
    | { type: 'no_progress'; tool: string; repeats: number } // 同一工具反复产出相同结果（微调参数但结果不变）
    | { type: 'task_completed' } // 任务完成
    | { type: 'user_interrupted' } // 用户打断
    | { type: 'error'; message: string }; // 执行错误
