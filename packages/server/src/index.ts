// 服务端的程序化入口：桌面壳可以 import 它，也可以直接跑 dist/main.js。
export { createApp } from './app.js';
export { createServerContext, isDirectory } from './context.js';
export type { AppDeps, AppSettings, LocatedSession, ServerContext } from './context.js';

export { isLoopbackAddress, isLoopbackRequest } from './auth.js';
export type { ProviderFactory, ProviderRequest } from './turn.js';
export type { SessionView } from './sessions.js';

import { randomBytes } from 'node:crypto';

import { serve } from '@hono/node-server';

import { createApp } from './app.js';
import { isLoopbackAddress } from './auth.js';

import type { ServerType } from '@hono/node-server';
import type { Hono } from 'hono';
import type { AppDeps } from './context.js';

export interface StartServerOptions extends AppDeps {
  /** 监听端口；0 表示由系统分配。默认取 PORT，再退回 7370 */
  port?: number;
  /** 监听地址；默认取 ADELIE_HOST，再退回 127.0.0.1 */
  hostname?: string;
}

export interface StartedServer {
  app: Hono;
  server: ServerType;
  hostname: string;
  port: number;
  /** 生效的 token；null 表示「只允许回环访问且不需要凭证」 */
  token: string | null;
  /** 给人用的地址；有 token 时已带上 `?token=` */
  url: string;
  /** 停止接收新连接，并等现有连接结束 */
  close(): Promise<void>;
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '0:0:0:0:0:0:0:1' ||
    isLoopbackAddress(normalized)
  );
}

function parsePort(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= 65535 ? value : null;
}

/**
 * 决定这次启动用哪个 token。
 *
 * 绑到非回环却不给 token 时随机生成一个：`0.0.0.0` 上不设防等于把工作区和工具
 * 交给整个局域网。回环上则不必 —— 本机请求本来就放行，凭空要一个 token 只是
 * 多一道配置（除非用户显式设了 ADELIE_TOKEN，那时按用户的意图来）。
 */
function resolveToken(explicit: string | null, host: string): string | null {
  if (explicit !== null && explicit !== '') return explicit;
  return isLoopbackHost(host) ? null : randomBytes(24).toString('base64url');
}

export function serverUrl(host: string, port: number, token: string | null): string {
  const display = host.includes(':') ? `[${host}]` : host;
  const base = `http://${display}:${port}/`;
  return token === null ? base : `${base}?token=${encodeURIComponent(token)}`;
}

/**
 * 起一个后端。
 *
 * 返回的 `close()` 只负责关 http server；「等在跑的 run 落盘」发生在 POST
 * /api/shutdown 的处理链里（见 app.ts），这里不再重复一遍。
 */
export function startServer(options: StartServerOptions = {}): Promise<StartedServer> {
  return new Promise<StartedServer>((resolve, reject) => {
    const { port, hostname, ...appDeps } = options;
    const host = hostname ?? process.env['ADELIE_HOST'] ?? '127.0.0.1';
    const listenPort = port ?? parsePort(process.env['PORT']) ?? 7370;
    // 显式传 null 表示「不要 token」（回环上就是没有凭证），与「没传」区分开：
    // 后者才回落到环境变量。
    const configured = appDeps.token !== undefined ? appDeps.token : (process.env['ADELIE_TOKEN'] ?? null);
    const token = resolveToken(configured, host);
    const webDist = appDeps.webDist ?? process.env['ADELIE_WEB_DIST'] ?? null;

    let server: ServerType | null = null;

    const close = (): Promise<void> =>
      new Promise<void>((done) => {
        const target = server;
        if (target === null) {
          done();
          return;
        }
        // keep-alive 连接会挡住 close()：先把闲着的那些收掉
        (target as { closeIdleConnections?: () => void }).closeIdleConnections?.();
        target.close(() => done());
      });

    const app = createApp({
      ...appDeps,
      host,
      token,
      webDist,
      onShutdown: async () => {
        await close();
        await appDeps.onShutdown?.();
      },
    });

    server = serve({ fetch: app.fetch, port: listenPort, hostname: host }, (info) => {
      const actualPort = typeof info === 'object' && info !== null && 'port' in info
        ? (info as { port: number }).port
        : listenPort;
      resolve({
        app,
        server: server as ServerType,
        hostname: host,
        port: actualPort,
        token,
        url: serverUrl(host, actualPort, token),
        close,
      });
    });

    // 端口被占用之类：让调用方拿到拒绝，而不是一个永远挂着的 Promise
    server.on('error', (error: Error) => reject(error));
  });
}
