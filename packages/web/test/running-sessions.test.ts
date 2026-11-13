/**
 * The account menu's "running now" merge (features/account/running-sessions.ts): the rows a
 * project-level fetch brought, reconciled with the live statuses the user channel reports.
 *
 * - A Session the channel has moved to another live status says the newer one.
 * - A Session the channel reports idle is dropped, even though the fetch still lists it: the
 *   fetch is older than that news, and a "running" row for a finished run is the one lie this
 *   list must not tell.
 * - A Session the channel has never named keeps the status its row carried.
 * - Order is the fetch's (running first, most recently active first): the merge only relabels
 *   and drops, so a refetch is the only thing that can reorder.
 */
import { describe, expect, it } from "vitest";
import type { SessionInfo, SessionStatus } from "@adelie/server/api";
import { mergeRunningSessions } from "../src/features/account/running-sessions";

function row(sessionId: string, status: SessionStatus, title = sessionId): SessionInfo {
  return {
    sessionId,
    projectId: "p1",
    agentId: "a1",
    provider: "custom",
    modelId: "m1",
    workspace: "/tmp/w",
    approvalMode: "allow-all",
    createdAt: "2026-11-13T00:00:00.000Z",
    lastActiveAt: "2026-11-13T00:00:00.000Z",
    status,
    hasTrace: true,
    archived: false,
    title,
  } as SessionInfo;
}

describe("mergeRunningSessions", () => {
  it("applies the live status to a fetched row", () => {
    const live = new Map<string, SessionStatus>([["s1", "compacting"]]);
    const [merged] = mergeRunningSessions([row("s1", "running")], live);
    expect(merged?.status).toBe("compacting");
  });

  it("drops a row the channel reports idle, whatever the fetch said", () => {
    const live = new Map<string, SessionStatus>([["s1", "idle"]]);
    expect(mergeRunningSessions([row("s1", "running")], live)).toEqual([]);
  });

  it("keeps the row's own status for a Session the channel never named", () => {
    const [merged] = mergeRunningSessions([row("s1", "running")], new Map());
    expect(merged?.status).toBe("running");
    expect(merged?.title).toBe("s1");
  });

  it("leaves the fetch's order alone", () => {
    const live = new Map<string, SessionStatus>([["s2", "compacting"]]);
    const merged = mergeRunningSessions([row("s1", "running"), row("s2", "running")], live);
    expect(merged.map((s) => s.sessionId)).toEqual(["s1", "s2"]);
  });
});
