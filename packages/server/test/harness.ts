// 集成测试用的脚手架：临时工作区 + 临时会话根 + 真实的 http 服务 + 假 provider 队列。
//
// 刻意不起真实模型、不写用户家目录：测试必须能独立跑，也不该碰到开发机上的
// 真实会话与密钥。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { serve } from '@hono/node-server';

import { createApp } from '../src/app.js';
import { UserStore } from '../src/users/db.js';
import { ScriptedProvider } from './fake-provider.js';

import type { ServerType } from '@hono/node-server';
import type { ModelDecision } from 'adelie-core';

export interface Harness {
  workspace: string;
  sessionsRoot: string;
  /** 服务根地址，不带尾斜杠 */
  base: string;
  /** 排下一轮对话要用的脚本：规划轮自动补上 */
  script(...decisions: ModelDecision[]): ScriptedProvider;
  post(path: string, body?: unknown, init?: RequestInit): Promise<Response>;
  /** 带 Cookie 的 GET（P3 的所有权用例要用它） */
  get(path: string, init?: RequestInit): Promise<Response>;
  /** 用口令登录，返回可直接放进 `Cookie` 头的字符串 */
  login(name: string, password: string): Promise<string>;
  /** 以某个身份建一个账号（只有管理员能成功） */
  createUser(name: string, password: string, init?: RequestInit, isAdmin?: boolean): Promise<Response>;
  /** 直接拿到用户库：有些断言（过期、归属）看着数据说比看着响应说更直接 */
  users: UserStore;
  dispose(): Promise<void>;
}

async function startApp(app: ReturnType<typeof createApp>): Promise<{ server: ServerType; base: string }> {
  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
      resolve({ server, base: `http://127.0.0.1:${info.port}` });
    });
  });
}

export async function startHarness(options: { token?: string | null } = {}): Promise<Harness> {
  const workspace = mkdtempSync(join(tmpdir(), 'adelie-server-ws-'));
  const sessionsRoot = mkdtempSync(join(tmpdir(), 'adelie-server-sessions-'));
  // 用户库也要隔离：默认位置是 ~/.adelie/adelie.db，多个测试文件同时开它只会撞锁，
  // 而且那是在往开发机的真实数据里写测试用户
  const dbFile = join(mkdtempSync(join(tmpdir(), 'adelie-server-db-')), 'adelie.db');
  const users = new UserStore(dbFile);
  writeFileSync(join(workspace, 'README.md'), '# hello\n测试用工作区\n', 'utf8');

  const scripts: ScriptedProvider[] = [];

  const app = createApp({
    workspace,
    sessionsRoot,
    users,
    loadUserEnv: false,
    version: '0.1.0',
    ...(options.token !== undefined ? { token: options.token } : {}),
    createProvider: () => scripts.shift() ?? new ScriptedProvider([]),
  });

  const running = await startApp(app);

  return {
    workspace,
    sessionsRoot,
    base: running.base,
    users,

    script(...decisions: ModelDecision[]): ScriptedProvider {
      const provider = new ScriptedProvider([...decisions]);
      scripts.push(provider);
      return provider;
    },

    post(path: string, body?: unknown, init?: RequestInit): Promise<Response> {
      return fetch(`${running.base}${path}`, {
        method: 'POST',
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    },

    get(path: string, init?: RequestInit): Promise<Response> {
      return fetch(`${running.base}${path}`, { ...init });
    },

    async login(name: string, password: string): Promise<string> {
      const res = await fetch(`${running.base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      });
      if (!res.ok) throw new Error(`登录失败：${res.status}`);
      // 只取 cookie 的 name=value 部分：Set-Cookie 里还有 HttpOnly/SameSite 等属性
      const raw = res.headers.getSetCookie().find((line) => line.startsWith('adelie_session='));
      if (raw === undefined) throw new Error('登录响应里没有会话 Cookie');
      return raw.split(';')[0]!;
    },

    async createUser(name: string, password: string, init?: RequestInit, isAdmin = false): Promise<Response> {
      return fetch(`${running.base}/api/users`, {
        method: 'POST',
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
        body: JSON.stringify({ name, password, isAdmin }),
      });
    },

    async dispose(): Promise<void> {
      await new Promise<void>((done) => {
        (running.server as { closeAllConnections?: () => void }).closeAllConnections?.();
        running.server.close(() => done());
      });
      rmSync(workspace, { recursive: true, force: true });
      rmSync(sessionsRoot, { recursive: true, force: true });
    },
  };
}

/** 建一条会话并拿到它的 id */
export async function createSession(harness: Harness): Promise<string> {
  const res = await harness.post('/api/sessions');
  const body = await res.json() as { session: Record<string, unknown> };
  return body.session['id'] as string;
}
