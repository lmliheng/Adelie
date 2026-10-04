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
  ToolDefinition,
} from 'adelie-core';

export class ScriptedProvider implements AgentProvider {
  readonly name = 'scripted';
  config: AgentProviderConfig = { modelName: 'scripted', temperature: 0, maxTokens: 100 };

  private index = 0;

  constructor(private readonly script: ModelDecision[]) {}

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

    return { decision, rawContent: '' };
  }
}
