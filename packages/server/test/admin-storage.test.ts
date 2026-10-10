/**
 * The storage ledger, as an admin reads it through GET /api/admin/storage.
 *
 * - Given a non-admin, the route answers 403 `admin_required`, and the data root is untouched.
 * - Given an admin, the report answers 200 with the root it walked, a parseable instant, and
 *   the class summaries adding up to `totalBytes` — the ledger's own completeness claim: every
 *   byte on disk lands in exactly one class, so the root's size is what the report accounts for.
 * - The request is read-only: a recursive listing of the root — every path, its size and its
 *   kind — is identical before and after the GET.
 * - The volume's own numbers are either absent or sane (`freeBytes <= totalBytes`).
 * - A temporary Workspace is a candidate while no Session points at it and stops being one the
 *   moment one does: the naming rule reads live state, not a stamp on disk.
 *
 * One app serves the file; the only disk state it creates is the one that case needs (a
 * temporary Workspace and the Session row claiming it) — the report describes whatever the root
 * holds, and the claims above hold for any root.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_ID, STORAGE_CLASSES } from "@lmliheng/penguin-core";
import type { StorageReport, StorageReportResponse } from "../src/api/types.js";
import { apiClient, createTestApp, loginAdmin, provisionUser } from "./helpers.js";
import type { TestApp } from "./helpers.js";

describe("admin storage ledger", () => {
  let t: TestApp;
  let admin: ReturnType<typeof apiClient>;

  beforeAll(async () => {
    t = await createTestApp();
    admin = apiClient(t.app, (await loginAdmin(t.app)).cookie);
  });
  afterAll(async () => {
    await t.cleanup();
  });

  const getReport = async (api = admin): Promise<StorageReport> => {
    const res = await api.get("/api/admin/storage");
    expect(res.status).toBe(200);
    return ((await res.json()) as StorageReportResponse).report;
  };

  it("a non-admin gets 403 admin_required, and the root is untouched", async () => {
    const { cookie } = await provisionUser(t.app, "norm");
    const api = apiClient(t.app, cookie);
    const before = await listing(t.root);
    const res = await api.get("/api/admin/storage");
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("admin_required");
    // Nothing about the refusal touches the disk either: a report is not produced and then
    // thrown away by the gate.
    expect(await listing(t.root)).toEqual(before);
  });

  it("an admin gets a report whose classes account for every byte of the root", async () => {
    const report = await getReport();
    // The root core walked is the real one: it resolves the path before classifying, so a
    // data root reached through a symlinked parent (/var → /private/var) still matches here.
    expect(report.root).toBe(await fs.realpath(t.root));
    expect(Number.isNaN(Date.parse(report.scannedAt))).toBe(false);

    // The app's own root holds an account and its Project, so there are bytes to account for.
    expect(report.totalBytes).toBeGreaterThan(0);
    expect(report.classes.reduce((sum, c) => sum + c.bytes, 0)).toBe(report.totalBytes);
    // Every class of the vocabulary is named, including the ones this root leaves empty: the
    // report is the whole classification, not only the parts that happen to be non-zero.
    expect(report.classes.map((c) => c.class)).toEqual([...STORAGE_CLASSES]);
    expect(report.candidates.every((c) => c.rules.length > 0)).toBe(true);
  });

  it("answers with the volume's own numbers, or with none", async () => {
    const { disk } = await getReport();
    if (disk !== null) expect(disk.freeBytes).toBeLessThanOrEqual(disk.totalBytes);
  });

  it("writes nothing: the root lists identically before and after the request", async () => {
    const before = await listing(t.root);
    // Twice, because a cache file written on the first read would show up on the second.
    await getReport();
    await getReport();
    expect(await listing(t.root)).toEqual(before);
  });

  it("stops calling a temporary Workspace unreferenced once a Session points at it", async () => {
    // The naming rule runs on live state, not on a stamp on disk: the same directory is a
    // candidate while nothing claims it and stops being one the moment a Session does.
    const workspace = path.join(
      t.root,
      DEFAULT_PROJECT_ID,
      "agents",
      "default_agent",
      "workspaces",
      "tmp-probe",
    );
    await fs.mkdir(workspace, { recursive: true });
    await fs.writeFile(path.join(workspace, "scratch.txt"), "left behind\n");
    // The ledger's paths are `/`-separated on every platform (they are what a plan records),
    // so the lookup normalizes the host's separator rather than assuming it.
    const relative = path.relative(t.root, workspace).split(path.sep).join("/");
    const candidate = (report: StorageReport) =>
      report.candidates.find((entry) => entry.path === relative);

    expect(candidate(await getReport())?.rules).toContain("unreferenced");

    const now = new Date().toISOString();
    t.deps.sessionsRepo.insert({
      sessionId: "session-2026-01-01-00-00-00-probe001",
      projectId: DEFAULT_PROJECT_ID,
      agentId: "default_agent",
      provider: "probe",
      modelId: "probe-model",
      workspace,
      approvalMode: "allow-all",
      title: null,
      client: "web",
      lastActiveAt: now,
      createdAt: now,
    });
    expect(candidate(await getReport())).toBeUndefined();
  });
});

/** One entry of a recursive listing: where it is, how big it is, and what it is. */
interface ListingEntry {
  path: string;
  size: number;
  kind: "dir" | "file" | "link" | "other";
}

/**
 * Everything under `root`, paths relative and sorted, with each entry's size and kind.
 * Directories are listed too, with their own sizes: a request that created or removed one
 * would change this list even if every file inside it stayed exactly where it was. Symlinks
 * are neither followed (a link out of the root would pull the whole filesystem in) nor
 * resolved, so the listing describes the root alone.
 */
async function listing(root: string): Promise<ListingEntry[]> {
  const out: ListingEntry[] = [];
  const visit = async (dir: string): Promise<void> => {
    const entries = (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const st = await fs.lstat(full);
      out.push({
        path: path.relative(root, full),
        size: st.size,
        kind: entry.isDirectory()
          ? "dir"
          : entry.isFile()
            ? "file"
            : entry.isSymbolicLink()
              ? "link"
              : "other",
      });
      if (entry.isDirectory()) await visit(full);
    }
  };
  await visit(root);
  return out;
}
