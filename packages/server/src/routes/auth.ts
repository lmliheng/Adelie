// 登录 / 登出 / 我是谁 / 改口令（契约 §1）。
//
// 这几条是**唯一**能拿到身份的地方，所以它们自己不能要求身份（`login` 尤其）：
// 权限表在 identity.ts 里，这里的每一条都对应表里的一行。
import { getCookie } from 'hono/cookie';

import { presentedToken } from '../auth.js';
import { jsonError, readJsonObject } from '../http.js';
import { SESSION_COOKIE, clearSessionCookie, identityOf, setSessionCookie } from '../identity.js';

import type { Hono } from 'hono';
import type { AppEnv } from '../identity.js';
import type { ServerContext } from '../context.js';

/** 用户名的限制：够短、无空白、无控制字符。它是给人念的名字，不是标识（标识是 id） */
const NAME_PATTERN = /^[\p{L}\p{N}_.-]{1,32}$/u;

/** 口令下限。6 位挡不住暴力破解，但挡住的是「1234」这类口令，且不让人被长度逼疯 */
export const MIN_PASSWORD_LENGTH = 6;

export function validUserName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

export function validPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= 256;
}

function publicUser(user: { id: string; name: string; isAdmin: boolean; hasPassword: boolean }, selfId: string): Record<string, unknown> {
  return {
    id: user.id,
    name: user.name,
    isAdmin: user.isAdmin,
    hasPassword: user.hasPassword,
    isSelf: user.id === selfId,
  };
}

export function registerAuthRoutes(app: Hono<AppEnv>, ctx: ServerContext): void {
  app.get('/api/auth/me', (c) => {
    const identity = identityOf(c);
    // 匿名不是错误：界面靠这条决定显示登录页还是主界面，所以它必须能匿名调用。
    // 未登录时**不**回 401 —— 那会让界面的「探活」变成一次报错日志。
    return c.json({
      authenticated: identity.authenticated,
      ...(identity.authenticated
        ? {
            user: {
              kind: identity.kind,
              name: identity.label,
              isAdmin: identity.isAdmin,
              id: identity.user?.id ?? null,
              hasPassword: identity.kind === 'host' ? true : (identity.user?.hasPassword ?? false),
            },
          }
        : {}),
    });
  });

  app.post('/api/auth/login', async (c) => {
    const body = await readJsonObject(c);
    if (body === null) return jsonError(c, 400, 'bad_request', '请求体必须是 JSON 对象');

    const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
    const password = typeof body['password'] === 'string' ? body['password'] : '';
    if (name === '' || password === '') {
      return jsonError(c, 400, 'bad_request', 'name 与 password 都必须是非空字符串');
    }

    const user = ctx.users.authenticate(name, password);
    // 用户不存在与口令不对返回同一个 401：区分开就等于送给对方一个账号枚举器
    if (user === null) return jsonError(c, 401, 'unauthorized', '用户名或口令不对');

    const { token } = ctx.users.createAuthSession(user.id);
    setSessionCookie(c, token);
    return c.json({ user: publicUser(user, user.id) });
  });

  app.post('/api/auth/logout', (c) => {
    // 登出要连 Bearer 那一份一起作废：同一个令牌既能当 Cookie 也能当 Bearer，
    // 只清 Cookie 等于「退出登录」之后令牌还活着
    for (const presented of [getCookie(c, SESSION_COOKIE), presentedToken(c)]) {
      if (presented !== undefined && presented !== null && presented !== '') {
        ctx.users.deleteAuthSession(presented);
      }
    }
    clearSessionCookie(c);
    return c.body(null, 204);
  });

  /**
   * 改自己的口令。
   *
   * 非管理员也能用（`/api/users/:id/password` 是管理员专用）。要求输入原口令 ——
   * 除非账号本来就没有口令（内置 admin 与管理员新建的账号），那种情况下「本机身份」
   * 或「刚被管理员创建」已经是全部的凭证了，再要一个不存在的原口令就没法往下走。
   */
  app.post('/api/auth/password', async (c) => {
    const identity = identityOf(c);
    const body = await readJsonObject(c);
    if (body === null) return jsonError(c, 400, 'bad_request', '请求体必须是 JSON 对象');

    const target = identity.kind === 'host' ? ctx.users.findUser('admin') : identity.user;
    if (target === undefined || target === null) {
      return jsonError(c, 400, 'bad_request', '主机身份请通过 用户管理 改口令');
    }

    const next = body['password'];
    if (next !== null && (typeof next !== 'string' || (next !== '' && !validPassword(next)))) {
      return jsonError(c, 400, 'bad_request', `password 至少 ${MIN_PASSWORD_LENGTH} 位`);
    }

    if (target.hasPassword) {
      const current = body['current'];
      if (typeof current !== 'string' || ctx.users.authenticate(target.name, current) === null) {
        return jsonError(c, 403, 'forbidden', '原口令不对');
      }
    }

    ctx.users.setPassword(target.id, next === null || next === '' ? null : next);
    return c.json({ user: publicUser(target, target.id) });
  });
}
