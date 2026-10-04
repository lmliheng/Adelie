// 静态托管与回环判定（契约 §6、§0）。
//
// 这里走 Hono 的 `app.request()`，不起真实端口：这两块不依赖网络。
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApp } from '../src/app.js';
import { isLoopbackAddress } from '../src/auth.js';
import { resolveWebDist } from '../src/static.js';
import { ScriptedProvider } from './fake-provider.js';

const INDEX_HTML = '<!doctype html><html><body>adelie web</body></html>\n';

describe('静态托管', () => {
  let dist = '';
  let workspace = '';
  let sessionsRoot = '';

  beforeAll(() => {
    dist = mkdtempSync(join(tmpdir(), 'adelie-web-dist-'));
    writeFileSync(join(dist, 'index.html'), INDEX_HTML, 'utf8');
    writeFileSync(join(dist, 'app.js'), 'console.log(1)\n', 'utf8');
    workspace = mkdtempSync(join(tmpdir(), 'adelie-static-ws-'));
    sessionsRoot = mkdtempSync(join(tmpdir(), 'adelie-static-sessions-'));
  });

  afterAll(() => {
    rmSync(dist, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
    rmSync(sessionsRoot, { recursive: true, force: true });
  });

  const appWith = (webDist: string | null) => createApp({
    workspace,
    sessionsRoot,
    loadUserEnv: false,
    webDist,
    createProvider: () => new ScriptedProvider([]),
  });

  it('有产物时：/ 回 index.html，资源带正确的 Content-Type', async () => {
    const app = appWith(dist);

    const root = await app.request('/');
    expect(root.status).toBe(200);
    expect(await root.text()).toBe(INDEX_HTML);

    const asset = await app.request('/app.js');
    expect(asset.status).toBe(200);
    expect(asset.headers.get('Content-Type')).toContain('text/javascript');
  });

  it('有产物时：无扩展名的路径回落 index.html（SPA 路由）', async () => {
    const app = appWith(dist);
    const res = await app.request('/sessions/abc', { headers: { Accept: 'text/html' } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(INDEX_HTML);
  });

  it('有产物时：找不到的资源是 404，不回落成 HTML', async () => {
    const app = appWith(dist);
    const res = await app.request('/nope.js');
    expect(res.status).toBe(404);
    expect(((await res.json()) as Record<string, unknown>)['error']).toBe('not_found');
  });

  it('有产物时：路径穿越被挡住', async () => {
    const app = appWith(dist);
    const res = await app.request('/..%2f..%2fetc%2fpasswd');
    expect(res.status).toBe(404);
  });

  it('没有产物时：/ 回说明页（200）而 /api/* 照常工作', async () => {
    // 显式指到一个不存在的目录：这样不依赖仓库里 packages/web/dist 有没有构建过
    // （它不该决定这条用例的成败）。显式给错不回退到默认位置，这正是要测的规矩。
    const app = appWith('/nonexistent/adelie-web-dist');

    const root = await app.request('/');
    expect(root.status).toBe(200);
    expect(await root.text()).toContain('Adelie 后端已就绪');

    const health = await app.request('/api/health');
    expect(health.status).toBe(200);
    expect(((await health.json()) as Record<string, unknown>)['ok']).toBe(true);
  });
  it('默认查找位置指向 packages/web/dist', () => {
    // 有没有构建过都算通过：这里验的是「查哪儿」，不是「查到了没有」
    const resolved = resolveWebDist(null);
    if (resolved !== null) {
      expect(resolved.endsWith(join('web', 'dist'))).toBe(true);
    }
    // 显式给一个不存在的目录 → 当作没有前端，不回退
    expect(resolveWebDist('/nonexistent/adelie-web-dist')).toBeNull();
  });
});

describe('回环地址判定', () => {
  it('认得本机地址，不认局域网地址', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('127.0.0.53')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);

    expect(isLoopbackAddress('192.168.1.5')).toBe(false);
    expect(isLoopbackAddress('10.0.0.1')).toBe(false);
    expect(isLoopbackAddress('::ffff:192.168.1.5')).toBe(false);
    expect(isLoopbackAddress(null)).toBe(false);
    expect(isLoopbackAddress('')).toBe(false);
  });
});
