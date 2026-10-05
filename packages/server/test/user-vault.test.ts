/**
 * The user-level vault API: the signed-in user's OWN secrets
 * (`<root>/users/<userId>/.vault.toml`), its JSON import, and the copy into one Agent.
 *
 * - GET masks every value and never sends plaintext; it answers about the caller only — another
 *   account's table is never visible, and an empty vault is an empty table.
 * - PUT is whole-table replace, the same rules as the Agent vault: an entry without a value keeps
 *   the stored one, an absent key is deleted, a new key without a value is a 400.
 * - POST …/vault/import takes the pasted JSON text or the object itself and MERGES it; a bad entry
 *   is a 400 naming that entry, and a rejected import writes nothing.
 * - POST …/agents/:a/vault/assign-user-vault is owner-only and copies: the same key overwrites the
 *   Agent's own value, the Agent's other entries stay, and the user's table is left untouched.
 * - The file lands under the data root's `users/` (outside any Project), 0600.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ProjectCreateResponse, VaultResponse } from "../src/api/types.js";
import { apiClient, createTestApp, provisionUser } from "./helpers.js";
import type { TestApp } from "./helpers.js";

/** key → masked value, so an assertion is about content rather than file order. */
function masked(entries: VaultResponse["entries"]): Record<string, string> {
  return Object.fromEntries(entries.map((e) => [e.key, e.valueMasked]));
}

describe("user vault api", () => {
  let t: TestApp;
  let owner: ReturnType<typeof apiClient>;
  let other: ReturnType<typeof apiClient>;
  let outsider: ReturnType<typeof apiClient>;
  let projectId: string;
  /** The caller's user-level table on disk, and the Agent-level one the assign cases write. */
  let userVaultFile: string;
  let agentVaultFile: string;
  /** The Agent-level route, for both the table itself and the assign endpoint under it. */
  let agentVaultPath: string;

  beforeAll(async () => {
    t = await createTestApp();
    const a = await provisionUser(t.app, "owner_a");
    const b = await provisionUser(t.app, "member_b");
    const c = await provisionUser(t.app, "outsider_c");
    owner = apiClient(t.app, a.cookie);
    other = apiClient(t.app, b.cookie);
    outsider = apiClient(t.app, c.cookie);
    const created = (await (
      await owner.post("/api/projects", { projectId: "owner_a-uservault", name: "vault project" })
    ).json()) as ProjectCreateResponse;
    projectId = created.project.projectId;
    agentVaultPath = `/api/projects/${projectId}/agents/default_agent/vault`;
    agentVaultFile = path.join(
      t.root,
      projectId,
      "agents",
      "default_agent",
      "agent_state",
      ".vault.toml",
    );
    userVaultFile = path.join(t.root, "users", "owner_a", ".vault.toml");
    expect(
      (await owner.post(`/api/projects/${projectId}/members`, { userId: "member_b" })).status,
    ).toBe(201);
  });
  afterAll(async () => {
    await t.cleanup();
  });
  beforeEach(async () => {
    expect((await owner.put("/api/me/vault", { entries: [] })).status).toBe(200);
    expect((await owner.put(agentVaultPath, { entries: [] })).status).toBe(200);
  });

  it("GET masks values, never sends plaintext, and answers about the caller only", async () => {
    expect(((await (await owner.get("/api/me/vault")).json()) as VaultResponse).entries).toEqual(
      [],
    );

    const put = await owner.put("/api/me/vault", {
      entries: [
        { key: "OPENAI_API_KEY", value: "sk-user-secret-123456" },
        { key: "SHORT", value: "sk-short-1" },
      ],
    });
    expect(put.status).toBe(200);
    // The write response is masked too: plaintext never comes back, not even to its owner.
    expect(JSON.stringify(await put.json())).not.toContain("sk-user-secret-123456");

    const body = (await (await owner.get("/api/me/vault")).json()) as VaultResponse;
    expect(masked(body.entries)).toEqual({
      OPENAI_API_KEY: "sk-u…3456",
      SHORT: "***", // ≤12 chars are masked entirely
    });
    expect(JSON.stringify(body)).not.toContain("sk-user-secret-123456");

    // Another account's table is its own: the same route answers empty, holding nothing of owner_a's.
    expect(((await (await other.get("/api/me/vault")).json()) as VaultResponse).entries).toEqual(
      [],
    );

    // On disk: under the data root's users/, outside every Project, 0600.
    expect((await fs.stat(userVaultFile)).mode & 0o777).toBe(0o600);
    expect(await fs.readFile(userVaultFile, "utf8")).toContain("sk-user-secret-123456");
  });

  it("GET is behind the cookie gate", async () => {
    expect((await t.app.request("/api/me/vault")).status).toBe(401);
    expect((await t.app.request("/api/me/vault/import", { method: "POST" })).status).toBe(401);
  });

  it("PUT replaces the whole table: omitted values are kept, absent keys deleted, bad input a named 400", async () => {
    await owner.put("/api/me/vault", {
      entries: [
        { key: "KEEP_ME", value: "keep-secret-000111" },
        { key: "DROP_ME", value: "drop-secret" },
      ],
    });
    const second = (await (
      await owner.put("/api/me/vault", { entries: [{ key: "KEEP_ME" }] })
    ).json()) as VaultResponse;
    expect(second.entries).toEqual([{ key: "KEEP_ME", valueMasked: "keep…0111" }]);

    const cases: unknown[] = [
      { entries: [{ key: "1BAD", value: "v" }] }, // starts with a digit
      { entries: [{ key: "BAD-DASH", value: "v" }] }, // hyphen
      { entries: [{ key: "BAD KEY", value: "v" }] }, // space
      { entries: [{ key: "OK_KEY", value: "" }] }, // empty value
      {
        entries: [
          { key: "DUP", value: "a" },
          { key: "DUP", value: "b" },
        ],
      }, // duplicate key
      { entries: [{ key: "BIG", value: "x".repeat(8193) }] }, // over the 8192 cap (exec E2BIG)
      { entries: [{ key: "BRAND_NEW" }] }, // new key without a value
      { entries: { K: "v" } }, // entries is not an array
      { entries: [42] }, // entry is not an object
    ];
    for (const body of cases) {
      expect((await owner.put("/api/me/vault", body)).status).toBe(400);
    }

    // None of the rejected writes landed: the table is still the one KEEP_ME entry.
    const after = (await (await owner.get("/api/me/vault")).json()) as VaultResponse;
    expect(after.entries.map((e) => e.key)).toEqual(["KEEP_ME"]);
  });

  it("POST /vault/import takes the pasted JSON text or the object, merges, and names the bad entry", async () => {
    const first = await owner.post("/api/me/vault/import", {
      json: '{"A_KEY": "secret-a-123456", "B_KEY": "secret-b-123456"}',
    });
    expect(first.status).toBe(200);
    expect(JSON.stringify(await first.json())).not.toContain("secret-a-123456");

    // A second import is additive: A_KEY is overwritten, B_KEY stays, C_KEY is added.
    const merged = (await (
      await owner.post("/api/me/vault/import", {
        json: '{"A_KEY": "secret-a2-123456", "C_KEY": "secret-c-123456"}',
      })
    ).json()) as VaultResponse;
    expect(Object.keys(masked(merged.entries)).sort()).toEqual(["A_KEY", "B_KEY", "C_KEY"]);
    // The mask cannot tell the two A_KEY values apart — the file can.
    expect(await fs.readFile(userVaultFile, "utf8")).toContain("secret-a2-123456");

    // The object form: the body IS the table (importing one key-value pair at a time included).
    const one = (await (
      await owner.post("/api/me/vault/import", { D_KEY: "secret-d-123456" })
    ).json()) as VaultResponse;
    expect(Object.keys(masked(one.entries)).sort()).toEqual(["A_KEY", "B_KEY", "C_KEY", "D_KEY"]);

    const bad: unknown[] = [
      { json: "not json at all" }, // not JSON
      { json: '["A_KEY"]' }, // JSON, but not an object
      { json: "{}" }, // an empty import has nothing to do
      { json: '{"1BAD": "v"}' }, // key rule
      { json: '{"OK": ""}' }, // empty value
      { json: '{"NUM": 5}' }, // value is not a string
      { json: `{"BIG": "${"x".repeat(8193)}"}` }, // over the value cap
      { json: 42 }, // the wrapper is not text
    ];
    for (const body of bad) {
      expect((await owner.post("/api/me/vault/import", body)).status, JSON.stringify(body)).toBe(
        400,
      );
    }

    // An entry that fails names itself, and the failed call wrote nothing.
    const named = await owner.post("/api/me/vault/import", {
      json: '{"GOOD": "v-1", "1BAD": "v"}',
    });
    expect(named.status).toBe(400);
    expect(await named.text()).toContain("1BAD");
    expect(await fs.readFile(userVaultFile, "utf8")).not.toContain("GOOD");
  });

  it("assign copies the selected entries into the Agent's vault and leaves the rest alone", async () => {
    await owner.put("/api/me/vault", {
      entries: [
        { key: "SHARED_KEY", value: "user-value-123456" },
        { key: "ONLY_USER", value: "user-only-123456" },
      ],
    });
    await owner.put(agentVaultPath, {
      entries: [
        { key: "SHARED_KEY", value: "agent-old-value" },
        { key: "AGENT_ONLY", value: "agent-only-1" },
      ],
    });

    const res = await owner.post(`${agentVaultPath}/assign-user-vault`, {
      keys: ["SHARED_KEY", "ONLY_USER"],
    });
    expect(res.status).toBe(200);

    // The Agent's file: the same key overwritten with the user's value, its own entry kept.
    const agentDisk = await fs.readFile(agentVaultFile, "utf8");
    expect(agentDisk).toContain("user-value-123456");
    expect(agentDisk).toContain("AGENT_ONLY");
    expect(agentDisk).toContain("agent-only-1");
    expect(agentDisk).not.toContain("agent-old-value");

    // The response is the Agent's refreshed table, masked.
    const body = (await res.json()) as VaultResponse;
    expect(JSON.stringify(body)).not.toContain("user-value-123456");
    expect(Object.keys(masked(body.entries)).sort()).toEqual([
      "AGENT_ONLY",
      "ONLY_USER",
      "SHARED_KEY",
    ]);

    // A copy, not a link: the user's own table still holds its entry.
    const user = (await (await owner.get("/api/me/vault")).json()) as VaultResponse;
    expect(Object.keys(masked(user.entries)).sort()).toEqual(["ONLY_USER", "SHARED_KEY"]);
  });

  it("assign is owner-only, names keys the caller does not have, and rejects malformed bodies", async () => {
    await owner.put("/api/me/vault", { entries: [{ key: "MINE", value: "mine-secret-123456" }] });
    const assign = (client: ReturnType<typeof apiClient>, keys: unknown) =>
      client.post(`${agentVaultPath}/assign-user-vault`, { keys });

    expect((await assign(owner, ["NOPE"])).status).toBe(400);
    expect((await assign(owner, [])).status).toBe(400);
    expect((await assign(owner, "MINE")).status).toBe(400);
    expect((await assign(owner, [42])).status).toBe(400);
    // A member cannot write the Agent's vault (the same owner-level gate the PUT has), and an
    // outsider cannot see the Agent at all: neither gets to copy their keys into it.
    expect((await assign(other, ["MINE"])).status).toBe(403);
    expect((await assign(outsider, ["MINE"])).status).toBe(404);
    const noAgent = await owner.post(
      `/api/projects/${projectId}/agents/no-such-agent/vault/assign-user-vault`,
      { keys: ["MINE"] },
    );
    expect(noAgent.status).toBe(404);
  });
});
