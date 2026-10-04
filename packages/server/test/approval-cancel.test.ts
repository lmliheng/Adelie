// 审批、并发、取消（契约 §4、§5）。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createSession, startHarness, type Harness } from './harness.js';
import { consumeSse, eventsOf, json, type SseFrame } from './sse-client.js';

describe('审批与取消', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness();
  });

  afterAll(async () => {
    await harness.dispose();
  });

  it('需要审批的工具：approval_request → 决定 → 跑完；并发与重复决定都是 409', async () => {
    const sessionId = await createSession(harness);

    harness.script(
      { type: 'Action', tool: 'create_file', params: { path: 'notes.md', content: 'hello' } },
      { type: 'Final', answer: '建好了' },
    );

    const res = await harness.post(`/api/sessions/${sessionId}/messages`, { text: '建一个 notes.md' });
    expect(res.status).toBe(200);

    let approvalActionId: string | null = null;
    const frames: SseFrame[] = await consumeSse(res, async (frame) => {
      if (frame.event !== 'approval_request') return;

      const data = json(frame);
      expect(typeof data['actionId']).toBe('string');
      const action = data['action'] as Record<string, unknown>;
      expect(action['id']).toBe(data['actionId']);
      approvalActionId = data['actionId'] as string;

      // 同一条会话再发一条消息 → 409 busy（契约 §4）
      const busy = await harness.post(`/api/sessions/${sessionId}/messages`, { text: '又一条' });
      expect(busy.status).toBe(409);
      expect(((await busy.json()) as Record<string, unknown>)['error']).toBe('busy');

      // 批准
      const approved = await harness.post(`/api/sessions/${sessionId}/approvals`, {
        actionId: approvalActionId,
        decision: 'approve',
      });
      expect(approved.status).toBe(200);
      expect(await approved.json()).toEqual({ ok: true });

      // 同一个 actionId 再决定一次 → 409 stale_approval（契约 §5）
      const duplicate = await harness.post(`/api/sessions/${sessionId}/approvals`, {
        actionId: approvalActionId,
        decision: 'deny',
      });
      expect(duplicate.status).toBe(409);
      expect(((await duplicate.json()) as Record<string, unknown>)['error']).toBe('stale_approval');
    });

    expect(approvalActionId).not.toBeNull();

    const events = eventsOf(frames);
    expect(events[0]).toBe('run_started');
    expect(events).toContain('approval_request');
    expect(events[events.length - 1]).toBe('done');

    const finished = json(frames.find((frame) => frame.event === 'run_finished')!);
    expect((finished['stopReason'] as Record<string, unknown>)['type']).toBe('task_completed');

    // 决定落进了事件流
    const detail = await fetch(`${harness.base}/api/sessions/${sessionId}`);
    const detailBody = await detail.json() as { events: Array<Record<string, unknown>> };
    const approvalEvents = detailBody.events.filter((event) => event['type'] === 'approval');
    expect(approvalEvents).toHaveLength(1);

    const approvalPayload = approvalEvents[0]?.['payload'] as { approval: Record<string, unknown> };
    expect(approvalPayload.approval['decision']).toBe('approve');
    expect(approvalPayload.approval['summary']).toContain('notes.md');

    // 批准之后工具真的执行了
    const markdown = await fetch(`${harness.base}/api/sessions/${sessionId}/markdown`);
    expect(await markdown.text()).toContain('notes.md');

    // 上一轮已结束，同一条会话可以再跑一轮（不再是 busy）
    harness.script({ type: 'Final', answer: '又好了' });
    const afterApproval = await harness.post(`/api/sessions/${sessionId}/messages`, { text: '再来一条' });
    expect(afterApproval.status).toBe(200);
    await consumeSse(afterApproval, () => undefined);
  });

  it('取消：POST /cancel 让等待审批的一轮停下，stopReason 记为 user_interrupted', async () => {
    const sessionId = await createSession(harness);

    harness.script(
      { type: 'Action', tool: 'create_file', params: { path: 'cancelled.md', content: 'x' } },
      { type: 'Final', answer: '不该走到这里' },
    );

    const res = await harness.post(`/api/sessions/${sessionId}/messages`, { text: '建个文件，然后我会取消' });
    expect(res.status).toBe(200);

    let cancelled = false;
    const frames = await consumeSse(res, async (frame) => {
      if (frame.event !== 'approval_request' || cancelled) return;
      cancelled = true;

      const cancelRes = await harness.post(`/api/sessions/${sessionId}/cancel`);
      expect(cancelRes.status).toBe(202);
      expect(await cancelRes.json()).toEqual({ ok: true });
    });

    expect(cancelled).toBe(true);
    const events = eventsOf(frames);
    const finished = json(frames.find((frame) => frame.event === 'run_finished')!);
    expect((finished['stopReason'] as Record<string, unknown>)['type']).toBe('user_interrupted');
    expect(events[events.length - 1]).toBe('done');

    // 事件流里记的是同一个原因：trace 与界面不能各说各话
    const detail = await fetch(`${harness.base}/api/sessions/${sessionId}`);
    const detailBody = await detail.json() as { events: Array<Record<string, unknown>> };
    const stopped = detailBody.events.find((event) => event['type'] === 'stopped');
    const payload = stopped?.['payload'] as { stopReason: Record<string, unknown> };
    expect(payload.stopReason['type']).toBe('user_interrupted');
  });

  it('取消是幂等的：没有在跑的轮次也回 202', async () => {
    const sessionId = await createSession(harness);
    const res = await harness.post(`/api/sessions/${sessionId}/cancel`);
    expect(res.status).toBe(202);

    const missing = await harness.post('/api/sessions/20260101-000000-abcdef/cancel');
    expect(missing.status).toBe(404);
  });

  it('POST /approvals 对未知 actionId 回 409 stale_approval', async () => {
    const sessionId = await createSession(harness);
    const res = await harness.post(`/api/sessions/${sessionId}/approvals`, {
      actionId: '不存在的动作',
      decision: 'approve',
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as Record<string, unknown>)['error']).toBe('stale_approval');
  });
});
