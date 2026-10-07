/**
 * Admin users backend integration tests: permission boundary (non-admin 403), account
 * creation validation and rollback, password reset (session invalidation), user
 * deletion (cascading deletion of owned Project), and the list's two read-only
 * columns (last sign-in, owned-Project lifetime cost).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveProjectConfig } from "@lmliheng/penguin-core";
import type { AdminUsersResponse, MembersResponse } from "../src/api/types.js";
import { apiClient, createTestApp, loginAdmin, loginUser, provisionUser } from "./helpers.js";
import type { TestApp } from "./helpers.js";

describe("admin users backend", () => {
  let t: TestApp;
  let admin: ReturnType<typeof apiClient>;

  beforeEach(async () => {
    t = await createTestApp();
    admin = apiClient(t.app, (await loginAdmin(t.app)).cookie);
  });
  afterEach(async () => {
    await t.cleanup();
  });

  it("non-admin access is always 403", async () => {
    const { cookie } = await provisionUser(t.app, "norm");
    const api = apiClient(t.app, cookie);
    expect((await api.get("/api/admin/users")).status).toBe(403);
    expect(
      (await api.post("/api/admin/users", { userId: "x_user", password: "password-123" })).status,
    ).toBe(403);
    expect(
      (await api.post("/api/admin/users/norm/password", { password: "password-456" })).status,
    ).toBe(403);
    expect((await api.delete("/api/admin/users/norm")).status).toBe(403);
  });

  it("account creation: invalid username / short password 400; duplicate 409", async () => {
    for (const bad of ["Bob", "1abc", "a", "-abc", "a-b", "a!b", "a".repeat(33)]) {
      const res = await admin.post("/api/admin/users", { userId: bad, password: "password-123" });
      expect(res.status, `userId=${bad}`).toBe(400);
    }
    expect(
      (await admin.post("/api/admin/users", { userId: "ok_user", password: "short" })).status,
    ).toBe(400);
    expect(
      (await admin.post("/api/admin/users", { userId: "ok_user", password: "password-123" }))
        .status,
    ).toBe(201);
    expect(
      (await admin.post("/api/admin/users", { userId: "ok_user", password: "password-123" }))
        .status,
    ).toBe(409);
    expect(
      (await admin.post("/api/admin/users", { userId: "admin", password: "password-123" })).status,
    ).toBe(409);
  });

  it("default Project id taken: account creation fails and rolls back the user", async () => {
    // Occupy the frank-default_project directory (simulating CLI creation; no Web-side user can construct another's prefix).
    await fs.mkdir(path.join(t.root, "frank-default_project"), { recursive: true });
    const res = await admin.post("/api/admin/users", { userId: "frank", password: "password-123" });
    expect(res.status).toBe(409);
    // The user row has been rolled back: frank is absent from the list and cannot log in.
    const list = (await (await admin.get("/api/admin/users")).json()) as AdminUsersResponse;
    expect(list.users.map((u) => u.userId)).not.toContain("frank");
  });

  it("user list: seeded admin and newly created user, all fields present", async () => {
    await provisionUser(t.app, "kate");
    const list = (await (await admin.get("/api/admin/users")).json()) as AdminUsersResponse;
    expect(list.users.map((u) => u.userId)).toEqual(["admin", "kate"]);
    const a = list.users[0]!;
    expect(a.isAdmin).toBe(true);
    expect(a.passwordIsInitial).toBe(true);
    expect(a.createdAt).toBeTruthy();
    expect(list.users[1]!.isAdmin).toBe(false);
  });

  it("password reset: clears the user's sessions, new password keeps initial flag", async () => {
    const rex = await provisionUser(t.app, "rex");
    const rexApi = apiClient(t.app, rex.cookie);
    expect((await rexApi.get("/api/me")).status).toBe(200);

    expect(
      (await admin.post("/api/admin/users/ghost/password", { password: "password-456" })).status,
    ).toBe(404);
    expect((await admin.post("/api/admin/users/rex/password", { password: "short" })).status).toBe(
      400,
    );
    expect(
      (await admin.post("/api/admin/users/rex/password", { password: "password-456" })).status,
    ).toBe(204);

    // Both the old session and the old password are invalidated.
    expect((await rexApi.get("/api/me")).status).toBe(401);
    await expect(loginUser(t.app, "rex", "password-123")).rejects.toThrow();
    const again = await loginUser(t.app, "rex", "password-456");
    expect(again.user.passwordIsInitial).toBe(true);
  });

  it("the admin resetting ITSELF chooses a known password: claimed, no first-login link", async () => {
    // Only an admin reaches this route, so resetting `admin` is a self-reset with a KNOWN
    // password — a claimed state, not the unclaimed one the setup link exists for. Leaving
    // the initial flag on would re-open the link on the next restart (reviewer's repro).
    expect(
      (await admin.post("/api/admin/users/admin/password", { password: "chosen-admin-1" })).status,
    ).toBe(204);
    expect(t.deps.authService.adminPasswordIsInitial()).toBe(false);
    // mintFirstLogin gates on the initial flag, so no link is offered.
    expect(t.deps.authService.mintFirstLogin()).toBeNull();
    const back = await loginUser(t.app, "admin", "chosen-admin-1");
    expect(back.user.passwordIsInitial).toBe(false);
  });

  it("user deletion: owned Projects (with directories) and memberships removed", async () => {
    const gone = await provisionUser(t.app, "gone");
    const goneApi = apiClient(t.app, gone.cookie);
    expect(
      (await goneApi.post("/api/projects", { projectId: "gone-extra", name: "Extra" })).status,
    ).toBe(201);
    // gone is also a member of admin's default_project.
    expect(
      (await admin.post("/api/projects/default_project/members", { userId: "gone" })).status,
    ).toBe(201);

    expect((await admin.delete("/api/admin/users/gone")).status).toBe(204);

    // Session and account are invalidated; entry disappears from the list.
    expect((await goneApi.get("/api/me")).status).toBe(401);
    await expect(loginUser(t.app, "gone", "password-123")).rejects.toThrow();
    const list = (await (await admin.get("/api/admin/users")).json()) as AdminUsersResponse;
    expect(list.users.map((u) => u.userId)).toEqual(["admin"]);

    // Both the DB row and the directory for the owned Project are gone.
    const rows = t.deps.db.prepare("SELECT project_id FROM projects ORDER BY project_id").all();
    expect(rows.map((r) => r.project_id)).toEqual(["default_project"]);
    await expect(fs.access(path.join(t.root, "gone-default_project"))).rejects.toThrow();
    await expect(fs.access(path.join(t.root, "gone-extra"))).rejects.toThrow();

    // The membership on default_project has been cascade-cleared.
    const members = (await (
      await admin.get("/api/projects/default_project/members")
    ).json()) as MembersResponse;
    expect(members.members.map((m) => m.userId)).toEqual(["admin"]);
  });

  it("built-in admin cannot be deleted; unknown user 404", async () => {
    expect((await admin.delete("/api/admin/users/admin")).status).toBe(409);
    expect((await admin.delete("/api/admin/users/ghost")).status).toBe(404);
  });

  /**
   * The two read-only columns the user backend carries. Both are the server's own figures: the
   * sign-in stamp AuthService writes on a password login, and the lifetime cost of the Projects
   * the account OWNS, priced at the current rates.
   */
  it("user list: last sign-in is stamped by the login that succeeded, absent for an account never used", async () => {
    const kate = await provisionUser(t.app, "kate");
    // Kate has signed in (provisionUser logs her in); "dave" was created and never used.
    expect(
      (await admin.post("/api/admin/users", { userId: "dave", password: "password-123" })).status,
    ).toBe(201);
    expect(kate.user.lastLoginAt).toBeTruthy();

    const list = (await (await admin.get("/api/admin/users")).json()) as AdminUsersResponse;
    const byId = new Map(list.users.map((u) => [u.userId, u]));
    expect(byId.get("admin")!.lastLoginAt).toBeTruthy();
    expect(byId.get("kate")!.lastLoginAt).toBeTruthy();
    expect(byId.get("dave")!.lastLoginAt).toBeUndefined();
    // Nothing has run anywhere, so there is no figure to price — the column reports no cost
    // rather than a zero the reader cannot tell from "ran for free".
    expect(byId.get("dave")!.totalCostUsd).toBeUndefined();
    expect(byId.get("admin")!.costUnpriced).toBeUndefined();
  });

  it("user list: cost sums the Projects the account owns, and says so when a model has no price", async () => {
    const kate = await provisionUser(t.app, "kate");
    // Two models in Kate's own Project: `m-priced` costs (10*1 + 1*2 + 5*3)/1e6 per record,
    // `m-free` carries no pricing block at all.
    await saveProjectConfig(t.root, "kate-default_project", {
      default_model: { provider: "custom", model_id: "m-priced" },
      models: [
        {
          provider: "custom",
          model_id: "m-priced",
          pricing: { unit: "usd_per_mtok", cache_read: 1, cache_write: 2, output: 3 },
        },
        { provider: "custom", model_id: "m-free" },
      ],
    });
    const insertUsage = (modelId: string, date: string): void => {
      t.deps.db
        .prepare(
          "INSERT INTO usage_records (ts, date, project_id, agent_id, session_id, origin_session_id, provider, model_id, cache_read, cache_write, output, total)" +
            " VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)",
        )
        .run(
          `${date}T00:00:00.000Z`,
          date,
          "kate-default_project",
          "kate_agent",
          "s-1",
          "custom",
          modelId,
          10,
          1,
          5,
          16,
        );
    };
    insertUsage("m-priced", "2026-10-01");
    insertUsage("m-priced", "2026-10-02");
    // Nobody else's: the admin's own default Project has no usage, and Kate's cost counts only
    // what her own Project recorded — the figure is per owned Project, not per caller.
    let list = (await (await admin.get("/api/admin/users")).json()) as AdminUsersResponse;
    const priced = list.users.find((u) => u.userId === "kate")!;
    expect(priced.totalCostUsd).toBeCloseTo((2 * (10 * 1 + 1 * 2 + 5 * 3)) / 1e6, 12);
    expect(priced.costUnpriced).toBeUndefined();
    expect(list.users.find((u) => u.userId === "admin")!.totalCostUsd).toBeUndefined();

    // A record on a model with no price block makes the sum a lower bound — reported as such
    // instead of silently dropped.
    insertUsage("m-free", "2026-10-03");
    list = (await (await admin.get("/api/admin/users")).json()) as AdminUsersResponse;
    const bounded = list.users.find((u) => u.userId === "kate")!;
    expect(bounded.totalCostUsd).toBeCloseTo(priced.totalCostUsd!, 12);
    expect(bounded.costUnpriced).toBe(true);
  });
});
