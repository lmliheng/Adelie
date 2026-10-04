// 会话的读侧：列表、详情、导出（契约 §3）。
//
// 事件的读写本身在 core 的 SessionStore / replaySession 里，这里只做「面向 HTTP
// 的形状」——列表项多出来的 workspace / taskCount / title 不在存储层，由事件流派生。
import { existsSync } from 'node:fs';

import {
  SessionStore,
  deleteSession,
  isModelRef,
  listSessions,
  renderSessionMarkdown,
  replaySession,
} from 'adelie-core';

import type {
  ModelRef,
  PriorRun,
  RestoredRun,
  SessionSummary,
  StoreLocationOptions,
  StoredSessionEvent,
  TaskStartedPayload,
} from 'adelie-core';

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

export function sessionEventsFileExists(store: SessionStore): boolean {
  return existsSync(store.eventsFile) || existsSync(store.metaFile);
}

export function exportSessionMarkdown(store: SessionStore): string {
  return renderSessionMarkdown(store.readEvents());
}

export function removeSession(workspace: string, sessionId: string, root: string | undefined): boolean {
  return deleteSession(workspace, sessionId, locationOptions(root)).deleted;
}
