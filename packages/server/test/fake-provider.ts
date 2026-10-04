// 假 provider：按脚本逐轮产出决策，不发起任何网络请求。
//
// 它同时是「集成测试不起真实模型」的那个注入点（见 createApp 的 deps.createProvider）。
import type {
  AgentProvider,
  AgentProviderConfig,
  ChatMessage,
  ModelDecision,
  ModelResponse,
  StreamDelta,
  TokenUsage,
  ToolDefinition,
} from 'adelie-core';

export class ScriptedProvider implements AgentProvider {
  readonly name = 'scripted';
  config: AgentProviderConfig = { modelName: 'scripted', temperature: 0, maxTokens: 100 };

  private index = 0;

  /**
   * `usage` 是**每一轮**决策都报的用量（真实 provider 每轮报一次，运行时按轮累加）。
   * 不传时等于「这家 provider 不报用量」—— 那正是 `TokenUsageRecord.complete = false` 的场景。
   */
  constructor(
    private readonly script: ModelDecision[],
    private readonly usage?: TokenUsage,
  ) {}

  updateConfig(): void {
    // 测试用，无需实现
  }

  async decide(
    _messages: ChatMessage[],
    _tools: ToolDefinition[] = [],
    onDelta?: (delta: StreamDelta) => void,
  ): Promise<ModelResponse> {
    const decision = this.script[this.index] ?? { type: 'Final' as const, answer: '结束' };
    this.index += 1;

    // 先流出一点正文 —— 契约里的 delta 帧就来自这条路径。
    if (onDelta !== undefined) {
      onDelta({ content: `（第 ${this.index} 轮）` });
    }

    return { decision, rawContent: '', ...(this.usage === undefined ? {} : { usage: this.usage }) };
  }
}
