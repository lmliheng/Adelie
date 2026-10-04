import type { PendingAction, ApprovalDecision, ApprovalPolicy } from './Tool.js'
import type { ModelDecision, Observation } from './ReAct.js'
import type { StreamDelta } from './AgentProvider.js'
import type { ModelRef } from './ModelRef.js'
import type { OutputBudget } from '../output-budget.js'
import type { SessionEventInput } from '../persistence/events.js'

/**
 * `run()` 的附加信息。
 *
 * 现在是「这一轮用哪个模型」一件事。运行时**不解释**它 —— 不读 provider、不看
 * 模型名，只是原样记进 run 头（`task_started.model`）。引擎因此仍然不知道有哪些
 * 厂商，而用量与成本能在事后按模型切开归属。
 */
export interface RunOptions {
    model?: ModelRef;
}

/**
 * 上一段对话中的一次 run。
 *
 * 恢复会话时由调用方从会话事件流派生后交进来。这里只带**派生消息所需的事实**
 * （任务目标、决策、观察），不带 messages —— messages 是运行时从
 * 这些事实派生的视图，存进来就等于存了两份会各自漂移的历史。
 *
 * 也不带计划：计划是模型自己的一个文件（`PLAN.md`），它本来就留在磁盘上，
 * 恢复会话时模型自己会去读它。
 */
export interface PriorRun {
    taskDescription: string;
    decisions: ModelDecision[];
    observations: Observation[];
}

/**
 * @Runtime配置
 * agent runtime 是agent的运行环境，整体约束Agent的行为
 */
export interface AgentRuntimeConfig {
    maxIterations: number;        // 最大思考-行动循环次数
    maxToolCalls: number;         // 最大工具调用次数
    timeoutMs: number;            // 超时时间（毫秒）
    maxFileChanges: number;       // 最大文件修改数量
    /**
     * 累计 token 用量上限（成本闸门）。省略或 0 表示不限制。
     * 达到上限即停止，停止原因为 `max_tokens`。
     */
    maxTokens?: number;
    workspacePath: string;        // 代码工作区路径
    maxConcurrency?: number;      // 最大并行数，默认 3

    /**
     * 人工审批回调。
     *
     * 提供时，需要审批的工具 MUST 由它拿到决定（见 human-approval spec）——
     * 运行时不得在这一路径上替代人工判断。未提供时按 approvalPolicy 处理。
     */
    requestApproval?: (action: PendingAction) => Promise<ApprovalDecision>;

    /**
     * 没有交互层时使用的审批策略，**默认 'auto-reject'**。
     *
     * 默认拒绝而不是放行：requiring approval 的工具本来就要求人工拍板，无人可问时
     * 放行等于「无人确认下执行破坏性命令」。要恢复旧的放行行为，必须显式写
     * approvalPolicy: 'auto-approve'（脚本 / 测试场景），这样它就是一次有意的声明。
     */
    approvalPolicy?: ApprovalPolicy;

    /**
     * 等待人工审批的时限（毫秒），默认 300000（5 分钟）。
     *
     * 到点按拒绝处理并继续运行 —— 之前这个时限只写进 PendingAction.expiresAt，
     * 没有任何地方读取，交互层卡住时整个 run 会永久挂起。
     */
    approvalTimeoutMs?: number;

    /**
     * 会话的草稿目录（工作区之外）。
     *
     * 计划文件写在这里：`<scratchpadDir>/PLAN.md`。**刻意放在工作区之外** ——
     * 计划是过程不是交付物，落进用户的仓库会污染 git status，也会被 search_code
     * 之类搜到（同 penguin 的 scratchpad）。提供时这个目录对本会话的模型可写。
     * 不提供时退回 `<workspacePath>/PLAN.md`（CLI 单次运行、测试这类没有会话目录的场景）。
     */
    scratchpadDir?: string;

    /**
     * 「成功但无进展」的判定阈值：同一工具产出相同结果达到这个次数就停止运行。
     * 默认 3；设为 0 关闭该守卫。
     */
    noProgressLimit?: number;

    /**
     * 单次工具输出的体量上限（字符与行数）。
     *
     * 提供时作为全局默认；工具自身声明的预算仍然优先于它。
     * 未提供时使用推导默认值，见 `AgentRuntime.getContextBudget()`。
     */
    outputBudget?: OutputBudget;

    /**
     * 上下文大小的 token 阈值。
     *
     * 本 change 只把判据暴露出来，不据此改变运行行为（见 design.md D7）。
     * 未提供时使用推导默认值，见 `AgentRuntime.getContextBudget()`。
     */
    contextTokenBudget?: number;

    /**
     * 常驻工具白名单：列在这里的工具 schema 随请求下发，其余工具转为延迟——
     * 仍然注册、仍然可执行，模型经 tool_search 取 schema、tool_call 调用。
     *
     * 省略表示不限制（全部常驻）。必须与 ToolRegistry 用同一份名单：运行时按它
     * 决定「声明哪些工具」，注册表按它决定「tool_search 能搜出哪些工具」。
     */
    eagerTools?: readonly string[];

    /**
     * 恢复会话时带进来的历史 run（按时间先后）。省略表示从空对话开始。
     *
     * 只影响上下文消息的构造，不影响运行状态：计划、预算计数、失败历史都从零
     * 开始（「接着聊」不等于「接着跑」）。
     */
    priorRuns?: readonly PriorRun[];

    /**
     * 会话事件出口。
     *
     * 运行时只负责在状态迁移的当口把事件交出去，落到哪由调用方决定（磁盘、
     * 内存、别处）。这样运行时不必知道存储的存在。
     *
     * 出口抛错不影响运行：事件写失败会让这一次运行**未被持久化**，但打断正在
     * 进行的任务代价更大。原因是二者都可以被发现 —— 见 `getPersistenceStatus()`。
     */
    onSessionEvent?: (event: SessionEventInput) => void;

    /**
     * 模型增量的出口。提供时，主循环每轮把正文/思考的增量原样转给调用方。
     *
     * 与 `onSessionEvent` 分开是有意的：增量**不是状态迁移**，它既不进事件流、
     * 也不进 `AgentRunState`，所以它没有"事实"的身份，绝不能靠事件流来承载 ——
     * 那会让一份可能半截的中间产物混进唯一事实源里。
     */
    onStreamDelta?: (delta: StreamDelta) => void;
}
