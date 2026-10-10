/**
 * The reviewed cleanup: scan a bill, approve some of it, move it to the trash, put it back.
 *
 * The route group's promises are what these tests pin, and every one of them is a refusal
 * except the happy path:
 *
 * - with the cleanup mode off nothing writes at all — the ledger stays readable and every
 *   other route in the group is refused;
 * - a scan produces a file and nothing else: the data root is byte-for-byte as it was;
 * - an approval is bound to the bill it read (fingerprint), usable once, and good for 24
 *   hours; an entry that changed, vanished, or came alive since the scan stops the run;
 * - only a temporary Workspace may be applied; every other class is on the bill and refused;
 * - a pin keeps an entry out of every later bill, and out of a run that still names it;
 * - a move lands in `<root>/.trash/<stamp>/items/<original path>` with a manifest, and a
 *   restore puts the tree back exactly as it was;
 * - `purge` is the only deletion, and it only ever removes from the trash.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_ID, planEntryFingerprint } from "@lmliheng/penguin-core";
import type {
  StorageApplyResponse,
  StoragePlanView,
  StoragePlansResponse,
  StoragePlanResponse,
  StoragePurgeResponse,
  StorageReportResponse,
  StorageRestoreResponse,
  StorageSettingsResponse,
  StorageTrashResponse,
} from "../src/api/types.js";
import { apiClient, createTestApp, loginAdmin, provisionUser } from "./helpers.js";
import type { TestApp } from "./helpers.js";

describe("storage cleanup", () => {
  let t: TestApp;
  let admin: ReturnType<typeof apiClient>;

  beforeAll(async () => {
    t = await createTestApp();
    admin = apiClient(t.app, (await loginAdmin(t.app)).cookie);
  });
  afterAll(async () => {
    await t.cleanup();
  });

  const settings = async (): Promise<StorageSettingsResponse["settings"]> => {
    const res = await admin.get("/api/admin/storage/settings");
    expect(res.status).toBe(200);
    return ((await res.json()) as StorageSettingsResponse).settings;
  };

  const setSettings = async (body: unknown): Promise<StorageSettingsResponse["settings"]> => {
    const res = await admin.put("/api/admin/storage/settings", body);
    expect(res.status).toBe(200);
    return ((await res.json()) as StorageSettingsResponse).settings;
  };

  const enable = async (): Promise<void> => {
    if (!(await settings()).enabled) await setSettings({ enabled: true });
  };

  /** A temporary Workspace nothing points at — the one class this version may move. */
  const tempWorkspace = async (name: string, content = "left behind\n"): Promise<string> => {
    const dir = path.join(
      t.root,
      DEFAULT_PROJECT_ID,
      "agents",
      "default_agent",
      "workspaces",
      name,
    );
    await fs.mkdir(path.join(dir, "sub"), { recursive: true });
    await fs.writeFile(path.join(dir, "sub", "scratch.txt"), content);
    return relative(dir);
  };

  /** Writes a file, creating the directories above it — a draft directory may not exist yet. */
  const write = async (file: string, content: string): Promise<void> => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  };

  /** A draft directory of a Session the index does not know: a candidate, and report-only. */
  const orphanDraft = async (sessionId: string): Promise<string> => {
    const file = path.join(
      t.root,
      DEFAULT_PROJECT_ID,
      "agents",
      "default_agent",
      "scratchpad",
      sessionId,
      "note.md",
    );
    await write(file, "draft\n");
    return relative(path.dirname(file));
  };

  /** The recorded, `/`-separated path the report and a bill use. */
  const relative = (absolute: string): string =>
    path.relative(t.root, absolute).split(path.sep).join("/");

  const absolute = (recorded: string): string => path.join(t.root, ...recorded.split("/"));

  const scan = async (): Promise<StoragePlanView> => {
    await enable();
    const res = await admin.post("/api/admin/storage/plans");
    expect(res.status).toBe(201);
    return ((await res.json()) as StoragePlanResponse).plan;
  };

  const planFile = (id: string): string => path.join(t.root, "storage", "plans", `${id}.json`);

  /** Rewrites the stored bill, for the cases only the disk can set up (expiry, a hand-made entry). */
  const tamper = async (id: string, patch: (plan: Record<string, unknown>) => void) => {
    const file = planFile(id);
    const plan = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
    patch(plan);
    await fs.writeFile(file, JSON.stringify(plan, null, 2));
  };

  const apply = async (body: unknown): Promise<Response> =>
    admin.post("/api/admin/storage/apply", body);

  const applyOrThrow = async (body: unknown): Promise<StorageApplyResponse> => {
    const res = await apply(body);
    expect(res.status).toBe(200);
    return (await res.json()) as StorageApplyResponse;
  };

  /** The status, error code and message of a refused request (the body is read once, here). */
  const refusal = async (
    res: Response,
  ): Promise<{ status: number; code: string; text: string }> => {
    const text = await res.text();
    const body = JSON.parse(text) as { error?: { code?: string } };
    return { status: res.status, code: body.error?.code ?? "", text };
  };

  /**
   * Everything under `root`: relative path, size and content, sorted. The point of a cleanup
   * test is that nothing appears, disappears or changes outside the trash, so a comparison is
   * only as good as what it looks at — this one looks at the bytes.
   *
   * Three things are left out because they are the machinery's own mutable state rather than
   * the data a cleanup acts on: the SQLite database and its sidecars (every settings write
   * lands there, and a read may checkpoint the WAL), `<root>/storage/plans` (a scan is supposed
   * to write one file there) and `<root>/logs` (every decision appends a line, including the
   * scans and mode switches these tests make). What matters — that no tree of the data root is
   * touched outside the trash — is untouched by that, because `.trash` is in the listing.
   */
  const snapshot = async (root: string): Promise<string[]> => {
    const out: string[] = [];
    const visit = async (dir: string): Promise<void> => {
      for (const name of (await fs.readdir(dir)).sort()) {
        const rel = path.relative(root, path.join(dir, name));
        if (dir === root && (name === "web.db" || name.startsWith("web.db-"))) continue;
        if (rel === "storage" || rel === "logs") continue;
        const full = path.join(dir, name);
        const st = await fs.lstat(full);
        if (st.isDirectory()) {
          out.push(`dir ${rel}`);
          await visit(full);
          continue;
        }
        if (st.isSymbolicLink()) {
          out.push(`link ${rel} -> ${await fs.readlink(full)}`);
          continue;
        }
        out.push(`file ${rel} ${st.size} ${await fs.readFile(full, "utf8")}`);
      }
    };
    await visit(root);
    return out;
  };

  it("refuses every write while the cleanup mode is off, and keeps the ledger readable", async () => {
    const workspace = await tempWorkspace("tmp-mode-off");
    await setSettings({ enabled: false });

    // Reading is always allowed: the mode gates doing, not knowing.
    expect((await admin.get("/api/admin/storage")).status).toBe(200);
    expect((await admin.get("/api/admin/storage/plans")).status).toBe(200);
    expect((await admin.get("/api/admin/storage/trash")).status).toBe(200);
    expect((await settings()).enabled).toBe(false);

    const plan = await scan();
    // The scan above enabled the mode (it is the one write there is), so turn it off again and
    // take the baseline after that: what follows must change nothing bytes either.
    await setSettings({ enabled: false });
    const before = await snapshot(t.root);

    expect(await refusal(await admin.post("/api/admin/storage/plans"))).toMatchObject({
      status: 409,
      code: "storage_mode_off",
    });
    expect(
      await refusal(await apply({ planId: plan.id, fingerprint: plan.fingerprint, paths: [] })),
    ).toMatchObject({ status: 409, code: "storage_mode_off" });
    expect(await refusal(await admin.post("/api/admin/storage/trash/purge", {}))).toMatchObject({
      status: 409,
      code: "storage_mode_off",
    });
    expect(
      await refusal(await admin.post("/api/admin/storage/trash/restore", { id: "x" })),
    ).toMatchObject({ status: 409, code: "storage_mode_off" });
    expect(
      await refusal(
        await admin.post(`/api/admin/storage/plans/${plan.id}/pin`, { path: workspace }),
      ),
    ).toMatchObject({ status: 409, code: "storage_mode_off" });

    // The refused writes left nothing behind: no trash entry, and the workspace untouched.
    expect(await fs.readdir(absolute(workspace))).toEqual(["sub"]);
    expect(await snapshot(t.root)).toEqual(before);
  });

  it("answers 403 admin_required to a non-admin on every route in the group", async () => {
    const { cookie } = await provisionUser(t.app, "storagenorm");
    const api = apiClient(t.app, cookie);
    const plan = await scan();
    const refused = [
      await api.get("/api/admin/storage"),
      await api.get("/api/admin/storage/settings"),
      await api.put("/api/admin/storage/settings", { enabled: true }),
      await api.get("/api/admin/storage/plans"),
      await api.post("/api/admin/storage/plans"),
      await api.get(`/api/admin/storage/plans/${plan.id}`),
      await api.post(`/api/admin/storage/plans/${plan.id}/pin`, { path: "x" }),
      await api.post("/api/admin/storage/apply", { planId: "x", fingerprint: "x", paths: [] }),
      await api.get("/api/admin/storage/trash"),
      await api.post("/api/admin/storage/trash/restore", { id: "x" }),
      await api.post("/api/admin/storage/trash/purge", {}),
    ];
    for (const res of refused) {
      expect(await refusal(res)).toMatchObject({ status: 403, code: "admin_required" });
    }
  });

  it("scans a bill that names the candidates and their reasons, and touches nothing else", async () => {
    const workspace = await tempWorkspace("tmp-bill");
    await orphanDraft("s-orphan");
    const before = await snapshot(t.root);
    const plan = await scan();

    const entry = plan.entries.find((e) => e.path === workspace);
    expect(entry?.class).toBe("tmp_workspaces");
    expect(entry?.rules).toContain("unreferenced");
    expect(entry?.executable).toBe(true);
    expect(entry?.files).toBe(1);
    expect(entry?.bytes).toBeGreaterThan(0);
    expect(entry?.fingerprint).toMatch(/^[0-9a-f]{32}$/);

    // The draft directory is on the bill too — a person should see it — but it is not
    // executable, and the bill says which classes are.
    const draft = plan.entries.find((e) => e.class === "session_drafts");
    expect(draft?.executable).toBe(false);
    expect(plan.executableClasses).toEqual(["tmp_workspaces"]);
    expect(plan.usable).toBe(true);
    expect(plan.expired).toBe(false);
    expect(Date.parse(plan.expiresAt) - Date.parse(plan.createdAt)).toBe(24 * 60 * 60 * 1000);

    // A scan is a read of the data root plus one file of its own: the root itself is unchanged.
    expect(await snapshot(t.root)).toEqual(before);
    expect(await fs.readFile(planFile(plan.id), "utf8")).toContain(plan.fingerprint);
    expect((await admin.get(`/api/admin/storage/plans/${plan.id}`)).status).toBe(200);
    const list = (await (
      await admin.get("/api/admin/storage/plans")
    ).json()) as StoragePlansResponse;
    expect(list.plans.map((p) => p.id)).toContain(plan.id);
  });

  it("moves an approved temporary Workspace into the trash and puts it back unchanged", async () => {
    const workspace = await tempWorkspace("tmp-happy", "a deliverable\n");
    const tree = await snapshot(absolute(workspace));
    const plan = await scan();

    const result = await applyOrThrow({
      planId: plan.id,
      fingerprint: plan.fingerprint,
      paths: [workspace],
    });
    expect(result.moved.map((m) => m.path)).toEqual([workspace]);
    expect(result.failed).toEqual([]);
    expect(result.freedBytes).toBeGreaterThan(0);
    expect(result.trashId).not.toBeNull();

    // The workspace is gone from where it was, and the trash holds it under its original path.
    expect(await fs.stat(absolute(workspace)).catch(() => null)).toBeNull();
    const trashId = result.trashId ?? "";
    expect(
      await snapshot(path.join(t.root, ".trash", trashId, "items", ...workspace.split("/"))),
    ).toEqual(tree);
    const manifest = JSON.parse(
      await fs.readFile(path.join(t.root, ".trash", trashId, "manifest.json"), "utf8"),
    ) as { planId: string; items: { path: string; class: string }[] };
    expect(manifest.planId).toBe(plan.id);
    expect(manifest.items).toEqual([
      {
        path: workspace,
        class: "tmp_workspaces",
        bytes: result.moved[0]?.bytes,
        files: result.moved[0]?.files,
      },
    ]);

    // Applying again is refused: this plan is spent.
    expect(
      await refusal(
        await apply({ planId: plan.id, fingerprint: plan.fingerprint, paths: [workspace] }),
      ),
    ).toMatchObject({ status: 409, code: "plan_used" });

    // The ledger now counts the trash, and the trash list names what is in it.
    const trash = (await (
      await admin.get("/api/admin/storage/trash")
    ).json()) as StorageTrashResponse;
    const entry = trash.entries.find((e) => e.id === trashId);
    expect(entry?.items.map((i) => i.path)).toEqual([workspace]);
    expect(entry?.expired).toBe(false);
    // The ledger counts the trash like everything else, so a report says what the runs hold.
    const report = (await (await admin.get("/api/admin/storage")).json()) as StorageReportResponse;
    expect(report.report.classes.find((c) => c.class === "trash")?.bytes).toBeGreaterThan(0);

    // Restore puts the bytes back, and an entry that holds nothing is removed with them.
    const restored = (await (
      await admin.post("/api/admin/storage/trash/restore", { id: trashId })
    ).json()) as StorageRestoreResponse;
    expect(restored.restored).toEqual([workspace]);
    expect(restored.skipped).toEqual([]);
    expect(restored.remaining).toBe(false);
    expect(await snapshot(absolute(workspace))).toEqual(tree);
    expect(await fs.stat(path.join(t.root, ".trash", trashId)).catch(() => null)).toBeNull();
  });

  it("refuses a fingerprint that is not this plan's", async () => {
    const workspace = await tempWorkspace("tmp-fingerprint");
    const plan = await scan();
    expect(
      await refusal(await apply({ planId: plan.id, fingerprint: "nope", paths: [workspace] })),
    ).toMatchObject({ status: 409, code: "plan_stale" });
    expect(await fs.stat(absolute(workspace))).not.toBeNull();
  });

  it("refuses an expired plan, and says so before it is applied", async () => {
    const workspace = await tempWorkspace("tmp-expired");
    const plan = await scan();
    await tamper(plan.id, (raw) => {
      raw.expiresAtMs = Date.now() - 1000;
    });
    const view = (await (
      await admin.get(`/api/admin/storage/plans/${plan.id}`)
    ).json()) as StoragePlanResponse;
    expect(view.plan.expired).toBe(true);
    expect(view.plan.usable).toBe(false);
    expect(
      await refusal(
        await apply({ planId: plan.id, fingerprint: plan.fingerprint, paths: [workspace] }),
      ),
    ).toMatchObject({ status: 409, code: "plan_expired" });
    expect(await fs.stat(absolute(workspace))).not.toBeNull();
  });

  it("refuses a batch whose entry changed since the scan", async () => {
    const workspace = await tempWorkspace("tmp-drift");
    const plan = await scan();
    await fs.writeFile(
      path.join(absolute(workspace), "sub", "later.txt"),
      "written after the scan\n",
    );
    const res = await apply({ planId: plan.id, fingerprint: plan.fingerprint, paths: [workspace] });
    const refused = await refusal(res);
    expect(refused).toMatchObject({ status: 409, code: "plan_stale" });
    expect(refused.text).toContain(workspace);
    expect(await fs.stat(absolute(workspace))).not.toBeNull();
  });

  it("refuses an entry a Session started using after the scan", async () => {
    const workspace = await tempWorkspace("tmp-revived");
    const plan = await scan();
    const now = new Date().toISOString();
    t.deps.sessionsRepo.insert({
      sessionId: "session-2026-01-01-00-00-00-revived",
      projectId: DEFAULT_PROJECT_ID,
      agentId: "default_agent",
      provider: "probe",
      modelId: "probe-model",
      workspace: absolute(workspace),
      approvalMode: "allow-all",
      title: null,
      client: "web",
      lastActiveAt: now,
      createdAt: now,
    });
    expect(
      await refusal(
        await apply({ planId: plan.id, fingerprint: plan.fingerprint, paths: [workspace] }),
      ),
    ).toMatchObject({ status: 409, code: "entry_still_live" });
    expect(await fs.stat(absolute(workspace))).not.toBeNull();
  });

  it("reports the classes it will not clean, and refuses a selection of them", async () => {
    await orphanDraft("s-report-only");
    const plan = await scan();
    const draft = plan.entries.find((e) => e.class === "session_drafts");
    expect(draft).toBeDefined();
    if (draft === undefined) return;
    expect(
      await refusal(
        await apply({ planId: plan.id, fingerprint: plan.fingerprint, paths: [draft.path] }),
      ),
    ).toMatchObject({ status: 409, code: "class_not_executable" });
    expect(await fs.stat(absolute(draft.path))).not.toBeNull();
  });

  it("keeps a pinned path out of the next bill and refuses a plan that still names it", async () => {
    const workspace = await tempWorkspace("tmp-pinned");
    const before = await scan();
    const pinned = (await (
      await admin.post(`/api/admin/storage/plans/${before.id}/pin`, { path: workspace })
    ).json()) as StorageSettingsResponse;
    expect(pinned.settings.pins).toContain(workspace);

    // A bill written after the pin leaves the entry out, and says that it did.
    const after = await scan();
    expect(after.entries.map((e) => e.path)).not.toContain(workspace);
    expect(after.excluded).toContain(workspace);

    // The older bill still names it, and a run against that bill is refused rather than obeyed.
    expect(
      await refusal(
        await apply({ planId: before.id, fingerprint: before.fingerprint, paths: [workspace] }),
      ),
    ).toMatchObject({ status: 409, code: "pinned_path" });
    expect(await fs.stat(absolute(workspace))).not.toBeNull();

    // Unpinning brings it back, and the settings round-trip is what an admin reads.
    const unpinned = (await (
      await admin.post(`/api/admin/storage/plans/${before.id}/pin`, {
        path: workspace,
        pinned: false,
      })
    ).json()) as StorageSettingsResponse;
    expect(unpinned.settings.pins).not.toContain(workspace);
    expect((await scan()).entries.map((e) => e.path)).toContain(workspace);
  });

  it("refuses a selection that is empty, unknown, or not a temporary Workspace", async () => {
    const workspace = await tempWorkspace("tmp-selection");
    const plan = await scan();
    expect(
      await refusal(await apply({ planId: plan.id, fingerprint: plan.fingerprint, paths: [] })),
    ).toMatchObject({ status: 400, code: "nothing_selected" });
    expect(
      await refusal(
        await apply({
          planId: plan.id,
          fingerprint: plan.fingerprint,
          paths: ["proj/agents/agent/nope"],
        }),
      ),
    ).toMatchObject({ status: 400, code: "unknown_path" });

    // A hand-written bill may name anything; what may be moved is still only the whitelist.
    await tamper(plan.id, (raw) => {
      const entries = raw.entries as unknown[];
      entries.push({
        path: `${DEFAULT_PROJECT_ID}/agents/default_agent/agent_state`,
        class: "tmp_workspaces",
        bytes: 1,
        files: 1,
        newestMtimeMs: 1,
        rules: ["unreferenced"],
        fingerprint: `deadbeef${"0".repeat(24)}`,
      });
    });
    expect(
      await refusal(
        await apply({
          planId: plan.id,
          fingerprint: plan.fingerprint,
          paths: [`${DEFAULT_PROJECT_ID}/agents/default_agent/agent_state`],
        }),
      ),
    ).toMatchObject({ status: 400, code: "path_not_allowed" });
    expect(await fs.stat(absolute(workspace))).not.toBeNull();
  });

  it("refuses a planned path that is a link out of the root", async () => {
    const outside = await fs.mkdtemp(path.join(t.root, "..", "adelie-storage-outside-"));
    await fs.writeFile(path.join(outside, "f.txt"), "outside the root\n");
    const link = path.join(
      t.root,
      DEFAULT_PROJECT_ID,
      "agents",
      "default_agent",
      "workspaces",
      "tmp-linked",
    );
    await fs.mkdir(path.dirname(link), { recursive: true });
    await fs.symlink(outside, link);
    try {
      const recorded = relative(link);
      const plan = await scan();
      const stat = await fs.stat(outside);
      // The scan never follows a link, so the entry has to be put on the bill by hand: this is
      // the "a plan file was edited, or written by an older version" case.
      await tamper(plan.id, (raw) => {
        const entries = raw.entries as unknown[];
        entries.push({
          path: recorded,
          class: "tmp_workspaces",
          bytes: stat.size,
          files: 1,
          newestMtimeMs: stat.mtimeMs,
          rules: ["unreferenced"],
          fingerprint: planEntryFingerprint({
            path: recorded,
            bytes: stat.size,
            newestMtimeMs: stat.mtimeMs,
          }),
        });
      });
      expect(
        await refusal(
          await apply({ planId: plan.id, fingerprint: plan.fingerprint, paths: [recorded] }),
        ),
      ).toMatchObject({ status: 409, code: "path_not_allowed" });
      expect(await fs.readFile(path.join(outside, "f.txt"), "utf8")).toBe("outside the root\n");
      expect(await fs.readlink(link)).toBe(outside);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
      await fs.rm(link, { force: true });
    }
  });

  it("purges the entry it is given, and only what is past the retention when given none", async () => {
    const first = await tempWorkspace("tmp-purge-one");
    const plan = await scan();
    const applied = await applyOrThrow({
      planId: plan.id,
      fingerprint: plan.fingerprint,
      paths: [first],
    });
    const keep = applied.trashId ?? "";

    // A purge without an id only reaches entries older than the retention, so a fresh one stays.
    await setSettings({ trashTtlDays: 14 });
    const nothing = (await (
      await admin.post("/api/admin/storage/trash/purge", {})
    ).json()) as StoragePurgeResponse;
    expect(nothing.purged).toEqual([]);
    expect(await fs.stat(path.join(t.root, ".trash", keep))).not.toBeNull();

    // Backdate the manifest and the same call takes it — the retention is days, not a timer.
    const manifestPath = path.join(t.root, ".trash", keep, "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.createdAtMs = Date.now() - 20 * 86_400_000;
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    const expired = (await (
      await admin.post("/api/admin/storage/trash/purge", {})
    ).json()) as StoragePurgeResponse;
    expect(expired.purged.map((p) => p.id)).toEqual([keep]);
    expect(expired.purged[0]?.bytes).toBeGreaterThan(0);
    expect(await fs.stat(path.join(t.root, ".trash", keep)).catch(() => null)).toBeNull();

    // Naming an entry removes exactly that one, whatever its age.
    const second = await tempWorkspace("tmp-purge-two");
    const plan2 = await scan();
    const applied2 = await applyOrThrow({
      planId: plan2.id,
      fingerprint: plan2.fingerprint,
      paths: [second],
    });
    const named = applied2.trashId ?? "";
    const purged = (await (
      await admin.post("/api/admin/storage/trash/purge", { id: named })
    ).json()) as StoragePurgeResponse;
    expect(purged.purged.map((p) => p.id)).toEqual([named]);
    expect(await fs.stat(path.join(t.root, ".trash", named)).catch(() => null)).toBeNull();
    expect(
      await refusal(await admin.post("/api/admin/storage/trash/purge", { id: named })),
    ).toMatchObject({ status: 404, code: "trash_not_found" });
    // A purge never reaches outside the trash, whatever it is asked for.
    expect(
      await refusal(await admin.post("/api/admin/storage/trash/purge", { id: ".." })),
    ).toMatchObject({ status: 400, code: "invalid_trash_id" });
  });

  it("records every decision in the audit log, and refuses an unknown plan", async () => {
    const workspace = await tempWorkspace("tmp-audit");
    await setSettings({ enabled: true });
    const plan = await scan();
    await applyOrThrow({ planId: plan.id, fingerprint: plan.fingerprint, paths: [workspace] });
    await setSettings({ enabled: false });

    const lines = (await fs.readFile(path.join(t.root, "logs", "storage-gc.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { action: string; path?: string; planId?: string });
    const actions = lines.map((line) => line.action);
    expect(actions).toContain("mode_on");
    expect(actions).toContain("mode_off");
    expect(actions).toContain("scan");
    expect(actions).toContain("apply");
    // The log accumulates across the runs this file makes, so the line is looked up by path.
    const move = lines.find((line) => line.action === "move" && line.path === workspace);
    expect(move?.path).toBe(workspace);
    expect(move?.planId).toBe(plan.id);

    expect(
      await refusal(await admin.get("/api/admin/storage/plans/2026-01-01-00-00-00-ffffff")),
    ).toMatchObject({ status: 404, code: "plan_not_found" });
    // A plan id is a file name, so anything that is not one never reaches the filesystem.
    const traversal = await admin.get("/api/admin/storage/plans/..%2F..%2Fetc");
    expect([400, 404]).toContain(traversal.status);
  });

  it("refuses a scan and a move while another run holds the writer", async () => {
    // The single-writer rule is one flag, and what it has to do is refuse rather than queue:
    // a second run would otherwise clean against a directory the first one is already moving.
    await enable();
    const running = t.deps.tree.api<{ scan(): Promise<unknown> }>(
      "ObservabilityModule",
      "StorageAdmin",
    );
    const first = running.scan();
    const second = await refusal(await admin.post("/api/admin/storage/plans"));
    await first;
    expect(second).toMatchObject({ status: 409, code: "storage_busy" });
  });
});
