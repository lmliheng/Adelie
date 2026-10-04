// 用户管理（契约 §1）。**整片管理员专用** —— 权限表里 `/api/users` 是 `admin`，
// 所以这些 handler 里不再各写一遍 `if (!isAdmin)`：那种写法漏一处就是一次越权。
//
// 唯一允许非管理员碰的账号动作是「改自己的口令」，它在 routes/auth.ts。
import { jsonError, readJsonObject } from '../http.js';
import { identityOf } from '../identity.js';
import { ADMIN_ID } from '../users/db.js';
import { MIN_PASSWORD_LENGTH, validPassword, validUserName } from './auth.js';

import type { Hono } from 'hono';
import type { AppEnv } from '../identity.js';
import type { ServerContext } from '../context.js';
import type { UserRow } from '../users/db.js';

function publicUser(user: UserRow, selfId: string, sessionCount: number): Record<string, unknown> {
  return {
    id: user.id,
    name: user.name,
    isAdmin: user.isAdmin,
    hasPassword: user.hasPassword,
    createdAt: user.createdAt,
    isSelf: user.id === selfId,
    sessionCount,
  };
}

export function registerUserRoutes(app: Hono<AppEnv>, ctx: ServerContext): void {
  app.get('/api/users', (c) => {
    const identity = identityOf(c);
    const counted = new Map<string, number>();
    for (const row of ctx.users.listSessionRows(null)) {
      counted.set(row.userId, (counted.get(row.userId) ?? 0) + 1);
    }
    return c.json({
      users: ctx.users.listUsers().map((user) =>
        publicUser(user, identity.ownerId, counted.get(user.id) ?? 0)),
    });
  });

  app.post('/api/users', async (c) => {
    const body = await readJsonObject(c);
    if (body === null) return jsonError(c, 400, 'bad_request', '请求体必须是 JSON 对象');

    const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
    if (!validUserName(name)) {
      return jsonError(c, 400, 'bad_request', '用户名只能是字母、数字、下划线、点或连字符，1–32 个字符');
    }
    if (ctx.users.findUserByName(name) !== undefined) {
      return jsonError(c, 409, 'conflict', `已经有叫 ${name} 的用户了`);
    }

    const rawPassword = body['password'];
    if (rawPassword !== undefined && rawPassword !== null) {
      if (typeof rawPassword !== 'string' || !validPassword(rawPassword)) {
        return jsonError(c, 400, 'bad_request', `口令至少 ${MIN_PASSWORD_LENGTH} 位`);
      }
    }
    const isAdmin = body['isAdmin'] === true;
    const created = ctx.users.createUser({
      name,
      password: typeof rawPassword === 'string' ? rawPassword : null,
      isAdmin,
    });
    return c.json({ user: publicUser(created, identityOf(c).ownerId, 0) }, 201);
  });

  app.delete('/api/users/:id', (c) => {
    const id = c.req.param('id');
    const identity = identityOf(c);
    if (id === ADMIN_ID) {
      return jsonError(c, 400, 'bad_request', '内置管理员不能删（它是接管这台机器的那把钥匙）');
    }
    if (id === identity.ownerId) {
      return jsonError(c, 400, 'bad_request', '不能删自己');
    }
    if (!ctx.users.deleteUser(id)) return jsonError(c, 404, 'not_found', `没有这个用户：${id}`);
    // 账号没了，它的配置缓存也就不该留着 —— 下次同名? 不会同名（id 是随机的），
    // 但缓存里攒着已删用户的配置没有意义
    return c.body(null, 204);
  });

  /** 管理员重置别人的口令。传 `password: null` 表示清掉口令（此后只能靠管理员代管） */
  app.post('/api/users/:id/password', async (c) => {
    const id = c.req.param('id');
    const body = await readJsonObject(c);
    if (body === null) return jsonError(c, 400, 'bad_request', '请求体必须是 JSON 对象');

    const next = body['password'];
    if (next !== null && (typeof next !== 'string' || !validPassword(next))) {
      return jsonError(c, 400, 'bad_request', `password 至少 ${MIN_PASSWORD_LENGTH} 位，或传 null 清空`);
    }
    const user = ctx.users.findUser(id);
    if (user === undefined) return jsonError(c, 404, 'not_found', `没有这个用户：${id}`);

    ctx.users.setPassword(id, next === null ? null : next);
    const updated = ctx.users.findUser(id) ?? user;
    return c.json({ user: publicUser(updated, identityOf(c).ownerId, 0) });
  });

  /** 升/降管理员。两档角色里唯一能改角色的地方 */
  app.post('/api/users/:id/role', async (c) => {
    const id = c.req.param('id');
    const body = await readJsonObject(c);
    if (body === null) return jsonError(c, 400, 'bad_request', '请求体必须是 JSON 对象');
    if (typeof body['isAdmin'] !== 'boolean') {
      return jsonError(c, 400, 'bad_request', 'isAdmin 必须是布尔值');
    }
    if (id === ADMIN_ID) {
      return jsonError(c, 400, 'bad_request', '内置管理员的角色不能改');
    }
    const user = ctx.users.findUser(id);
    if (user === undefined) return jsonError(c, 404, 'not_found', `没有这个用户：${id}`);
    if (id === identityOf(c).ownerId && body['isAdmin'] === false) {
      return jsonError(c, 400, 'bad_request', '不能把自己降成普通用户（会把自己锁在外面）');
    }

    ctx.users.setAdmin(id, body['isAdmin']);
    const updated = ctx.users.findUser(id) ?? user;
    return c.json({ user: publicUser(updated, identityOf(c).ownerId, 0) });
  });
}
