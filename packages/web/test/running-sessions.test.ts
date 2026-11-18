/**
 * The account menu's "running now" merge (features/account/running-sessions.ts): the rows a
 * project-level fetch brought, reconciled with the live statuses the user channel reports and
 * with the ones it already held when the request went out.
 *
 * - A Session the channel has moved SINCE the fetch went out says the newer status: the answer
 *   cannot know about it.
 * - A Session the channel moved to `idle` since then is dropped, even though the fetch still
 *   lists it: a "running" row for a finished run is the one lie this list must not tell.
 * - A Session whose status the channel already held at request time is the fetch's to decide:
 *   that status is older than the server's own read, and a remembered `idle` from an earlier run
 *   must not hide the run the fetch is reporting.
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
  it("applies a live status that moved after the request", () => {
    const live = new Map<string, SessionStatus>([["s1", "compacting"]]);
    const baseline = new Map<string, SessionStatus>([["s1", "running"]]);
    const [merged] = mergeRunningSessions([row("s1", "running")], live, baseline);
    expect(merged?.status).toBe("compacting");
  });

  it("applies a live status the channel did not hold at request time", () => {
    const live = new Map<string, SessionStatus>([["s1", "running"]]);
    const [merged] = mergeRunningSessions([row("s1", "running")], live, new Map());
    expect(merged?.status).toBe("running");
  });

  it("drops a row the channel moved to idle after the request, whatever the fetch said", () => {
    const live = new Map<string, SessionStatus>([["s1", "idle"]]);
    const baseline = new Map<string, SessionStatus>([["s1", "running"]]);
    expect(mergeRunningSessions([row("s1", "running")], live, baseline)).toEqual([]);
  });

  it("keeps a running row the channel moved to idle on an earlier run", () => {
    // The reported bug: the channel remembers the previous run's idle, the next run's running
    // never arrives (a relay swallowing the response body), and the fetch is the only source
    // that knows. A remembered idle is older than that answer and must not hide the run.
    const live = new Map<string, SessionStatus>([["s1", "idle"]]);
    const baseline = new Map<string, SessionStatus>([["s1", "idle"]]);
    const [merged] = mergeRunningSessions([row("s1", "running")], live, baseline);
    expect(merged?.status).toBe("running");
  });

  it("lets the fetch overrule a remembered live status it repeats", () => {
    // Same rule seen from the other side: a stale running keeps the row, but the row's own
    // status is what the list shows — the fetch was taken later.
    const live = new Map<string, SessionStatus>([["s1", "compacting"]]);
    const baseline = new Map<string, SessionStatus>([["s1", "compacting"]]);
    const [merged] = mergeRunningSessions([row("s1", "running", "T")], live, baseline);
    expect(merged?.status).toBe("running");
    expect(merged?.title).toBe("T");
  });

  it("keeps the row's own status for a Session the channel never named", () => {
    const [merged] = mergeRunningSessions([row("s1", "running")], new Map(), new Map());
    expect(merged?.status).toBe("running");
    expect(merged?.title).toBe("s1");
  });

  it("leaves the fetch's order alone", () => {
    const live = new Map<string, SessionStatus>([["s2", "compacting"]]);
    const baseline = new Map<string, SessionStatus>([["s2", "running"]]);
    const merged = mergeRunningSessions(
      [row("s1", "running"), row("s2", "running")],
      live,
      baseline,
    );
    expect(merged.map((s) => s.sessionId)).toEqual(["s1", "s2"]);
  });
});
