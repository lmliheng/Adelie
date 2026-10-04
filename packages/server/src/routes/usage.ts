// 用量与成本（契约 §2 的 `GET /api/usage`）。
//
// 数据来源是**盘上的事件流**，不是一张表：扫这个身份看得见的会话，把每轮的 token
// 从事件里读出来现算（理由见 core 的 `usage/aggregate.ts` —— 不做第二份真相）。
// 这一层只负责三件事：**谁看得见哪些会话**、把 `from/to` 收窄、把服务端的 `now` 传下去。
//
// 归属与 /api/sessions 同一条规矩：默认只看自己的，管理员可以 `?scope=all` 看全部；
// `scope=all` 对普通用户是静默忽略（与列表路由一致，不额外报错）。
import { SessionStore, aggregateUsage, runsFromEvents } from 'adelie-core';

import { jsonError } from '../http.js';
import { identityOf } from '../identity.js';
import { locationOptions } from '../sessions.js';

import type { Context, Hono } from 'hono';
import type { AggregateOptions, StoredSessionEvent, UsageRun } from 'adelie-core';
import type { AppEnv } from '../identity.js';
import type { ServerContext } from '../context.js';

/**
 * `from` / `to`：**epoch 毫秒**，闭区间。同时收 ISO 时间串（`Date.parse` 认的都行）——
 * 浏览器里 `new Date(...).getTime()` 与手写链接两种用法都常见，多认一种不值得多一条错。
 * 认不出来时返回 null（调用方报 400），**不猜**成 0 或「现在」；没给则 undefined（= 不限）。
 */
function parseBound(raw: string | undefined): number | undefined | null {
  if (raw === undefined || raw.trim() === '') return undefined;
  const text = raw.trim();
  if (/^\d+$/.test(text)) return Number(text);
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function registerUsageRoutes(app: Hono<AppEnv>, ctx: ServerContext): void {
  app.get('/api/usage', (c: Context) => {
    const identity = identityOf(c);

    const from = parseBound(c.req.query('from'));
    const to = parseBound(c.req.query('to'));
    if (from === null) return jsonError(c, 400, 'bad_request', 'from 必须是 epoch 毫秒或 ISO 时间串');
    if (to === null) return jsonError(c, 400, 'bad_request', 'to 必须是 epoch 毫秒或 ISO 时间串');
    if (from !== undefined && to !== undefined && from > to) {
      return jsonError(c, 400, 'bad_request', 'from 不能晚于 to');
    }

    // 命令行直接写出来的会话不在索引里，先补一遍（只给管理员补，理由同列表路由）
    if (identity.isAdmin) ctx.syncSessionsFromDisk();

    const wantsAll = c.req.query('scope') === 'all' && identity.isAdmin;
    const rows = ctx.users.listSessionRows(wantsAll ? null : identity.ownerId);

    const runs: UsageRun[] = [];
    let sessionsScanned = 0;
    let unreadableSessions = 0;

    for (const row of rows) {
      try {
        const store = new SessionStore(row.workspace, row.sessionId, locationOptions(ctx.sessionsRootFor(row.userId)));
        const events: StoredSessionEvent[] = store.readEvents();
        // 空会话（建了没说话）在账单上没有意义，连「扫过」都不算
        if (events.length === 0) continue;

        sessionsScanned += 1;
        runs.push(...runsFromEvents(events, { sessionId: row.sessionId, metaModel: store.readMeta()?.model }));
      } catch {
        // 目录删了一半、权限不足：跳过它，但把条数报上去 —— 报表少算了几条要说得出来
        unreadableSessions += 1;
      }
    }

    // `now` 由服务端给：界面对「今天 / 最近 7 天」的分界不该有自己的表。
    // 选项按需拼（`exactOptionalPropertyTypes` 下不能把 undefined 显式塞给可选字段）
    const options: AggregateOptions = {
      now: Date.now(),
      ...(from === undefined ? {} : { from }),
      ...(to === undefined ? {} : { to }),
    };
    const report = aggregateUsage(runs, options, { sessionsScanned, unreadableSessions });
    return c.json({ ...report, now: options.now });
  });
}
