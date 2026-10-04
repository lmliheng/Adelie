// P3：用户、两档角色、会话归属（契约 §1、§2、§3）。
//
// 这些用例覆盖的是**权限**，所以每条都从「另一个人」的视角发请求：
// 拿 B 的 Cookie 去读 A 的会话、用非管理员去改密钥、把回环身份与登录身份摆在一起
// 看谁说了算。权限出事从来不是因为代码路径跑不到，而是因为某条路径没被这么试过。
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SessionStore, workspaceHash } from 'adelie-core';

import { rootForOwner } from '../src/context.js';
import { startHarness, type Harness } from './harness.js';

/** 带 Cookie 的 JSON PATCH */
function patch(harness: Harness, path: string, body: unknown, cookie?: string): Promise<Response> {
  return fetch(`${harness.base}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie === undefined ? {} : { Cookie: cookie }),
    },
    body: JSON.stringify(body),
  });
}

function authed(harness: Harness, path: string, cookie: string): Promise<Response> {
  return fetch(`${harness.base}${path}`, { headers: { Cookie: cookie } });
}

describe('用户与角色', () => {
  let harness: Harness;
  let alice: string;
  let bob: string;

  beforeAll(async () => {
    harness = await startHarness();

    // 本机管理员（回环、无凭证）建两个普通用户
    const created = await harness.createUser('alice', 'alice-pw');
    expect(created.status).toBe(201);
    expect((await harness.createUser('bob', 'bob-pw')).status).toBe(201);

    alice = await harness.login('alice', 'alice-pw');
    bob = await harness.login('bob', 'bob-pw');
  });

  afterAll(async () => {
    await harness.dispose();
  });

  it('回环无凭证就是管理员（桌面壳因此不需要登录界面）', async () => {
    const me = await fetch(`${harness.base}/api/auth/me`).then((res) => res.json()) as {
      authenticated: boolean;
      user?: { kind: string; isAdmin: boolean };
    };
    expect(me.authenticated).toBe(true);
    expect(me.user?.kind).toBe('host');
    expect(me.user?.isAdmin).toBe(true);
  });

  it('口令不对与用户不存在都是 401，响应体不区分这两件事', async () => {
    const wrong = await fetch(`${harness.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'alice', password: 'nope' }),
    });
    expect(wrong.status).toBe(401);

    const missing = await fetch(`${harness.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'nobody', password: 'whatever' }),
    });
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual(await wrong.json());
  });

  it('登录后的 Cookie 压过「回环即管理员」：非管理员就是非管理员', async () => {
    const me = await authed(harness, '/api/auth/me', alice).then((res) => res.json()) as {
      user: { name: string; isAdmin: boolean };
    };
    expect(me.user.name).toBe('alice');
    // 这条是关键：请求明明来自回环，但带了 alice 的 Cookie，就不该被当成主机本人
    expect(me.user.isAdmin).toBe(false);
  });

  it('非管理员改密钥 / 端点 / 提供方 / 工作区都是 403 admin_required', async () => {
    const key = await patch(harness, '/api/config', { apiKey: 'sk-should-not-land' }, alice);
    expect(key.status).toBe(403);
    expect((await key.json() as { error: string }).error).toBe('admin_required');

    const base = await patch(harness, '/api/config', { baseUrl: 'https://evil.example/v1' }, alice);
    expect(base.status).toBe(403);

    const provider = await patch(harness, '/api/config', { model: { provider: 'kimi' } }, alice);
    expect(provider.status).toBe(403);

    const workspace = await patch(harness, '/api/config', { workspace: '/tmp' }, alice);
    expect(workspace.status).toBe(403);
  });

  it('非管理员能改自己的模型名与预算（「选模型」两档一致）', async () => {
    const model = await patch(harness, '/api/config', { model: 'deepseek-reasoner' }, alice);
    expect(model.status).toBe(200);
    expect((await model.json() as { model: { provider: string; model: string } }).model).toEqual({
      provider: 'deepseek',
      model: 'deepseek-reasoner',
    });

    const limits = await patch(harness, '/api/config', { maxIterations: 7 }, bob);
    expect(limits.status).toBe(200);
  });

  it('两个用户互看不见对方的会话', async () => {
    const a = await harness.post('/api/sessions', {}, { headers: { Cookie: alice } })
      .then((res) => res.json()) as { session: { id: string } };

    // Bob 的列表里没有 Alice 的会话
    const bobList = await authed(harness, '/api/sessions', bob).then((res) => res.json()) as {
      sessions: { id: string }[];
    };
    expect(bobList.sessions.map((item) => item.id)).not.toContain(a.session.id);

    // Bob 直接拿 id 去读也读不到 —— 而且是 404 而不是 403（403 等于确认它存在）
    const direct = await authed(harness, `/api/sessions/${a.session.id}`, bob);
    expect(direct.status).toBe(404);

    // 发消息、导出、取消、审批这几条路同样读不到
    const message = await harness.post(`/api/sessions/${a.session.id}/messages`, { text: 'hi' }, {
      headers: { Cookie: bob },
    });
    expect(message.status).toBe(404);
    expect((await authed(harness, `/api/sessions/${a.session.id}/markdown`, bob)).status).toBe(404);

    // Alice 自己看得见
    expect((await authed(harness, `/api/sessions/${a.session.id}`, alice)).status).toBe(200);
  });

  it('非管理员的会话落在自己的分区里，管理员能看见并带 owner', async () => {
    const a = await harness.post('/api/sessions', {}, { headers: { Cookie: alice } })
      .then((res) => res.json()) as { session: { id: string } };
    const aliceId = harness.users.findUserByName('alice')!.id;

    // 索引里的主人是 alice，不是「当前请求是谁」
    expect(harness.users.sessionOwner(a.session.id)?.userId).toBe(aliceId);

    // 磁盘分区也按人分：空会话还不落盘（SessionStore 是懒建的），所以这里补一条事件，
    // 用的是服务端算出来的那个根（rootForOwner 是它对外的口径）
    const root = rootForOwner(harness.sessionsRoot, aliceId)!;
    new SessionStore(harness.workspace, a.session.id, { root }).append({
      type: 'task_started',
      payload: { taskId: 't1', taskDescription: 'alice 的会话', startTime: Date.now() },
    });
    // 同一条会话在两个根下的位置：自己的分区里有，公共根里没有（workspaceHash 自带 `ws-` 前缀）
    const partition = workspaceHash(harness.workspace);
    expect(existsSync(join(root, partition, 'sessions', a.session.id))).toBe(true);
    expect(existsSync(join(harness.sessionsRoot, partition, 'sessions', a.session.id))).toBe(false);

    // Alice 自己看得见；Bob 的列表里没有
    const aliceList = await authed(harness, '/api/sessions', alice).then((res) => res.json()) as {
      sessions: { id: string; owner?: unknown }[];
    };
    expect(aliceList.sessions.map((item) => item.id)).toContain(a.session.id);
    // 看自己的会话时不带 owner（界面因此不必判断）
    expect(aliceList.sessions[0]?.owner).toBeUndefined();

    const bobList = await authed(harness, '/api/sessions', bob).then((res) => res.json()) as {
      sessions: { id: string }[];
    };
    expect(bobList.sessions.map((item) => item.id)).not.toContain(a.session.id);

    // 管理员用 scope=all 看全部：别人的会话带 owner
    const all = await fetch(`${harness.base}/api/sessions?scope=all`).then((res) => res.json()) as {
      sessions: { id: string; owner?: { name: string } }[];
    };
    expect(all.sessions.find((item) => item.id === a.session.id)?.owner?.name).toBe('alice');
  });

  it('管理员能删别人的会话，普通用户删不掉', async () => {
    const made = await harness.post('/api/sessions', {}, { headers: { Cookie: alice } })
      .then((res) => res.json()) as { session: { id: string } };

    const byBob = await fetch(`${harness.base}/api/sessions/${made.session.id}`, {
      method: 'DELETE',
      headers: { Cookie: bob },
    });
    expect(byBob.status).toBe(404);

    const byAdmin = await fetch(`${harness.base}/api/sessions/${made.session.id}`, { method: 'DELETE' });
    expect(byAdmin.status).toBe(204);
  });
});

describe('用户管理', () => {
  let harness: Harness;
  let carol: string;

  beforeAll(async () => {
    harness = await startHarness();
    await harness.createUser('carol', 'carol-pw');
    carol = await harness.login('carol', 'carol-pw');
  });

  afterAll(async () => {
    await harness.dispose();
  });

  it('非管理员调用户管理整片 403', async () => {
    expect((await authed(harness, '/api/users', carol)).status).toBe(403);
    const created = await harness.createUser('nope', 'pw-123456', { headers: { Cookie: carol } });
    expect(created.status).toBe(403);
  });

  it('管理员能列号、建号、改口令、改角色，但删不掉内置 admin', async () => {
    const list = await fetch(`${harness.base}/api/users`).then((res) => res.json()) as {
      users: { id: string; name: string; isAdmin: boolean; hasPassword: boolean }[];
    };
    expect(list.users[0]?.id).toBe('admin');
    // 内置 admin 初始没有口令：它靠「本机就是管理员」进门
    expect(list.users[0]?.hasPassword).toBe(false);
    expect(list.users.map((user) => user.name)).toContain('carol');

    const created = await fetch(`${harness.base}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'dave', password: 'dave-pw', isAdmin: true }),
    });
    expect(created.status).toBe(201);
    const dave = (await created.json() as { user: { id: string } }).user.id;

    const role = await fetch(`${harness.base}/api/users/${dave}/role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAdmin: false }),
    });
    expect(role.status).toBe(200);
    expect((await role.json() as { user: { isAdmin: boolean } }).user.isAdmin).toBe(false);

    const reset = await fetch(`${harness.base}/api/users/${dave}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'new-pw-123' }),
    });
    expect(reset.status).toBe(200);

    expect((await fetch(`${harness.base}/api/users/admin`, { method: 'DELETE' })).status).toBe(400);
    expect((await fetch(`${harness.base}/api/users/${dave}`, { method: 'DELETE' })).status).toBe(204);
  });

  it('同名会被挡下，用户名形状不对也会被挡下', async () => {
    const dup = await harness.createUser('carol', 'whatever-1');
    expect(dup.status).toBe(409);

    const bad = await harness.createUser('a b', 'whatever-1');
    expect(bad.status).toBe(400);
  });

  it('登录令牌过期后不再认，且过期的 Cookie 不会把人挡在门外', async () => {
    const store = harness.users;
    const carolUser = store.findUserByName('carol')!;

    // 发一个 31 天前就该过期的登录态（30 天有效期）：过期判定只跟现在比
    const stale = store.createAuthSession(carolUser.id, Date.now() - 31 * 24 * 60 * 60 * 1000);
    expect(store.resolveAuthSession(stale.token)).toBeUndefined();

    const fresh = store.createAuthSession(carolUser.id);
    expect(store.resolveAuthSession(fresh.token)?.name).toBe('carol');

    // 带着过期 Cookie 的请求不报错：它只是不算数，接着按回环身份处理（本机管理员）。
    // 这条正是「过期不该把人锁死」——手机上放久了再打开，不该看到一片 401。
    const res = await fetch(`${harness.base}/api/config`, {
      headers: { Cookie: `adelie_session=${stale.token}` },
    });
    expect(res.status).toBe(200);
  });
});
