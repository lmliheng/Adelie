// 身份：一次请求「是谁」，以及每一条路由要求什么身份。
//
// 三条进门的路，按优先级：
//   1. `adelie_session` Cookie（浏览器与 PWA；HttpOnly，脚本读不到）
//   2. `Authorization: Bearer <token>`：主机 token（桌面壳 / CLI / 自动化）或用户的登录令牌
//   3. **回环地址且没有配 token ⇒ 主机本人（管理员）**
//
// 第 3 条是刻意的，也是这套设计里唯一的公理：**能读到 `~/.adelie` 的人就是管理员**。
// 桌面壳的窗口、`adelie serve` 后本机浏览器打开的那一页，走的都是它 —— 于是单机用户
// 永远不需要看到登录界面。它同时意味着：多操作系统用户的机器上，别人的浏览器也能
// 访问这个回环端口（v0.1.0 就是这样）。要关掉这条路，设 `ADELIE_TOKEN` 即可，
// 那时所有请求（包括本机）都必须带凭证。
//
// 权限表是**数据**：路由前缀 → 要求。判定只在一个中间件里，不散在各 handler 的
// `if (user.isAdmin)` 中 —— 散开之后，加一条路由忘了加判断就是一次越权。

import { getCookie, setCookie } from 'hono/cookie';

import { isLoopbackRequest, presentedToken } from './auth.js';
import { ADMIN_ID } from './users/db.js';

import type { Context, MiddlewareHandler } from 'hono';
import type { UserRow, UserStore } from './users/db.js';

export const SESSION_COOKIE = 'adelie_session';

/** 登录态在浏览器里的存活时间，与库里的一致（30 天） */
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface Identity {
  /** 走到这一步了没有。匿名也要有一个 Identity，免得处处判 null */
  authenticated: boolean;
  /** `host` = 本机无凭证进来的管理员本人；`user` = 某个账号 */
  kind: 'host' | 'user';
  isAdmin: boolean;
  /** 给人看的名字：`host` 或用户名 */
  label: string;
  /** 主机身份没有用户行（它不对应任何账号） */
  user: UserRow | null;
  /**
   * 每用户数据的键：`host` 或用户 id。
   *
   * 密钥文件、运行配置都按它分。刻意让主机身份用自己的键而不是内置 admin 的 id：
   * v0.1.0 的 `.env`、CLI 与桌面壳都在「主机」这条路上，把它们挪到某个账号名下
   * 会让升级上来的用户丢配置 —— 而丢配置比多一个键难看多了。
   */
  key: string;
  /** 会话归属的用户 id：主机身份记在内置 admin 名下（会话索引里每人都有主） */
  ownerId: string;
}

export type RouteAuth = 'none' | 'user' | 'admin';

/**
 * 路由前缀 → 要求。**最长前缀优先**。
 *
 * `none` 的三条各有理由：`health` 要能在未登录时探活；`login` 是取得身份的唯一入口；
 * `me` 匿名时必须可答（界面靠它决定显示登录页还是主界面），且它只回「匿名」不泄漏任何东西。
 */
const ROUTE_AUTH: readonly { prefix: string; auth: RouteAuth }[] = [
  { prefix: '/api/health', auth: 'none' },
  { prefix: '/api/auth/login', auth: 'none' },
  { prefix: '/api/auth/logout', auth: 'none' },
  { prefix: '/api/auth/me', auth: 'none' },
  { prefix: '/api/users', auth: 'admin' },
  { prefix: '/api/shutdown', auth: 'admin' },
  // 兜底：其余接口一律要求身份。默认拒绝而不是默认放行 —— 新增路由忘了登记时，
  // 结果是「要登录」而不是「对所有人敞开」。
  { prefix: '/api', auth: 'user' },
];

export function routeAuthOf(path: string): RouteAuth {
  let matched: { prefix: string; auth: RouteAuth } | null = null;
  for (const rule of ROUTE_AUTH) {
    if (!path.startsWith(rule.prefix)) continue;
    if (matched === null || rule.prefix.length > matched.prefix.length) matched = rule;
  }
  return matched?.auth ?? 'user';
}

export interface IdentityOptions {
  store: UserStore;
  /** 主机 token；null 表示这台机器上的回环请求不需要凭证 */
  token: string | null;
  /** 用户显式配了 token：那时回环也必须有凭证，第 3 条进门的路关闭 */
  alwaysRequireToken: boolean;
}

const ANONYMOUS: Identity = {
  authenticated: false,
  kind: 'host',
  isAdmin: false,
  label: 'anonymous',
  user: null,
  key: 'host',
  ownerId: ADMIN_ID,
};

function hostIdentity(): Identity {
  return {
    authenticated: true,
    kind: 'host',
    isAdmin: true,
    label: 'host',
    user: null,
    key: 'host',
    ownerId: ADMIN_ID,
  };
}

function userIdentity(user: UserRow): Identity {
  return {
    authenticated: true,
    kind: 'user',
    isAdmin: user.isAdmin,
    label: user.name,
    user,
    key: user.id,
    ownerId: user.id,
  };
}

/**
 * 这次请求是谁。
 *
 * Cookie 与 Bearer 都解析不出用户时**不报错**，而是继续往下一级回落 ——
 * 一个过期 Cookie 不该把本机用户挡在门外（他会看到登录界面，而不是被锁死）。
 */
export function resolveIdentity(c: Context, options: IdentityOptions): Identity {
  const cookie = getCookie(c, SESSION_COOKIE);
  if (cookie !== undefined && cookie !== '') {
    const user = options.store.resolveAuthSession(cookie);
    if (user !== undefined) return userIdentity(user);
  }

  const presented = presentedToken(c);
  if (presented !== null) {
    if (options.token !== null && presented === options.token) return hostIdentity();
    // 同一个 Bearer 头也接受用户的登录令牌：这样 CLI / 脚本不必先换成 Cookie
    const user = options.store.resolveAuthSession(presented);
    if (user !== undefined) return userIdentity(user);
  }

  if (!options.alwaysRequireToken && isLoopbackRequest(c)) return hostIdentity();
  return ANONYMOUS;
}

/** 登录成功后写 Cookie。`secure` 只能是 false：手机 PWA 连的是局域网 http */
export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(c: Context): void {
  setCookie(c, SESSION_COOKIE, '', { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 0 });
}

export interface AppEnv {
  Variables: {
    identity: Identity;
  };
}

/**
 * 身份中间件：解析一次，放在 `c.get('identity')`，并按权限表放行或拒绝。
 *
 * 未登录 → 401 `unauthorized`（契约里 401 的响应体是固定的，不给人读的 message）；
 * 已登录但权限不够 → 403 `admin_required`。两者必须分开：混成一个 401 会让界面
 * 把「你没权限」显示成「请重新登录」，用户会一直重登。
 */
export function createIdentityMiddleware(options: IdentityOptions): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const identity = resolveIdentity(c, options);
    c.set('identity', identity);

    const path = new URL(c.req.url).pathname;
    const required = routeAuthOf(path);

    // 这台机器显式配了 token ⇒ 连不需要身份的接口也要凭证（v0.1.0 的语义，
    // `ADELIE_TOKEN` 一设就整片 /api/* 都要它）。唯一的豁免是 /api/auth/*：
    // 那是取得身份的入口，堵上它等于把所有人锁在门外 —— 包括需要登录的用户。
    if (required === 'none') {
      if (options.alwaysRequireToken && !identity.authenticated && !authEntryPath(path)) {
        return c.json({ error: 'unauthorized' }, 401);
      }
      return next();
    }

    if (!identity.authenticated) return c.json({ error: 'unauthorized' }, 401);
    if (required === 'admin' && !identity.isAdmin) {
      return c.json({ error: 'admin_required', message: '这个操作需要管理员' }, 403);
    }
    return next();
  };
}

/** 取得身份的入口（登录 / 登出 / 我是谁 / 改口令）：配了 token 时也只有它们免凭证 */
function authEntryPath(path: string): boolean {
  return path === '/api/auth' || path.startsWith('/api/auth/');
}

/** handler 里取身份。没经过中间件的调用点（进程内直接调用）拿到的是匿名 */
export function identityOf(c: Context<AppEnv>): Identity {
  return c.get('identity');
}

export { ANONYMOUS as anonymousIdentity };
