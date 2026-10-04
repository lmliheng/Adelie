// 认证（契约 §0）与优雅关闭（契约外，桌面壳需要）。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startHarness, type Harness } from './harness.js';
import { startServer } from '../src/index.js';
import { ScriptedProvider } from './fake-provider.js';

describe('认证', () => {
  const token = 'test-token-abc';
  let harness: Harness;

  beforeAll(async () => {
    harness = await startHarness({ token });
  });

  afterAll(async () => {
    await harness.dispose();
  });

  it('没有 token 回 401，且响应体恰好是 { error: "unauthorized" }', async () => {
    const res = await fetch(`${harness.base}/api/health`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('带上 Bearer token 或 ?token= 都能过', async () => {
    const header = await fetch(`${harness.base}/api/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(header.status).toBe(200);

    const query = await fetch(`${harness.base}/api/health?token=${token}`);
    expect(query.status).toBe(200);

    const wrong = await fetch(`${harness.base}/api/health`, {
      headers: { Authorization: 'Bearer nope' },
    });
    expect(wrong.status).toBe(401);
  });
});

describe('优雅关闭', () => {
  it('POST /api/shutdown 先回 202，随后端口关闭', async () => {
    // 临时目录：这条用例不该在真实工作区或家目录里留下任何东西
    const workspace = mkdtempSync(join(tmpdir(), 'adelie-shutdown-ws-'));
    const sessionsRoot = mkdtempSync(join(tmpdir(), 'adelie-shutdown-sessions-'));

    // 走 startServer 而不是裸 serve：关闭这条链（onShutdown → 关 http server）
    // 正是桌面壳要用的那条，测试就得覆盖它。
    const started = await startServer({
      workspace,
      sessionsRoot,
      loadUserEnv: false,
      port: 0,
      hostname: '127.0.0.1',
      token: null,
      createProvider: () => new ScriptedProvider([]),
    });

    try {
      const res = await fetch(`${started.url}api/shutdown`, { method: 'POST' });
      expect(res.status).toBe(202);
      expect(await res.json()).toEqual({ ok: true });

      await waitForPortClosed(started.url);
    } finally {
      await started.close().catch(() => undefined);
      rmSync(workspace, { recursive: true, force: true });
      rmSync(sessionsRoot, { recursive: true, force: true });
    }
  });
});

/** 轮询到端口真的拒连为止：POST /api/shutdown 是「先回响应再收摊」的 */
async function waitForPortClosed(url: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(`${url}api/health`);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('超时：端口没有关闭');
}
