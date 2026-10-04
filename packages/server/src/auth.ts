// 认证：单用户、本机优先，没有账号体系（契约 §0）。
//
// 判据只有两条：请求是不是从回环地址来的，以及 token 有没有被显式设置。
// 这里刻意不引入会话 cookie / 登录态 —— 客户端是同一台机器上的浏览器或桌面壳，
// 跨机的那个场景（手机 PWA）由契约里的「带 token 的 URL」覆盖。
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context, MiddlewareHandler } from 'hono';

export function isLoopbackAddress(address: string | null | undefined): boolean {
  if (address === null || address === undefined || address === '') return false;
  if (address === '::1') return true;
  // IPv4-mapped IPv6：Node 在双栈监听时会把 127.0.0.1 报成这个形状
  if (address === '::ffff:127.0.0.1') return true;
  return /^127\./.test(address);
}

/**
 * 请求的来源地址。
 *
 * 拿不到连接信息时返回 null：进程内直接调用 `app.fetch`（桌面壳的用法）没有
 * socket，那不是「来自外部」，只是问不出来。
 */
export function remoteAddress(c: Context): string | null {
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}

/**
 * 是否按「本机请求」处理。
 *
 * 问不出地址时按本机处理（见上）：把本机调用挡在外面是实打实的功能故障，
 * 而漏判一次远程请求的前提是它先绕过了 node-server 的适配层 —— 那条路不存在。
 */
export function isLoopbackRequest(c: Context): boolean {
  const address = remoteAddress(c);
  return address === null ? true : isLoopbackAddress(address);
}

export interface AuthOptions {
  /** 配置的 token；null 表示没配置 */
  token: string | null;
  /**
   * 是否对所有请求都要求 token。
   *
   * 只在 `ADELIE_TOKEN` 被显式设置时为 true：那时用户的意图是「这个服务要凭证」，
   * 即便当前监听在回环上。没显式设置时，回环请求一律放行 —— 桌面壳与
   * 本机浏览器走的正是这条路，逐个带 token 只会凭空多一道配置。
   */
  alwaysRequireToken: boolean;
}

/** `Authorization: Bearer <token>` 或 `?token=<token>`（后者给手机 PWA 用） */
export function presentedToken(c: Context): string | null {
  const header = c.req.header('Authorization');
  if (header !== undefined) {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match?.[1] !== undefined) return match[1].trim();
  }
  const query = c.req.query('token');
  return query !== undefined && query !== '' ? query : null;
}

export function createAuthMiddleware(options: AuthOptions): MiddlewareHandler {
  return async (c, next) => {
    if (isLoopbackRequest(c) && !options.alwaysRequireToken) {
      return next();
    }

    const expected = options.token;
    const presented = presentedToken(c);
    if (expected !== null && presented !== null && presented === expected) {
      return next();
    }

    // 401 的响应体契约里是「固定」的，所以这里不走 jsonError 的通用形状
    return c.json({ error: 'unauthorized' }, 401);
  };
}
