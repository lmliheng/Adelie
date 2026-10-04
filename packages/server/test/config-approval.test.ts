// 审批口径三档（契约 §2 的 `approvalPolicy`）。
//
// 它**不是**运行时那两个枚举的直传：用户选的是「要不要问我」，所以这三档里的
// 前两档与第三档的差别是「有没有交互层」。验证因此不能只看配置回显 ——
// 要能看出「问」与「不问」在事件流上的差别：一个会出 approval_request 帧，
// 一个不会，而动作本身照样执行（allow-all）或被拦下（read-only）。
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSession, startHarness, type Harness } from './harness.js';
import { consumeSse, eventsOf, json, type SseFrame } from './sse-client.js';

describe('审批口径', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterAll(async () => {
    await harness.dispose();
  });

  it('默认是 always-ask，PATCH 能改到三档里的任何一档', async () => {
    const initial = await (await fetch(`${harness.base}/api/config`)).json() as Record<string, unknown>;
    expect(initial['approvalPolicy']).toBe('always-ask');

    for (const mode of ['read-only', 'allow-all', 'always-ask']) {
      const res = await harness.post('/api/config', { approvalPolicy: mode }, { method: 'PATCH' });
      expect(res.status).toBe(200);
      expect(((await res.json()) as Record<string, unknown>)['approvalPolicy']).toBe(mode);

      const read = await (await fetch(`${harness.base}/api/config`)).json() as Record<string, unknown>;
      expect(read['approvalPolicy']).toBe(mode);
    }
  });

  it('认不出的档位是 400，并且不把配置改坏', async () => {
    const res = await harness.post('/api/config', { approvalPolicy: 'yolo' }, { method: 'PATCH' });
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body['error']).toBe('bad_request');
    expect(String(body['message'])).toContain('always-ask');

    const read = await (await fetch(`${harness.base}/api/config`)).json() as Record<string, unknown>;
    expect(read['approvalPolicy']).toBe('always-ask');
  });

  it('allow-all：不问，需要审批的动作直接执行', async () => {
    await putMode(harness, 'allow-all');
    const sessionId = await createSession(harness);

    harness.script(
      { type: 'Action', tool: 'create_file', params: { path: 'auto.md', content: 'hello' } },
      { type: 'Final', answer: '建好了' },
    );

    const frames = await run(harness, sessionId, '建一个 auto.md');

    const events = eventsOf(frames);
    expect(events).not.toContain('approval_request');
    expect(events[0]).toBe('run_started');
    expect(events[events.length - 1]).toBe('done');
    const finished = json(frames.find((frame) => frame.event === 'run_finished')!);
    expect((finished['stopReason'] as Record<string, unknown>)['type']).toBe('task_completed');

    // 「不问」不等于「不记」：决定照样落进事件流，来源是 policy 而不是人
    const approval = approvalEvent(frames);
    expect(approval['decision']).toBe('approve');
    expect(approval['source']).toBe('policy');
    expect(existsSync(join(harness.workspace, 'auto.md'))).toBe(true);
  });

  it('read-only：不问，需要审批的动作被自动拒绝，工作区没被动过', async () => {
    await putMode(harness, 'read-only');
    const sessionId = await createSession(harness);

    harness.script(
      { type: 'Action', tool: 'create_file', params: { path: 'blocked.md', content: 'hello' } },
      { type: 'Final', answer: '好吧' },
    );

    const frames = await run(harness, sessionId, '建一个 blocked.md');

    const events = eventsOf(frames);
    expect(events).not.toContain('approval_request');
    const approval = approvalEvent(frames);
    expect(approval['decision']).toBe('reject');
    expect(approval['source']).toBe('policy');
    expect(existsSync(join(harness.workspace, 'blocked.md'))).toBe(false);
  });
});

/** 改一档审批口径，并确认服务端真的收下了 */
async function putMode(harness: Harness, mode: string): Promise<void> {
  const res = await harness.post('/api/config', { approvalPolicy: mode }, { method: 'PATCH' });
  expect(res.status).toBe(200);
  expect(((await res.json()) as Record<string, unknown>)['approvalPolicy']).toBe(mode);
}

async function run(harness: Harness, sessionId: string, text: string): Promise<SseFrame[]> {
  const res = await harness.post(`/api/sessions/${sessionId}/messages`, { text });
  expect(res.status).toBe(200);
  const frames: SseFrame[] = [];
  await consumeSse(res, (frame) => {
    frames.push(frame);
  });
  return frames;
}

/** 事件流里唯一那条 approval 记录 */
function approvalEvent(frames: readonly SseFrame[]): Record<string, unknown> {
  const frame = frames.find((item) => item.event === 'event' && json(item)['type'] === 'approval');
  expect(frame).toBeDefined();
  const payload = json(frame!)['payload'] as { approval: Record<string, unknown> };
  return payload.approval;
}
