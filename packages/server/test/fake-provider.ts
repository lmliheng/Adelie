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

    // 规划轮不产正文（与真实 provider 一致：那一轮的产品是计划），其余轮次
    // 先流出一点正文 —— 契约里的 delta 帧就来自这条路径。
    if (onDelta !== undefined && decision.type !== 'Replan') {
      onDelta({ content: `（第 ${this.index} 轮）` });
    }

    return { decision, rawContent: '' };
  }
}

/** 规划轮的固定响应：运行时要求模型经 request_replan 提交步骤列表 */
export function planDecision(): ModelDecision {
  return {
    type: 'Replan',
    reason: '初始规划',
    newPlan: [
      {
        id: 'step-1',
        description: '读一下说明文件',
        status: 'pending',
        dependsOn: [],
        completionCriteria: '文件内容已确认',
      },
    ],
  };
}
