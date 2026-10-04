// 对话流、取消、审批（契约 §4、§5）。
import { replaySession } from 'adelie-core';
import { streamSSE } from 'hono/streaming';

import { jsonError, readJsonObject } from '../http.js';
import { SseChannel } from '../sse.js';
import { executeTurn } from '../turn.js';

import type { Hono } from 'hono';
import type { ServerContext } from '../context.js';

export function registerChatRoutes(app: Hono, ctx: ServerContext): void {
  app.post('/api/sessions/:id/messages', async (c) => {
    const sessionId = c.req.param('id');
    const body = await readJsonObject(c);

    const text = body?.['text'];
    if (typeof text !== 'string' || text.trim() === '') {
      return jsonError(c, 400, 'bad_request', 'text 必须是非空字符串');
    }

    const { workspace, store, known } = ctx.locate(sessionId);
    if (!known) return jsonError(c, 404, 'not_found', `会话不存在：${sessionId}`);

    // 同一条会话同时只能有一轮在跑（契约 §4）。占位与检查都是同步的，
    // 两条并发请求不会都通过。
    if (ctx.runs.isBusy(sessionId)) {
      return jsonError(c, 409, 'busy', '这条会话已有一轮在跑');
    }
    const slot = ctx.runs.start(sessionId);
    if (slot === null) return jsonError(c, 409, 'busy', '这条会话已有一轮在跑');

    // 历史在这一刻读一次，作为本轮的 priorRuns（「接着聊」不等于「接着跑」）
    const priorRuns = replaySession(store.readEvents(), {
      sessionId,
      workspaceRoot: workspace,
    }).runs;

    // 配置快照：本轮开跑之后 PATCH /api/config 不该改掉正在跑的这轮
    const settings = { ...ctx.settings };
    const channel = new SseChannel();

    return streamSSE(c, async (stream) => {
      // 客户端断开（刷新、关标签页、网络断了）要能中止本轮运行
      const onAbort = (): void => {
        channel.close();
        slot.cancel();
      };
      stream.onAbort(onAbort);
      c.req.raw.signal.addEventListener('abort', onAbort);

      const turn = executeTurn({
        sessionId,
        task: text,
        workspace,
        settings,
        store,
        priorRuns,
        tools: ctx.tools,
        eagerTools: ctx.eagerTools,
        createProvider: ctx.createProvider,
        channel,
        slot,
      });

      try {
        for await (const frame of channel.drain()) {
          await stream.writeSSE({ event: frame.event, data: JSON.stringify(frame.data) });
        }
      } finally {
        channel.close();
        // 等这一轮真正收尾：它保证事件已落盘、审批表已清空
        await turn;
        c.req.raw.signal.removeEventListener('abort', onAbort);
        ctx.runs.finish(sessionId);
        await stream.close();
      }
    });
  });

  app.post('/api/sessions/:id/cancel', (c) => {
    const sessionId = c.req.param('id');
    const { known } = ctx.locate(sessionId);
    if (!known) return jsonError(c, 404, 'not_found', `会话不存在：${sessionId}`);

    // 没有在跑的一轮时也回 202：取消是幂等的，重复点两下不该是错误
    ctx.runs.get(sessionId)?.cancel();
    return c.json({ ok: true }, 202);
  });

  app.post('/api/sessions/:id/approvals', async (c) => {
    const sessionId = c.req.param('id');
    const body = await readJsonObject(c);
    if (body === null) return jsonError(c, 400, 'bad_request', '请求体必须是 JSON 对象');

    const actionId = body['actionId'];
    const decision = body['decision'];
    if (typeof actionId !== 'string' || actionId === '') {
      return jsonError(c, 400, 'bad_request', 'actionId 必须是非空字符串');
    }
    if (decision !== 'approve' && decision !== 'deny') {
      return jsonError(c, 400, 'bad_request', 'decision 只能是 approve 或 deny');
    }

    const { known } = ctx.locate(sessionId);
    if (!known) return jsonError(c, 404, 'not_found', `会话不存在：${sessionId}`);

    const slot = ctx.runs.get(sessionId);
    const accepted = slot?.approvals.decide(actionId, decision === 'approve' ? 'approve' : 'reject');
    if (accepted !== true) {
      // 已超时 / 已决定 / 不属于当前这一轮：一律 stale_approval（契约 §5）
      return jsonError(c, 409, 'stale_approval', '这条审批已失效（已决定或已超时）');
    }

    // remember 目前只作为审计意图接收；决定本身由运行时写进 approval 事件
    return c.json({ ok: true });
  });
}
