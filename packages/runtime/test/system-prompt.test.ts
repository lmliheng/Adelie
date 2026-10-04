// 系统提示里的通用守则。
//
// 这些条目不是文案，是行为约束：每一条都对应一次真实事故或 penguin 已有的答案。
// 用测试钉住，免得以后重写提示词时被顺手删掉而没人发现。

import { describe, expect, it } from 'vitest';

import { AgentRuntime } from '../src/agent.runtime.js';
import { ReadFileTool } from 'adelie-tools';
import { createTestWorkspace, cleanupTestWorkspace } from './setup.js';
import type {
    AgentProvider,
    AgentProviderConfig,
    ChatMessage,
    ModelResponse,
} from 'adelie-core';

/** 只记下请求、立刻收尾的 provider：用例要的就是那一份 system 消息。 */
class CapturingProvider implements AgentProvider {
    readonly name = 'capturing';
    config: AgentProviderConfig = { modelName: 'capturing', temperature: 0, maxTokens: 100 };
    readonly requests: ChatMessage[][] = [];

    updateConfig(): void {
        // 测试用
    }

    async decide(messages: ChatMessage[]): Promise<ModelResponse> {
        this.requests.push([...messages]);
        return { decision: { type: 'Final', answer: '结束' }, rawContent: '' };
    }
}

/** 跑一次最小任务，把第一轮请求里的 system 消息取出来。 */
async function systemPromptOf(): Promise<string> {
    const dir = createTestWorkspace({ 'src/a.ts': 'export const a = 1;\n' });
    const provider = new CapturingProvider();
    try {
        await new AgentRuntime(provider, [new ReadFileTool()], {
            workspacePath: dir,
            maxIterations: 3,
        } as never).run('看看效果');
        return provider.requests[0]![0]!.content ?? '';
    } finally {
        cleanupTestWorkspace(dir);
    }
}

describe('系统提示里的通用守则', () => {
    it('命令要非交互地跑 —— 等输入 = 卡住，不是慢', async () => {
        const system = await systemPromptOf();

        // 这一条 2026-10-04 从 penguin 的 # Tool use 搬来：真实事故是命令等输入时
        // 不报错、只是挂着，直到整轮超时。
        expect(system).toContain('非交互');
        expect(system).toContain('-y');
    });

    it('计划文件与「用项目自己的命令验证」两条还在', async () => {
        const system = await systemPromptOf();

        // 计划与验收改成提示词约定之后（见 CHANGELOG 顶部那段），提示词就是它们唯一的家，
        // 掉了就等于两套机制一起消失。
        expect(system).toContain('PLAN.md');
        expect(system).toContain('项目自己的命令验证');
    });
});
