// 集成测试用的脚手架：临时工作区 + 临时会话根 + 真实的 http 服务 + 假 provider 队列。
//
// 刻意不起真实模型、不写用户家目录：测试必须能独立跑，也不该碰到开发机上的
// 真实会话与密钥。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { serve } from '@hono/node-server';

import { createApp } from '../src/app.js';
import { ScriptedProvider, planDecision } from './fake-provider.js';

import type { ServerType } from '@hono/node-server';
import type { ModelDecision } from 'adelie-core';

export interface Harness {
  workspace: string;
  sessionsRoot: string;
  /** 服务根地址，不带尾斜杠 */
  base: string;
  /** 排下一轮对话要用的脚本：规划轮自动补上 */
  script(...decisions: ModelDecision[]): ScriptedProvider;
  post(path: string, body?: unknown): Promise<Response>;
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
  writeFileSync(join(workspace, 'README.md'), '# hello\n测试用工作区\n', 'utf8');

  const scripts: ScriptedProvider[] = [];

  const app = createApp({
    workspace,
    sessionsRoot,
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

    script(...decisions: ModelDecision[]): ScriptedProvider {
      const provider = new ScriptedProvider([planDecision(), ...decisions]);
      scripts.push(provider);
      return provider;
    },

    post(path: string, body?: unknown): Promise<Response> {
      return fetch(`${running.base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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
