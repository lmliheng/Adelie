// src/test/persistence/session-model.test.ts
//
// 会话头里的模型。
//
// 会话头是**一次写入**的：建它的时候用哪个模型记下来，后来的进程不许改写 ——
// 否则「会话头」就变成了「最后一轮用的模型」，而后者在事件流里已经有了
// （task_started.model）。这两个是不同的问题，别合并。
import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { SessionStore, readSessionMeta, sessionMetaFile } from 'adelie-core';

const WORKSPACE = '/tmp/adelie-ws';

describe('会话头里的模型', () => {
  let root = '';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'adelie-session-model-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function openStore(sessionId: string, model?: { provider: 'kimi'; model: string }) {
    return SessionStore.open(WORKSPACE, sessionId, {
      root,
      ...(model === undefined ? {} : { model }),
    });
  }

  it('建会话时记下模型，读回来还是它', () => {
    const store = openStore('20260101-000000-aaaaaa', { provider: 'kimi', model: 'kimi-latest' });
    store.append({ type: 'task_started', payload: { taskId: 't1', taskDescription: '你好', startTime: Date.now() } });

    expect(store.readMeta()?.model).toEqual({ provider: 'kimi', model: 'kimi-latest' });
    expect(readSessionMeta(WORKSPACE, store.sessionId, { root })?.model).toEqual({
      provider: 'kimi',
      model: 'kimi-latest',
    });
  });

  it('已有会话头不会被后来的进程改写（中途换模型也不改出生记录）', () => {
    const id = '20260101-000000-bbbbbb';
    openStore(id, { provider: 'kimi', model: 'kimi-latest' }).append({
      type: 'task_started',
      payload: { taskId: 't1', taskDescription: '第一轮', startTime: Date.now() },
    });

    // 换个模型（甚至换个家）再打开同一个会话
    const again = SessionStore.open(WORKSPACE, id, {
      root,
      model: { provider: 'qwen', model: 'qwen-max' },
    });
    again.append({ type: 'task_started', payload: { taskId: 't2', taskDescription: '第二轮', startTime: Date.now() } });

    expect(again.readMeta()?.model).toEqual({ provider: 'kimi', model: 'kimi-latest' });
  });

  it('不传模型就不写这个字段（0.1 建的会话头就是这样）', () => {
    const store = openStore('20260101-000000-cccccc');
    store.append({ type: 'task_started', payload: { taskId: 't1', taskDescription: 'x', startTime: Date.now() } });

    expect(store.readMeta()?.model).toBeUndefined();
    const raw = JSON.parse(readFileSync(sessionMetaFile(WORKSPACE, store.sessionId, root), 'utf8')) as Record<string, unknown>;
    expect('model' in raw).toBe(false);
  });

  it('手改坏的模型字段当「没有」，不把恢复带崩', () => {
    const id = '20260101-000000-dddddd';
    const store = openStore(id);
    store.append({ type: 'task_started', payload: { taskId: 't1', taskDescription: 'x', startTime: Date.now() } });

    const file = sessionMetaFile(WORKSPACE, id, root);
    const meta = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    meta['model'] = { provider: 'moonshot', model: 'kimi-latest' }; // 提供方 id 是错的
    writeFileSync(file, JSON.stringify(meta), 'utf8');

    const read = readSessionMeta(WORKSPACE, id, { root });
    expect(read).not.toBeNull();
    expect(read?.model).toBeUndefined();
    expect(read?.sessionId).toBe(id);
  });
});
