/**
 * session-project.ts unit tests: the Project isolation of a deep-linked Session, the probe
 * key that scopes a failed lookup to its Project, and how the chat page settles which Session
 * the route names when the loaded list does not hold it.
 *
 * - a Session of another Project is never the routed one, listed or looked up, so a Project
 *   switch never shows the previous Project's conversation.
 */
import { describe, expect, it } from "vitest";
import type { SessionInfo } from "@adelie/server/api";
import {
  resolveRoutedSession,
  sessionForProject,
  sessionProbeKey,
} from "../src/features/chat/session-project";

const SESSION: SessionInfo = {
  sessionId: "session-a",
  projectId: "project-a",
  agentId: "default_agent",
  provider: "anthropic",
  modelId: "claude-sonnet-4",
  workspace: "/workspace",
  approvalMode: "allow-all",
  sandbox: { mode: "danger-full-access", network: "open" },
  createdAt: "2026-08-24T00:00:00.000Z",
  lastActiveAt: "2026-08-24T00:00:00.000Z",
  status: "idle",
  pendingApprovalCount: 0,
  pendingFollowUpCount: 0,
  hasTrace: true,
  archived: false,
};

describe("Session Project isolation", () => {
  it("accepts a deep-linked Session from the current Project", () => {
    expect(sessionForProject(SESSION, "project-a")).toBe(SESSION);
  });

  it("rejects a deep-linked Session from another Project", () => {
    expect(sessionForProject(SESSION, "project-b")).toBeNull();
  });

  it("does not reuse a probe failure after switching Projects", () => {
    expect(sessionProbeKey("project-a", SESSION.sessionId)).not.toBe(
      sessionProbeKey("project-b", SESSION.sessionId),
    );
  });
});

describe("resolveRoutedSession", () => {
  const other: SessionInfo = { ...SESSION, sessionId: "session-b" };

  it("takes the list's row when it holds one", () => {
    expect(resolveRoutedSession("session-a", [other, SESSION], null, "project-a")).toBe(SESSION);
  });

  it("prefers the list's row over the fetched one — the list is the row events keep current", () => {
    const stale: SessionInfo = { ...SESSION, status: "running" };
    expect(resolveRoutedSession("session-a", [SESSION], stale, "project-a")).toBe(SESSION);
  });

  it("falls back to the fetched row, which is what survives a list reload dropping it", () => {
    // An organization's desk opened from the org chart: never in the development list, and
    // dropped from the store again by the next reload.
    expect(resolveRoutedSession("session-a", [], SESSION, "project-a")).toBe(SESSION);
    expect(resolveRoutedSession("session-a", [other], SESSION, "project-a")).toBe(SESSION);
  });

  it("ignores a fetched row for another id, and answers nothing without a route", () => {
    expect(resolveRoutedSession("session-a", [], other, "project-a")).toBeNull();
    expect(resolveRoutedSession(null, [SESSION], SESSION, "project-a")).toBeNull();
  });

  it("after a switch to another Project, neither the looked-up row nor a listed one is the routed Session", () => {
    // The route and the lookup's copy outlive the switch; shown under project-b they would
    // render that Project with project-a's conversation and Agent.
    expect(resolveRoutedSession("session-a", [], SESSION, "project-b")).toBeNull();
    expect(resolveRoutedSession("session-a", [SESSION], SESSION, "project-b")).toBeNull();
  });
});
