// 会话的读侧：列表、详情、导出（契约 §3）。
//
// 事件的读写本身在 core 的 SessionStore / replaySession 里，这里只做「面向 HTTP
// 的形状」——列表项多出来的 workspace / taskCount / title 不在存储层，由事件流派生。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  SessionStore,
  deleteSession,
  isModelRef,
  isSessionId,
  listSessions,
  renderSessionMarkdown,
  replaySession,
  sessionsRoot,
} from 'adelie-core';

import type { Dirent } from 'node:fs';
import type {
  ModelRef,
  PriorRun,
  RestoredRun,
  SessionSummary,
  StoreLocationOptions,
  StoredSessionEvent,
  TaskStartedPayload,
} from 'adelie-core';
import type { SessionOwnerRow } from './users/db.js';

/** 契约里的会话对象。`id` 是 SessionStore 的 sessionId，这里换成契约字段名 */
export interface SessionView {
  id: string;
  workspace: string;
  createdAt: number;
  lastActiveAt: number;
  taskCount: number;
  title: string | null;
  /**
   * 这个会话**建的时候**用哪个模型（来自会话头），以及最近一轮**实际**用的哪个
   * （来自最后一条 task_started）。两者不一致，说明这个会话中途换过模型 ——
   * 列表里能看出来，比回头翻事件流省事。
   *
   * 老会话（0.1 建的）两者都没有，所以都是可选。
   */
  model?: ModelRef;
  lastModel?: ModelRef;
  /**
   * 会话的主人。**只有管理员看到别人的会话时才带**：看自己的会话时它是冗余的，
   * 而界面上多一个字段就要多一次判断。
   */
  owner?: { id: string; name: string };
}

/** 标题取首个任务的前若干字符：太长会把列表撑成一堆换行 */
const MAX_TITLE_CHARS = 80;

/** 已创建但还没写盘的空会话：POST 建完立刻 GET 也应当能拿到它 */
export class SessionRegistry {
  private readonly workspaces = new Map<string, string>();

  remember(sessionId: string, workspace: string): void {
    this.workspaces.set(sessionId, workspace);
  }

  workspaceOf(sessionId: string): string | undefined {
    return this.workspaces.get(sessionId);
  }

  has(sessionId: string): boolean {
    return this.workspaces.has(sessionId);
  }

  forget(sessionId: string): void {
    this.workspaces.delete(sessionId);
  }
}

export function locationOptions(root: string | undefined): StoreLocationOptions {
  return root === undefined ? {} : { root };
}

export function countTaskStarted(events: readonly StoredSessionEvent[]): number {
  let count = 0;
  for (const event of events) {
    if (event.type === 'task_started') count += 1;
  }
  return count;
}

export function sessionTitle(events: readonly StoredSessionEvent[]): string | null {
  for (const event of events) {
    if (event.type !== 'task_started') continue;

    const payload = event.payload as Partial<TaskStartedPayload>;
    const description = typeof payload.taskDescription === 'string' ? payload.taskDescription.trim() : '';
    if (description === '') return null;
    return description.length > MAX_TITLE_CHARS
      ? `${description.slice(0, MAX_TITLE_CHARS)}…`
      : description;
  }
  return null;
}

/** 最后一条 run 头里记的模型（事件流是 `unknown`，所以走判据而不是断言） */
export function lastRunModel(events: readonly StoredSessionEvent[]): ModelRef | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i]!;
    if (event.type !== 'task_started') continue;
    const payload = event.payload as Partial<TaskStartedPayload>;
    // 最靠后的那条即使没带模型，也说明它比更早的更新 —— 到此为止
    return isModelRef(payload.model) ? payload.model : undefined;
  }
  return undefined;
}

export function buildSessionView(input: {
  sessionId: string;
  workspace: string;
  createdAt: number;
  lastActiveAt: number;
  events: readonly StoredSessionEvent[];
  /** 会话头里记的模型；老会话没有 */
  model?: ModelRef | undefined;
  /** 主人的名字；只有「管理员看别人的会话」这一个场景会传 */
  owner?: { id: string; name: string } | undefined;
}): SessionView {
  const lastModel = lastRunModel(input.events);
  return {
    id: input.sessionId,
    workspace: input.workspace,
    createdAt: input.createdAt,
    lastActiveAt: input.lastActiveAt,
    taskCount: countTaskStarted(input.events),
    title: sessionTitle(input.events),
    ...(input.model !== undefined ? { model: input.model } : {}),
    ...(lastModel !== undefined ? { lastModel } : {}),
    ...(input.owner !== undefined ? { owner: input.owner } : {}),
  };
}

/** 一个会话的磁盘视图：事件、重放出来的 run、以及列表项 */
export interface SessionSnapshot {
  view: SessionView;
  events: StoredSessionEvent[];
  runs: RestoredRun[];
  /** 可直接作为 priorRuns 交给运行时 */
  priorRuns: PriorRun[];
}

export function readSessionSnapshot(
  store: SessionStore,
  workspace: string,
  summary: { createdAt: number; lastActiveAt: number },
): SessionSnapshot {
  const events = store.readEvents();
  const restored = replaySession(events, { sessionId: store.sessionId, workspaceRoot: workspace });
  return {
    view: buildSessionView({
      sessionId: store.sessionId,
      workspace,
      createdAt: summary.createdAt,
      lastActiveAt: summary.lastActiveAt,
      events,
      model: store.readMeta()?.model,
    }),
    events,
    runs: restored.runs,
    priorRuns: restored.runs,
  };
}

export function listSessionViews(
  workspace: string,
  root: string | undefined,
): SessionView[] {
  const options = locationOptions(root);
  return listSessions(workspace, options).map((summary: SessionSummary) => {
    const store = new SessionStore(workspace, summary.sessionId, options);
    return buildSessionView({
      sessionId: summary.sessionId,
      workspace,
      createdAt: summary.createdAt,
      lastActiveAt: summary.lastActiveAt,
      events: store.readEvents(),
      model: store.readMeta()?.model,
    });
  });
}

/**
 * 磁盘上某个根目录下有哪些会话（不查索引）。
 *
 * 用途只有一个：把「CLI 直接写出来的会话」补进索引。分区的目录名是工作区的哈希，
 * 反推不回来，所以工作区得从每个分区的 `index.json` 里读 —— 那是派生快照，
 * 缺了或坏了就跳过它：宁可少补几条，也不要猜一个工作区路径然后读错地方。
 */
export function discoverSessionsOnDisk(
  root: string | undefined,
): { sessionId: string; workspace: string }[] {
  const base = root ?? sessionsRoot();
  let partitions: string[];
  try {
    partitions = readdirSync(base, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('ws-'))
      .map((entry) => entry.name);
  } catch {
    return [];
  }

  const found: { sessionId: string; workspace: string }[] = [];
  for (const partition of partitions) {
    const workspace = readWorkspaceOfPartition(join(base, partition));
    if (workspace === null) continue;

    const collection = join(base, partition, 'sessions');
    let entries: Dirent[];
    try {
      entries = readdirSync(collection, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !isSessionId(entry.name)) continue;
      // 只有真的落了事件或会话头才算会话：空目录是「打开过又立刻退出」留下的
      const dir = join(collection, entry.name);
      if (!existsSync(join(dir, 'events.jsonl')) && !existsSync(join(dir, 'meta.json'))) continue;
      found.push({ sessionId: entry.name, workspace });
    }
  }
  return found;
}

/** 分区里的 `index.json` 记着它的工作区原文；读不到或形状不对返回 null */
function readWorkspaceOfPartition(partitionDir: string): string | null {
  const file = join(partitionDir, 'index.json');
  if (!existsSync(file)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = (parsed as Record<string, unknown>)['workspaceRoot'];
    return typeof value === 'string' && value !== '' ? value : null;
  } catch {
    return null;
  }
}

/**
 * 一个身份能看到的会话，**从索引里读**。
 *
 * 列表从索引读而不是从磁盘扫：磁盘上只有「哪些目录存在」，没有「属于谁」。
 * 每次列都顺手补一遍索引，于是命令行建的会话下一次刷新就会出现。
 */
export function listSessionViewsFor(
  rows: readonly SessionOwnerRow[],
  rootOf: (ownerId: string) => string | undefined,
  owners: ReadonlyMap<string, string>,
  viewerId: string,
  isAdmin: boolean,
): SessionView[] {
  const views: SessionView[] = [];
  for (const row of rows) {
    const options = locationOptions(rootOf(row.userId));
    const store = new SessionStore(row.workspace, row.sessionId, options);
    const events = store.readEvents();
    if (events.length === 0) continue;

    const summary = store.summary();
    views.push(buildSessionView({
      sessionId: row.sessionId,
      workspace: row.workspace,
      createdAt: summary?.createdAt ?? row.createdAt,
      lastActiveAt: summary?.lastActiveAt ?? row.createdAt,
      events,
      model: store.readMeta()?.model,
      // 只有管理员可能看到别人的会话；看自己的时不带 owner，界面因此不必判断
      ...(row.userId === viewerId || !isAdmin
        ? {}
        : { owner: { id: row.userId, name: owners.get(row.userId) ?? row.userId } }),
    }));
  }
  return views.sort((a, b) => a.createdAt - b.createdAt);
}

export function sessionEventsFileExists(store: SessionStore): boolean {
  return existsSync(store.eventsFile) || existsSync(store.metaFile);
}

export function exportSessionMarkdown(store: SessionStore): string {
  return renderSessionMarkdown(store.readEvents());
}

export function removeSession(workspace: string, sessionId: string, root: string | undefined): boolean {
  return deleteSession(workspace, sessionId, locationOptions(root)).deleted;
}
