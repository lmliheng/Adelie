/**
 * `GET /api/projects/:projectId/sessions/running` — the account menu's "what is running now".
 *
 * The route is the join of two things the shell already keeps apart: the runtime's own table
 * (every live Session this process holds, across Agents) and the Session index (the row that
 * names one). So the test mounts the route on a bare Hono app with those two faked, and checks
 * what the endpoint promises:
 *
 * - only the Project's own Sessions come back, whatever else is live on the server;
 * - running sorts before compacting (a run is the thing to report first);
 * - a Session whose row is gone is skipped rather than served as a nameless row;
 * - each answer is a whole row (title, Agent, Workspace, live status), not just an id.
 */
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { SessionInfo } from "../src/api/types.js";
import type { AppEnv } from "../src/auth/middleware.js";
import type { UserRow } from "../src/db/repos/users.js";
import type { SessionRow } from "../src/db/repos/sessions.js";
import { runningSessionsRoutes } from "../src/http/routes/sessions.js";
import type { SessionsRouteDeps } from "../src/http/routes/sessions.js";

type Live = {
  sessionId: string;
  projectId: string;
  agentId: string;
  status: "running" | "compacting";
};

function row(sessionId: string, projectId: string, agentId: string): SessionRow {
  return {
    sessionId,
    projectId,
    agentId,
    provider: "custom",
    modelId: "m1",
    workspace: "/tmp/w",
    approvalMode: "allow-all",
    title: `title of ${sessionId}`,
    createdAt: "2026-11-13T00:00:00.000Z",
    lastActiveAt: "2026-11-13T00:00:00.000Z",
    archivedAt: null,
    client: "web",
  } as unknown as SessionRow;
}

function info(r: SessionRow, status: "running" | "compacting"): SessionInfo {
  return {
    sessionId: r.sessionId,
    projectId: r.projectId,
    agentId: r.agentId,
    provider: r.provider,
    modelId: r.modelId,
    workspace: r.workspace,
    approvalMode: r.approvalMode,
    sandbox: {} as SessionInfo["sandbox"],
    title: r.title ?? undefined,
    createdAt: r.createdAt,
    lastActiveAt: r.lastActiveAt,
    status,
    hasTrace: true,
    archived: false,
  } as SessionInfo;
}

/** The whole app the route needs: a user on the context and the seven deps it reads. */
function appFor(live: Live[], rows: SessionRow[]): Hono<AppEnv> {
  const byId = new Map(rows.map((r) => [r.sessionId, r]));
  const deps = {
    access: { requireProjectAccess: () => undefined },
    manager: { liveSessions: () => live },
    sessionsRepo: { findById: (id: string) => byId.get(id) ?? null },
    sessionService: {
      hasTrace: async () => true,
      toInfo: async (r: SessionRow) =>
        info(r, live.find((l) => l.sessionId === r.sessionId)!.status),
    },
  } as unknown as SessionsRouteDeps;
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("user", { userId: "u1" } as UserRow);
    await next();
  });
  app.route("/api/projects/:projectId/sessions/running", runningSessionsRoutes(deps));
  return app;
}

describe("GET /sessions/running", () => {
  it("answers this Project's live Sessions as whole rows, running before compacting", async () => {
    const live: Live[] = [
      { sessionId: "s2", projectId: "p1", agentId: "a1", status: "compacting" },
      { sessionId: "s1", projectId: "p1", agentId: "a2", status: "running" },
      // Another Project's run, live on the same server: not this answer's business.
      { sessionId: "s9", projectId: "p2", agentId: "a1", status: "running" },
    ];
    const res = await appFor(live, [row("s1", "p1", "a2"), row("s2", "p1", "a1")]).request(
      "/api/projects/p1/sessions/running",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessions: SessionInfo[] };
    expect(body.sessions.map((s) => [s.sessionId, s.status])).toEqual([
      ["s1", "running"],
      ["s2", "compacting"],
    ]);
    expect(body.sessions[0]).toMatchObject({
      title: "title of s1",
      agentId: "a2",
      workspace: "/tmp/w",
    });
  });

  it("skips a live Session the index no longer holds", async () => {
    const live: Live[] = [{ sessionId: "gone", projectId: "p1", agentId: "a1", status: "running" }];
    const res = await appFor(live, []).request("/api/projects/p1/sessions/running");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { sessions: SessionInfo[] }).sessions).toEqual([]);
  });

  it("answers an empty list when nothing is running", async () => {
    const res = await appFor([], []).request("/api/projects/p1/sessions/running");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { sessions: SessionInfo[] }).sessions).toEqual([]);
  });
});
