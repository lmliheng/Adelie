// 一轮对话的执行（契约 §4、§5）。
//
// 这里只做「接线」：把引擎（AgentRuntime）的事件出口、增量出口、审批回调接到
// SSE 通道与会话存储上，并把运行时交出来的 AgentRunState 翻译成契约里的
// run_finished。运行逻辑本身一律不在这里实现 —— 参考实现是 packages/cli/src/cli.ts。
import { AgentRuntime } from 'adelie-runtime';

import { ApprovalHub } from './approvals.js';
import { apiKeyFor, approvalRuntime } from './settings.js';

import type {
  AgentProvider,
  AgentRunState,
  ApprovalDecision,
  PendingAction,
  PriorRun,
  SessionEventInput,
  StoppedPayload,
  TaskStartedPayload,
  Tool,
} from 'adelie-core';
import type { SessionStore } from 'adelie-core';
import type { ProviderName } from 'adelie-core';
import type { SseChannel } from './sse.js';
import type { ServerSettings } from './settings.js';

/** 建 provider 所需的全部可变输入。测试注入的假 provider 也照这个形状收 */
export interface ProviderRequest {
  provider: ProviderName;
  model: string;
  baseUrl: string | null;
  apiKey: string | undefined;
}

export type ProviderFactory = (request: ProviderRequest) => AgentProvider;

/**
 * 一条会话的运行槽位。
 *
 * 它同时承担三件事：HTTP 取消入口能到达这一轮、关闭流程能等到这一轮落盘、
 * 以及第二条消息能立刻看到「忙」（契约 §4 的 409 busy）。
 */
export class RunSlot {
  readonly sessionId: string;
  /**
   * 这一轮的待审批表。
   *
   * 放在槽位而不是 executeTurn 的局部变量里：`POST /approvals` 是从 HTTP 路由
   * 进来的，它只拿得到槽位 —— 表在局部作用域里的话，决定就没有入口可送。
   */
  readonly approvals = new ApprovalHub();
  private readonly abort = new AbortController();
  private readonly donePromise: Promise<void>;
  private resolveDone: (() => void) | null = null;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.donePromise = new Promise<void>((resolve) => {
      this.resolveDone = resolve;
    });
  }

  get signal(): AbortSignal {
    return this.abort.signal;
  }

  get done(): Promise<void> {
    return this.donePromise;
  }

  get cancelled(): boolean {
    return this.abort.signal.aborted;
  }

  cancel(): void {
    this.abort.abort();
  }

  finish(): void {
    const resolve = this.resolveDone;
    this.resolveDone = null;
    resolve?.();
  }
}

/** 正在跑的会话。同一条会话同时只允许一个槽位（契约 §4） */
export class RunRegistry {
  private readonly slots = new Map<string, RunSlot>();

  get(sessionId: string): RunSlot | undefined {
    return this.slots.get(sessionId);
  }

  isBusy(sessionId: string): boolean {
    return this.slots.has(sessionId);
  }

  /** 占位。已有槽位时返回 null（调用方据此回 409 busy） */
  start(sessionId: string): RunSlot | null {
    if (this.slots.has(sessionId)) return null;
    const slot = new RunSlot(sessionId);
    this.slots.set(sessionId, slot);
    return slot;
  }

  finish(sessionId: string): void {
    const slot = this.slots.get(sessionId);
    if (slot === undefined) return;
    this.slots.delete(sessionId);
    slot.finish();
  }

  /** 关闭流程用：等在跑的每一轮落盘 */
  async settleAll(): Promise<void> {
    await Promise.all([...this.slots.values()].map((slot) => slot.done));
  }
}

export interface TurnInput {
  sessionId: string;
  task: string;
  workspace: string;
  settings: ServerSettings;
  /**
   * 去哪个密钥文件里取密钥：`host` 或用户 id（见 settings.ts 的 secretFileFor）。
   *
   * 它必须跟着请求走，不能从 settings 里推 —— 同一份配置（同一个模型）在不同用户
   * 手里对应不同的密钥，账单也就落给不同的人。
   */
  secretsKey: string;
  store: SessionStore;
  priorRuns: readonly PriorRun[];
  tools: readonly Tool[];
  eagerTools: readonly string[];
  createProvider: ProviderFactory;
  channel: SseChannel;
  slot: RunSlot;
}

export async function executeTurn(input: TurnInput): Promise<void> {
  const { channel, slot } = input;
  const approvals = slot.approvals;

  let runtime: AgentRuntime | null = null;
  let cancelled = false;
  let runId = '';

  /**
   * `run_started` 之前发生的帧，先排队。
   *
   * 契约要求 `run_started` 是流里的第一帧，而运行时是**同步**跑进循环的：
   * `run()` 的第一句就交出 `task_started`（runId 的来源），紧接着第一轮决策
   * 就可能流出正文 —— 那时 `run_started` 还没推出去（它要等 `run()` 把控制权
   * 交回调用方）。不排队的话，客户端收到的第一个帧是 `delta`，与契约不符。
   */
  let runStarted = false;
  const queuedFrames: Array<() => void> = [];
  const pushOrQueue = (push: () => void): void => {
    if (runStarted) push();
    else queuedFrames.push(push);
  };

  /**
   * 取消这一轮。
   *
   * 运行时没有取消入口：`AgentRuntimeConfig` 里没有 signal，`run()` 也不接受中断，
   * 主循环中途没有任何外部探针。唯一能在**循环边界**让它停下来的位置是它自己的
   * `state.stopReason` —— `shouldStop()` 的第一步读的就是这个字段，写进去之后本轮
   * 不再发起新的模型调用，退出时走运行时自己的收尾路径（`stopped` 事件 + 验收）。
   *
   * 停止原因记 `user_interrupted`：core 的 `StopReason` 联合类型里没有 `cancelled`，
   * 这是语义上对应的那一项（契约那句「stopReason 记为 cancelled」按此落地）。
   *
   * 边界：若此刻正卡在一次模型请求或工具执行上，要等它返回才会察觉 —— 没有取消
   * 入口的代价只到这一步，无法在不改运行时的前提下缩短。
   */
  const applyStop = (target: AgentRuntime | null): void => {
    if (target === null) return;
    const holder = target as unknown as { state?: AgentRunState };
    if (holder.state !== undefined) {
      holder.state.stopReason = { type: 'user_interrupted' };
    }
  };

  const cancel = (): void => {
    if (cancelled) return;
    cancelled = true;
    // 挂着的审批按拒绝收掉，否则它们的 Promise 会一直悬着
    approvals.settleAll('reject');
    applyStop(runtime);
  };

  slot.signal.addEventListener('abort', cancel, { once: true });

  try {
    let provider: AgentProvider;
    try {
      provider = input.createProvider({
        provider: input.settings.model.provider,
        model: input.settings.model.model,
        baseUrl: input.settings.baseUrl,
        apiKey: apiKeyFor(input.secretsKey, input.settings.model.provider),
      });
    } catch (error) {
      // 建 provider 就失败（协议名不对、依赖缺失）：还没开会话，直接报错收尾
      channel.push('error', { message: errorMessage(error) });
      return;
    }

    // 审批接线由「我的运行口径」决定（见 settings.ts 的 approvalRuntime）：
    // 问我的那档把 requestApproval 交给审批中心（审批以 approval_request 帧送到界面），
    // 只读 / 全放行两档没有交互层，直接把运行时的 approvalPolicy 交给它。
    const approval = approvalRuntime(input.settings.approvalPolicy);

    runtime = new AgentRuntime(provider, [...input.tools], {
      workspacePath: input.workspace,
      // 计划文件写在会话目录里（工作区之外）：它是过程不是交付物，不该出现在
      // 用户的 git status 里。目录就是事件流所在的那一个，本来就存在。
      scratchpadDir: input.store.dir,
      maxIterations: input.settings.maxIterations,
      ...(input.settings.maxTokens !== null ? { maxTokens: input.settings.maxTokens } : {}),
      eagerTools: input.eagerTools,
      priorRuns: input.priorRuns,

      onStreamDelta: (delta) => {
        // 取消之后不再把增量转给客户端：那一轮已经不算数了
        if (cancelled) return;
        if (delta.content !== undefined) {
          pushOrQueue(() => channel.push('delta', { kind: 'content', text: delta.content! }));
        }
        if (delta.reasoningContent !== undefined) {
          pushOrQueue(() => channel.push('delta', { kind: 'reasoning', text: delta.reasoningContent! }));
        }
      },

      onSessionEvent: (event: SessionEventInput) => {
        // 事件流是事实源：先落盘再转发（落盘抛错交给运行时记降级，本帧随之不转发）。
        // task_started 不在契约的 event 表里 —— 它由 run_started 表达，这里只取
        // taskId 作为这一轮的 runId。
        if (event.type === 'task_started') {
          runId = (event.payload as TaskStartedPayload).taskId;
        }

        const outgoing = normalizeStopReason(event, cancelled);
        const stored = input.store.append(outgoing);
        if (outgoing.type === 'task_started') return;

        pushOrQueue(() => channel.push('event', {
          type: stored.type,
          payload: stored.payload,
          timestamp: stored.ts,
        }));
      },

      ...(approval === 'ask'
        ? {
            requestApproval: async (action: PendingAction): Promise<ApprovalDecision> => {
              pushOrQueue(() => channel.push('approval_request', { actionId: action.id, action }));
              return approvals.request(action);
            },
          }
        : approval),
    });

    // 信号可能在运行时建出来之前就断了（客户端连上立刻断开）：补一次
    if (cancelled) applyStop(runtime);

    // run() 的同步段已经交出 task_started（runId 已就位），所以这一句之后
    // 才会有别的帧 —— run_started 必然是流里的第一帧。
    // 模型作为这一轮的标签交进去：引擎不解释它，只记进 run 头，供用量与成本归属。
    const running = runtime.run(input.task, { model: input.settings.model });
    channel.push('run_started', { runId, task: input.task });
    // 排着的帧可以出去了：顺序是 run_started 在前，其余按发生顺序跟在后面
    runStarted = true;
    for (const push of queuedFrames.splice(0)) push();

    const result = await running;
    const state = result.state;

    channel.push('run_finished', {
      runId: runId === '' ? state.taskId : runId,
      // 取消是一票否决：运行时可能正处在一轮决策的收尾上，把原因写成了别的
      // （例如同一瞬间产出的 Final 会把 stopReason 写成 task_completed）。
      stopReason: cancelled ? { type: 'user_interrupted' } : (state.stopReason ?? null),
      usage: {
        promptTokens: state.tokenUsage.promptTokens,
        completionTokens: state.tokenUsage.completionTokens,
        totalTokens: state.tokenUsage.totalTokens,
      },
      fileChanges: state.fileChanges,
      iterations: state.iterationCount,
    });
  } catch (error) {
    // run() 自己吞掉运行期异常（转成 stopReason: error），走到这里的是更外层的
    // 意外（例如建 runtime 时抛）。契约里 error 帧之后连接即关闭。
    channel.push('error', { message: errorMessage(error) });
  } finally {
    approvals.settleAll('reject');
    slot.signal.removeEventListener('abort', cancel);
    if (!channel.isClosed) {
      channel.push('done', {});
      channel.close();
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 取消之后把结束事件的停止原因钉成 `user_interrupted`。
 *
 * 运行时的收尾是同步写 `stopped` 的，若取消恰好落在它决定「本轮结束」的同一瞬间，
 * 它写下的会是 task_completed。取消是一票否决，所以这里做最后一次校正 —— 落在
 * 事件流里的原因必须和客户端在 `run_finished` 里看到的那一个一致，否则 trace 与
 * 界面会各说各话。
 */
function normalizeStopReason(event: SessionEventInput, cancelled: boolean): SessionEventInput {
  if (!cancelled || event.type !== 'stopped') return event;

  return {
    type: 'stopped',
    payload: {
      ...(event.payload as StoppedPayload),
      stopReason: { type: 'user_interrupted' },
    },
  };
}
