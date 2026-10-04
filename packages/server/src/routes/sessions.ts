// 会话的增删查与导出（契约 §3）。
import { makeSessionId } from 'adelie-core';

import { isDirectory } from '../context.js';
import { jsonError, readJsonObject } from '../http.js';
import { normalizeWorkspace } from '../settings.js';
import {
  buildSessionView,
  exportSessionMarkdown,
  listSessionViews,
  readSessionSnapshot,
  removeSession,
} from '../sessions.js';

import type { Hono } from 'hono';
import type { ServerContext } from '../context.js';

export function registerSessionRoutes(app: Hono, ctx: ServerContext): void {
  app.get('/api/sessions', (c) => c.json({
    sessions: listSessionViews(ctx.settings.workspace, ctx.deps.sessionsRoot),
  }));

  app.post('/api/sessions', async (c) => {
    const body = await readJsonObject(c);
    if (body === null) return jsonError(c, 400, 'bad_request', '请求体必须是 JSON 对象');

    let workspace = ctx.settings.workspace;
    if (body['workspace'] !== undefined) {
      const raw = body['workspace'];
      if (typeof raw !== 'string' || raw.trim() === '') {
        return jsonError(c, 400, 'bad_request', 'workspace 必须是非空字符串');
      }
      workspace = normalizeWorkspace(raw);
      if (!isDirectory(workspace)) {
        return jsonError(c, 400, 'bad_request', `工作区不存在或不是目录：${workspace}`);
      }
    }

    const now = Date.now();
    const sessionId = makeSessionId(new Date(now));
    // 先记住再回 201：空会话在磁盘上还没有任何文件，注册表是它此刻唯一的凭据
    ctx.registry.remember(sessionId, workspace);

    return c.json({
      session: buildSessionView({
        sessionId,
        workspace,
        createdAt: now,
        lastActiveAt: now,
        events: [],
      }),
    }, 201);
  });

  app.get('/api/sessions/:id', (c) => {
    const sessionId = c.req.param('id');
    const { workspace, store, known } = ctx.locate(sessionId);
    if (!known) return jsonError(c, 404, 'not_found', `会话不存在：${sessionId}`);

    const summary = store.summary();
    const now = Date.now();
    const snapshot = readSessionSnapshot(store, workspace, {
      createdAt: summary?.createdAt ?? now,
      lastActiveAt: summary?.lastActiveAt ?? now,
    });

    return c.json({
      session: snapshot.view,
      runs: snapshot.runs,
      events: snapshot.events,
    });
  });

  app.delete('/api/sessions/:id', (c) => {
    const sessionId = c.req.param('id');
    const { workspace, known } = ctx.locate(sessionId);
    if (!known) return jsonError(c, 404, 'not_found', `会话不存在：${sessionId}`);
    // 正在写的那条会话被删掉之后，后续每条事件都会静默失败（与 CLI 的同一条规矩）
    if (ctx.runs.isBusy(sessionId)) {
      return jsonError(c, 409, 'busy', '这条会话正在跑，先取消或等它结束');
    }

    removeSession(workspace, sessionId, ctx.deps.sessionsRoot);
    ctx.registry.forget(sessionId);
    return c.body(null, 204);
  });

  app.get('/api/sessions/:id/markdown', (c) => {
    const sessionId = c.req.param('id');
    const { store, known } = ctx.locate(sessionId);
    if (!known) return jsonError(c, 404, 'not_found', `会话不存在：${sessionId}`);

    return c.body(exportSessionMarkdown(store), 200, {
      'Content-Type': 'text/markdown; charset=utf-8',
    });
  });
}
