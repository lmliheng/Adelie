/**
 * `POST /api/projects/:p/models/assign-user-key` — one of the account's own global secrets,
 * copied onto every model of a provider group as its `api_key`.
 *
 * The browser cannot do this itself: every user-vault response is masked, so the request names an
 * ENTRY and the server reads the plaintext from `<root>/users/<userId>/.vault.toml` and writes it
 * into the Project's `.project_config.toml`. Hence the cases below:
 *
 * - It copies: the value lands on every row of the group, is reported as `applied`, and the mask
 *   every later read shows is the one the browser can see — plaintext in no response.
 * - It is the CALLER's own table: the same entry name on another account is not the value used.
 * - A group with no rows writes nothing and says 0; a name the caller does not hold is a 400 that
 *   names it, and so is a body without a provider or a key.
 * - Owner-only, like the rest of the model config: a member is 403, an outsider 404, no cookie 401.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  ModelsResponse,
  ModelUserKeyAssignResponse,
  ProjectCreateResponse,
} from "../src/api/types.js";
import { apiClient, createTestApp, provisionUser } from "./helpers.js";
import type { TestApp } from "./helpers.js";

/** The group the cases write a key onto — a gateway group: one endpoint, one key, many rows. */
const GROUP = "tokendance";
const GATEWAY = "https://tokendance.space/gateway/v1";

describe("assign a user key to a model group", () => {
  let t: TestApp;
  let owner: ReturnType<typeof apiClient>;
  let member: ReturnType<typeof apiClient>;
  let outsider: ReturnType<typeof apiClient>;
  let projectId: string;
  let configFile: string;

  /** The group's rows, as the whole-table PUT wants them: the key never stated on them. */
  const rows = (ids: string[]) =>
    ids.map((modelId) => ({
      provider: GROUP,
      modelId,
      clientType: "openai-chat",
      baseUrl: GATEWAY,
    }));

  beforeAll(async () => {
    t = await createTestApp();
    const a = await provisionUser(t.app, "owner_a");
    const b = await provisionUser(t.app, "member_b");
    const c = await provisionUser(t.app, "outsider_c");
    owner = apiClient(t.app, a.cookie);
    member = apiClient(t.app, b.cookie);
    outsider = apiClient(t.app, c.cookie);
  });
  afterAll(async () => {
    await t.cleanup();
  });

  let projects = 0;
  beforeEach(async () => {
    projects += 1;
    const created = (await (
      await owner.post("/api/projects", {
        projectId: `owner_a-assignkey_${projects}`,
        name: "Assign key project",
      })
    ).json()) as ProjectCreateResponse;
    projectId = created.project.projectId;
    configFile = path.join(t.root, projectId, ".project_config.toml");
    // Three rows of the group and no key anywhere: what the action is for.
    const put = await owner.put(`/api/projects/${projectId}/models`, {
      models: rows(["deepseek-v4-flash-0731", "deepseek-v4-pro", "deepseek-v4.1-flash"]),
    });
    expect(put.status).toBe(200);
    expect(
      (await owner.post(`/api/projects/${projectId}/members`, { userId: "member_b" })).status,
    ).toBe(201);
    expect((await owner.put("/api/me/vault", { entries: [] })).status).toBe(200);
    expect((await member.put("/api/me/vault", { entries: [] })).status).toBe(200);
  });

  const assign = (client: ReturnType<typeof apiClient>, body: unknown) =>
    client.post(`/api/projects/${projectId}/models/assign-user-key`, body);

  it("copies the entry onto every row of the group and leaks no plaintext", async () => {
    await owner.put("/api/me/vault", {
      entries: [{ key: "TEAM_KEY", value: "sk-user-team-123456" }],
    });

    const res = await assign(owner, { provider: GROUP, key: "TEAM_KEY" });
    expect(res.status).toBe(200);
    // Neither the outcome nor a later read carries the value: only the mask.
    const text = await res.text();
    expect((JSON.parse(text) as ModelUserKeyAssignResponse).applied).toBe(3);
    expect(text).not.toContain("sk-user-team-123456");

    const body = (await (
      await owner.get(`/api/projects/${projectId}/models`)
    ).json()) as ModelsResponse;
    const masks = body.models
      .filter((m) => m.provider === GROUP)
      .map((m) => m.credential?.apiKeyMasked);
    expect(masks).toEqual(["sk-u…3456", "sk-u…3456", "sk-u…3456"]);
    expect(JSON.stringify(body)).not.toContain("sk-user-team-123456");

    // On disk it is a real key on every row of the group — and a copy: the user's own table
    // keeps its entry (there is no link for a later edit to travel along).
    const raw = await readFile(configFile, "utf8");
    expect(raw.split('api_key = "sk-user-team-123456"').length - 1).toBe(3);
    const user = (await (await owner.get("/api/me/vault")).json()) as { entries: unknown[] };
    expect(user.entries).toEqual([{ key: "TEAM_KEY", valueMasked: "sk-u…3456" }]);
  });

  it("reads the caller's own table: another account's entry of the same name is not the value", async () => {
    await owner.put("/api/me/vault", {
      entries: [{ key: "TEAM_KEY", value: "sk-owner-key-123456" }],
    });
    await member.put("/api/me/vault", {
      entries: [{ key: "TEAM_KEY", value: "sk-member-key-12345" }],
    });

    expect((await assign(owner, { provider: GROUP, key: "TEAM_KEY" })).status).toBe(200);
    const raw = await readFile(configFile, "utf8");
    expect(raw).toContain("sk-owner-key-123456");
    expect(raw).not.toContain("sk-member-key-12345");
  });

  it("an empty group writes nothing and says so; an unknown name or a malformed body is a 400", async () => {
    await owner.put("/api/me/vault", { entries: [{ key: "MINE", value: "mine-secret-123456" }] });

    // A group the table has no rows for: nothing to write, and the count says exactly that.
    const empty = await assign(owner, { provider: "openai", key: "MINE" });
    expect(empty.status).toBe(200);
    expect(((await empty.json()) as ModelUserKeyAssignResponse).applied).toBe(0);

    // A name the caller does not hold is refused, and the refusal names it.
    const missing = await assign(owner, { provider: GROUP, key: "NOT_IN_MY_VAULT" });
    expect(missing.status).toBe(400);
    expect(await missing.text()).toContain("NOT_IN_MY_VAULT");

    for (const body of [
      { provider: GROUP }, // no key
      { key: "MINE" }, // no provider
      { provider: "", key: "MINE" }, // empty provider
      { provider: GROUP, key: "" }, // empty key
      { provider: 42, key: "MINE" }, // not a string
      { provider: GROUP, key: "MINE".repeat(64) }, // over the 128-char cap
    ]) {
      expect((await assign(owner, body)).status, JSON.stringify(body)).toBe(400);
    }

    // None of the refused calls touched the config: the rows still hold no key at all.
    expect(await readFile(configFile, "utf8")).not.toContain("api_key");
  });

  it("is owner-only: a member is 403, an outsider 404, no cookie 401", async () => {
    await owner.put("/api/me/vault", { entries: [{ key: "MINE", value: "mine-secret-123456" }] });
    await member.put("/api/me/vault", { entries: [{ key: "MINE", value: "theirs-secret-1234" }] });

    expect((await assign(member, { provider: GROUP, key: "MINE" })).status).toBe(403);
    expect((await assign(outsider, { provider: GROUP, key: "MINE" })).status).toBe(404);
    expect(
      (
        await t.app.request(`/api/projects/${projectId}/models/assign-user-key`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider: GROUP, key: "MINE" }),
        })
      ).status,
    ).toBe(401);

    expect(await readFile(configFile, "utf8")).not.toContain("api_key");
  });
});
