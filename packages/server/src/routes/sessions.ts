// 会话的增删查与导出（契约 §3）。
//
// 归属从这里开始变得具体：**每个会话在索引里有一个主人**，读的时候由主人说了算，
// 而不是由请求里带的 sessionId 说了算。看不到的会话回 **404**（不是 403）——
// 403 等于告诉对方「这个 id 存在，只是不给你」，那就是一个会话枚举器。
import { makeSessionId } from 'adelie-core';

import { isDirectory } from '../context.js';
import { jsonError, readJsonObject } from '../http.js';
import { identityOf } from '../identity.js';
import { normalizeWorkspace } from '../settings.js';
import {
  buildSessionView,
  exportSessionMarkdown,
  listSessionViewsFor,
  readSessionSnapshot,
  removeSession,
} from '../sessions.js';

import type { Context, Hono } from 'hono';
import type { AppEnv } from '../identity.js';
import type { ServerContext } from '../context.js';

/** 看不见的会话一律这条：404，且与「真的没有这个 id」用同一个响应 */
function notFound(c: Context): Response {
  return jsonError(c, 404, 'not_found', '会话不存在');
}

export function registerSessionRoutes(app: Hono<AppEnv>, ctx: ServerContext): void {
  app.get('/api/sessions', (c) => {
    const identity = identityOf(c);
    // 命令行直接写出来的会话不在索引里，列之前先补一遍。只给管理员补：非管理员的
    // 会话都来自 POST（那时已经落库），而扫描别人的根目录没有理由发生在普通请求里。
    if (identity.isAdmin) ctx.syncSessionsFromDisk();

    // `scope=all` 只有管理员有意义：普通用户传了也只会得到自己那几条
    const wantsAll = c.req.query('scope') === 'all' && identity.isAdmin;
    const rows = ctx.users.listSessionRows(wantsAll ? null : identity.ownerId);
    const owners = new Map(ctx.users.listUsers().map((user) => [user.id, user.name]));

    return c.json({
      sessions: listSessionViewsFor(
        rows,
        (ownerId) => ctx.sessionsRootFor(ownerId),
        owners,
        identity.ownerId,
        identity.isAdmin,
      ),
    });
  });

  app.post('/api/sessions', async (c) => {
    const identity = identityOf(c);
    const settings = ctx.settingsFor(identity);
    const body = await readJsonObject(c);
    if (body === null) return jsonError(c, 400, 'bad_request', '请求体必须是 JSON 对象');

    let workspace = settings.workspace;
    if (body['workspace'] !== undefined) {
      // 换工作区是管理员的事（它决定 Agent 能在哪个目录里动手）。普通用户在
      // 管理员给自己定的那个工作区里建会话 —— 于是「用户 B 指到 A 的家目录」
      // 这条路根本不存在。
      if (!identity.isAdmin) {
        return jsonError(c, 403, 'admin_required', '只有管理员能指定工作区');
      }
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
    // 先落索引再回 201：空会话在磁盘上还没有任何文件，索引是它此刻唯一的凭据。
    // 也正是这条索引让「谁建的」在后面的每一次读里都说得清。
    ctx.users.rememberSession(sessionId, identity.ownerId, workspace, now);
    ctx.registry.remember(sessionId, workspace);

    return c.json({
      session: buildSessionView({
        sessionId,
        workspace,
        createdAt: now,
        lastActiveAt: now,
        events: [],
        // 空会话还没写盘，会话头也还不存在 —— 模型按当前配置报，与它落盘时一致
        model: settings.model,
      }),
    }, 201);
  });

  app.get('/api/sessions/:id', (c) => {
    const sessionId = c.req.param('id');
    const located = ctx.locate(sessionId, identityOf(c));
    if (!located.known || !located.allowed) return notFound(c);

    const summary = located.store.summary();
    const now = Date.now();
    const snapshot = readSessionSnapshot(located.store, located.workspace, {
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
    const identity = identityOf(c);
    const located = ctx.locate(sessionId, identity);
    if (!located.known || !located.allowed) return notFound(c);
    // 正在写的那条会话被删掉之后，后续每条事件都会静默失败（与 CLI 的同一条规矩）
    if (ctx.runs.isBusy(sessionId)) {
      return jsonError(c, 409, 'busy', '这条会话正在跑，先取消或等它结束');
    }

    // 删的是落在**主人**分区里的那一份目录（管理员删别人的会话时，两者不同）
    removeSession(located.workspace, sessionId, ctx.sessionsRootFor(located.ownerId ?? identity.ownerId));
    ctx.users.forgetSession(sessionId);
    ctx.registry.forget(sessionId);
    return c.body(null, 204);
  });

  app.get('/api/sessions/:id/markdown', (c) => {
    const sessionId = c.req.param('id');
    const located = ctx.locate(sessionId, identityOf(c));
    if (!located.known || !located.allowed) return notFound(c);

    return c.body(exportSessionMarkdown(located.store), 200, {
      'Content-Type': 'text/markdown; charset=utf-8',
    });
  });
}
