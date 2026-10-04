// 契约集成测试：真的起一个 http 服务，注入假 provider，把 docs/api.md 走一遍。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSession, startHarness, type Harness } from './harness.js';
import { consumeSse, eventsOf, json } from './sse-client.js';

describe('adelie-server 契约', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterAll(async () => {
    await harness.dispose();
  });

  describe('基本与配置', () => {
    it('GET /api/health 回 ok 与版本', async () => {
      const res = await fetch(`${harness.base}/api/health`);
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body['ok']).toBe(true);
      expect(body['name']).toBe('adelie');
      expect(body['version']).toBe('0.1.0');
      expect(typeof body['uptimeMs']).toBe('number');
    });

    it('GET /api/config 形状正确且不含密钥', async () => {
      const res = await fetch(`${harness.base}/api/config`);
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;

      expect(body['workspace']).toBe(harness.workspace);
      // 模型是一条引用（provider + 模型名），不是两个平铺字段
      expect(body['model']).toEqual({ provider: 'deepseek', model: 'deepseek-chat' });
      expect(body['baseUrl']).toBeNull();
      expect(typeof body['hasApiKey']).toBe('boolean');
      expect(body['approvalPolicy']).toBe('auto-reject');
      expect(body['limits']).toEqual({ maxIterations: 50, maxTokens: null });
      expect(body['version']).toBe('0.1.0');
      // 密钥绝不回显：连字段名都不该出现
      expect(Object.keys(body)).not.toContain('apiKey');
    });

    it('PATCH /api/config 改得动 model 与 limits', async () => {
      const res = await fetch(`${harness.base}/api/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: { provider: 'deepseek', model: 'deepseek-reasoner' },
          maxIterations: 7,
          maxTokens: 1234,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body['model']).toEqual({ provider: 'deepseek', model: 'deepseek-reasoner' });
      expect(body['limits']).toEqual({ maxIterations: 7, maxTokens: 1234 });

      // 改回去，免得影响后面的用例
      await fetch(`${harness.base}/api/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: { provider: 'deepseek', model: 'deepseek-chat' },
          maxIterations: 50,
          maxTokens: null,
        }),
      });
    });

    it('PATCH /api/config 非法 provider 回 400 bad_request', async () => {
      const res = await fetch(`${harness.base}/api/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: { provider: 'gemini' } }),
      });
      expect(res.status).toBe(400);
      const body = await res.json() as Record<string, unknown>;
      expect(body['error']).toBe('bad_request');
      expect(typeof body['message']).toBe('string');
    });

    it('GET /api/tools 列出工具与是否需要审批', async () => {
      const res = await fetch(`${harness.base}/api/tools`);
      expect(res.status).toBe(200);
      const body = await res.json() as { tools: Array<Record<string, unknown>> };

      const names = body.tools.map((tool) => tool['name']);
      expect(names).toContain('read_file');
      expect(names).toContain('create_file');

      expect(body.tools.find((tool) => tool['name'] === 'create_file')?.['requiresApproval']).toBe(true);
      expect(body.tools.find((tool) => tool['name'] === 'read_file')?.['requiresApproval']).toBe(false);
    });
  });

  describe('会话与对话流', () => {
    it('建会话 → 跑一轮 → 回放', async () => {
      // 1) 建会话
      const created = await harness.post('/api/sessions');
      expect(created.status).toBe(201);
      const createdBody = await created.json() as { session: Record<string, unknown> };
      const sessionId = createdBody.session['id'] as string;
      expect(typeof sessionId).toBe('string');
      expect(createdBody.session['workspace']).toBe(harness.workspace);
      expect(createdBody.session['taskCount']).toBe(0);
      expect(createdBody.session['title']).toBeNull();

      // 2) 发一条消息，收完整条 SSE
      harness.script(
        { type: 'Action', tool: 'read_file', params: { path: 'README.md' } },
        { type: 'Final', answer: '读完了' },
      );
      const res = await harness.post(`/api/sessions/${sessionId}/messages`, { text: '读一下 README' });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');

      const frames = await consumeSse(res, () => undefined);
      const events = eventsOf(frames);

      // run_started 是第一条，done 是最后一条
      expect(events[0]).toBe('run_started');
      expect(events[events.length - 1]).toBe('done');
      expect(events).toContain('delta');
      expect(events).toContain('event');
      expect(events).toContain('run_finished');

      const started = json(frames[0]!);
      expect(started['task']).toBe('读一下 README');
      expect(typeof started['runId']).toBe('string');

      const deltas = frames.filter((frame) => frame.event === 'delta').map(json);
      expect(deltas.length).toBeGreaterThan(0);
      for (const delta of deltas) {
        expect(['content', 'reasoning']).toContain(delta['kind']);
        expect(typeof delta['text']).toBe('string');
      }

      // event 帧的形状：{ type, payload, timestamp }
      const eventFrames = frames.filter((frame) => frame.event === 'event').map(json);
      for (const eventFrame of eventFrames) {
        expect(typeof eventFrame['type']).toBe('string');
        expect(typeof eventFrame['timestamp']).toBe('number');
        expect(eventFrame).toHaveProperty('payload');
      }
      const types = eventFrames.map((frame) => frame['type']);
      expect(types).toContain('decision');
      expect(types).toContain('observation');
      expect(types).toContain('stopped');
      // task_started 由 run_started 表达，不该重复出现在 event 帧里
      expect(types).not.toContain('task_started');

      const finished = json(frames.find((frame) => frame.event === 'run_finished')!);
      expect(finished['runId']).toBe(started['runId']);
      expect((finished['stopReason'] as Record<string, unknown>)['type']).toBe('task_completed');
      expect(finished['usage']).toEqual({
        promptTokens: expect.any(Number),
        completionTokens: expect.any(Number),
        totalTokens: expect.any(Number),
      });
      expect(Array.isArray(finished['fileChanges'])).toBe(true);
      expect(typeof finished['iterations']).toBe('number');

      // 3) 回放：GET 能看到刚才那一轮
      const detail = await fetch(`${harness.base}/api/sessions/${sessionId}`);
      expect(detail.status).toBe(200);
      const detailBody = await detail.json() as {
        session: Record<string, unknown>;
        runs: Array<Record<string, unknown>>;
        events: Array<Record<string, unknown>>;
      };

      expect(detailBody.runs).toHaveLength(1);
      expect(detailBody.runs[0]?.['taskDescription']).toBe('读一下 README');
      expect(detailBody.runs[0]?.['decisions']).toHaveLength(2);
      expect(detailBody.session['taskCount']).toBe(1);
      expect(detailBody.session['title']).toBe('读一下 README');
      expect(detailBody.events.length).toBeGreaterThan(0);
      expect(detailBody.events[0]?.['type']).toBe('task_started');

      // 列表里也应当有它
      const list = await fetch(`${harness.base}/api/sessions`);
      const listBody = await list.json() as { sessions: Array<Record<string, unknown>> };
      expect(listBody.sessions.some((session) => session['id'] === sessionId)).toBe(true);

      // markdown 导出
      const markdown = await fetch(`${harness.base}/api/sessions/${sessionId}/markdown`);
      expect(markdown.status).toBe(200);
      expect(markdown.headers.get('content-type')).toContain('text/markdown');
      expect(await markdown.text()).toContain('# 会话记录');
    });

    it('DELETE 会话回 204，之后 404', async () => {
      const sessionId = await createSession(harness);

      const deleted = await fetch(`${harness.base}/api/sessions/${sessionId}`, { method: 'DELETE' });
      expect(deleted.status).toBe(204);

      const after = await fetch(`${harness.base}/api/sessions/${sessionId}`);
      expect(after.status).toBe(404);
    });
  });

  describe('错误形状', () => {
    it('不存在的会话：404 not_found', async () => {
      const res = await fetch(`${harness.base}/api/sessions/20260101-000000-abcdef`);
      expect(res.status).toBe(404);
      expect(((await res.json()) as Record<string, unknown>)['error']).toBe('not_found');

      const message = await harness.post('/api/sessions/20260101-000000-abcdef/messages', { text: '在吗' });
      expect(message.status).toBe(404);
    });

    it('POST /messages 缺少 text 回 400 bad_request', async () => {
      const sessionId = await createSession(harness);
      const res = await harness.post(`/api/sessions/${sessionId}/messages`, {});
      expect(res.status).toBe(400);
      expect(((await res.json()) as Record<string, unknown>)['error']).toBe('bad_request');
    });

    it('POST /sessions 指定不存在的工作区回 400 bad_request', async () => {
      const res = await harness.post('/api/sessions', { workspace: '/nope/definitely/missing' });
      expect(res.status).toBe(400);
      expect(((await res.json()) as Record<string, unknown>)['error']).toBe('bad_request');
    });
  });
});
