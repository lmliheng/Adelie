// 决策回退：反复失败时先回灌一次失败上下文，给模型换做法的机会。
//
// 对应 run_test/PRD.md §6.2/§6.4/§7.1：
//   - 旧行为是同一工具在窗口内反复失败就直接以 error 收摊，模型连一次改道的机会都没有；
//   - 现在先把失败上下文回灌给模型一次，它换了做法就能继续，
//     换完还失败才停机（回灌次数固定为 1）。

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentRuntime } from '../src/agent.runtime.js';
import { createTestWorkspace, cleanupTestWorkspace } from './setup.js';
import type {
    AgentProvider,
    AgentProviderConfig,
    ChatMessage,
    ModelDecision,
    ModelResponse,
    Tool,
    ToolParams,
    ToolResult,
    ValidationResult,
} from 'adelie-core';

class ScriptedProvider implements AgentProvider {
    readonly name = 'scripted';
    config: AgentProviderConfig = { modelName: 'scripted', temperature: 0, maxTokens: 100 };
    readonly calls: ChatMessage[][] = [];
    private index = 0;

    constructor(private readonly decisions: ModelDecision[]) {}

    updateConfig(): void {
        // 测试用
    }

    async decide(messages: ChatMessage[]): Promise<ModelResponse> {
        this.calls.push(messages.map((message) => ({ ...message })));
        const decision = this.decisions[this.index] ?? { type: 'Final' as const, answer: '结束' };
        this.index += 1;
        return { decision, rawContent: '' };
    }
}

class AlwaysFailingTool implements Tool<ToolParams> {
    name = 'flaky_tool';
    description = '总是失败的测试工具';
    permissions = { readsFiles: false, writesFiles: false, runsShell: false, requiresApproval: false };
    calls = 0;

    getSchema() {
        return { type: 'object', properties: { attempt: { type: 'string' } }, required: [] };
    }

    validate(params: unknown): ValidationResult {
        const p = (params ?? {}) as Record<string, unknown>;
        return { valid: true, errors: [], sanitized: { attempt: String(p.attempt ?? '') } as ToolParams };
    }

    async execute(): Promise<ToolResult> {
        this.calls += 1;
        return { success: false, data: null, error: `第 ${this.calls} 次尝试：连接超时` };
    }
}

/** 把某条消息里的文本拼起来，便于断言「模型看到了什么」 */
function textOf(messages: ChatMessage[]): string {
    return messages
        .map((message) => (typeof message.content === 'string' ? message.content : ''))
        .join('\n');
}

describe('反复失败时的回灌与停机', () => {
    let workspaceDir: string;

    beforeEach(() => {
        workspaceDir = createTestWorkspace({ 'src/a.ts': 'export const a = 1;\n' });
    });

    afterEach(() => {
        cleanupTestWorkspace(workspaceDir);
    });

    function runtimeWith(decisions: ModelDecision[], tool: Tool<ToolParams>) {
        const provider = new ScriptedProvider(decisions);
        const runtime = new AgentRuntime(provider, [tool], {
            workspacePath: workspaceDir,
            maxIterations: 12,
        } as never);
        return { runtime, provider };
    }

    it('反复失败先把失败上下文回灌给模型一次（不再是直接报错收摊）', async () => {
        const tool = new AlwaysFailingTool();
        const fail = (n: number): ModelDecision => ({
            type: 'Action',
            tool: 'flaky_tool',
            params: { attempt: String(n) },
            thought: '再试一次',
        });

        const { runtime, provider } = runtimeWith(
            [fail(1), fail(2), fail(3), { type: 'Final', answer: '放弃这条路线' }],
            tool,
        );

        const { state } = await runtime.run('把这件事做成');

        // 第三次失败之后的那一轮请求里，模型拿到了失败上下文与「换一种做法」的要求
        const nudged = provider.calls[provider.calls.length - 1]!;
        expect(textOf(nudged)).toContain('换一种做法');
        expect(textOf(nudged)).toContain('连接超时');

        // 没有停机：模型自己收的尾
        expect(state.stopReason?.type).toBe('task_completed');
        expect(tool.calls).toBe(3);
    });

    it('回灌一次仍失败就停机，并说清是「回灌之后还是不行」', async () => {
        const tool = new AlwaysFailingTool();
        const fail = (n: number): ModelDecision => ({
            type: 'Action',
            tool: 'flaky_tool',
            params: { attempt: String(n) },
            thought: '还是这条路',
        });

        const { runtime } = runtimeWith(
            [fail(1), fail(2), fail(3), fail(4), fail(5), fail(6), fail(7)],
            tool,
        );

        const { state } = await runtime.run('把这件事做成');

        expect(state.stopReason?.type).toBe('error');
        expect(JSON.stringify(state.stopReason)).toContain('反复失败');
        // 第一次回灌之后又失败 3 次才停 —— 不是一撞上就直接放弃
        expect(tool.calls).toBe(6);
    });
});
