/**
 * The storage ledger (core/src/state/storage.ts).
 *
 * These tests pin the properties the design's promises rest on:
 *
 * - every byte under the root lands in exactly one class, and the classes sum to the root,
 *   so a report can never be "complete except for the part nobody looked at";
 * - user data is never a candidate — `agent_state`, a Workspace the user chose, snapshots,
 *   Project config, plugins, vaults;
 * - a candidate is a claim about provenance, not about age: a referenced temporary
 *   Workspace is not a candidate however old it is, and an unreferenced one is;
 * - liveness is the caller's input: the same tree scanned with an empty live set and with a
 *   populated one yields different candidates, which is exactly why the ledger cannot be
 *   used to delete anything on its own;
 * - thresholds default to off, so a scan of a frozen tree reports zero candidates unless a
 *   policy asks for some.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildStoragePlan,
  DEFAULT_STORAGE_POLICY,
  emptyLiveSet,
  EXECUTABLE_STORAGE_CLASSES,
  isExecutableStorageClass,
  isPlannablePath,
  measureStorageEntry,
  planDefaultSelection,
  planEntryFingerprint,
  planFingerprint,
  resolveStorageEntry,
  scanStorage,
  storagePlanId,
  storageTrashId,
  STORAGE_PLAN_TTL_MS,
  type StorageLiveSet,
  type StoragePolicy,
} from "../src/state/storage.js";

const DAY_MS = 86_400_000;

/** Roots created by a test, removed after it however it ended. */
const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) await fs.rm(root, { recursive: true, force: true });
  }
});

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "adelie-storage-"));
  roots.push(root);
  return root;
}

async function writeFile(file: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

/** Backdates a whole tree, the parent directories included — the ledger's silent test. */
async function backdate(target: string, days: number): Promise<void> {
  const when = new Date(Date.now() - days * DAY_MS);
  const visit = async (p: string): Promise<void> => {
    const st = await fs.lstat(p);
    if (st.isDirectory()) {
      for (const name of await fs.readdir(p)) await visit(path.join(p, name));
    }
    await fs.utimes(p, when, when);
  };
  await visit(target);
}

/** A minimal install: one Project, one Agent, with the given extra directories. */
async function scaffold(): Promise<string> {
  const root = await tempRoot();
  await writeFile(path.join(root, "web.db"), "database");
  await writeFile(path.join(root, "web.db-wal"), "wal");
  await writeFile(path.join(root, "api-token"), "token");
  await writeFile(
    path.join(root, "proj", "agents", "agent", "agent_state", "AGENTS.md"),
    "you are an agent",
  );
  await writeFile(path.join(root, "proj", ".project_config.toml"), "name = 'p'");
  return root;
}

function policy(overrides: Partial<StoragePolicy>): StoragePolicy {
  return { ...DEFAULT_STORAGE_POLICY, ...overrides };
}

function live(overrides: Partial<StorageLiveSet>): StorageLiveSet {
  return { ...emptyLiveSet(), ...overrides };
}

describe("scanStorage", () => {
  it("accounts for every byte: classes sum to the root, and the database is its own class", async () => {
    const root = await scaffold();
    await writeFile(path.join(root, "proj", "agents", "agent", "scratchpad", "s1", "note.md"), "x");
    await writeFile(path.join(root, "proj", "benchmarks", "bank.json"), "y");

    const ledger = await scanStorage(root, emptyLiveSet());
    const summed = ledger.classes.reduce((sum, c) => sum + c.bytes, 0);
    expect(summed).toBe(ledger.totalBytes);
    expect(ledger.totalBytes).toBeGreaterThan(0);

    const byClass = (key: string) => ledger.classes.find((c) => c.class === key);
    expect(byClass("database")?.bytes).toBe("database".length + "wal".length);
    expect(byClass("session_drafts")?.entries).toBe(1);
    expect(byClass("other")?.entries).toBe(1); // api-token
    // The Project config and the benchmark bank are user data, whatever they weigh.
    expect(byClass("protected")?.entries).toBeGreaterThanOrEqual(2);
  });

  it("reports the root's own file tools as `other` rather than leaving them out", async () => {
    const root = await scaffold();
    await writeFile(path.join(root, "install-id"), "id");
    const ledger = await scanStorage(root, emptyLiveSet());
    const other = ledger.candidates.filter((c) => c.class === "other");
    expect(other).toEqual([]); // `other` is reported, never a candidate
    expect(ledger.classes.find((c) => c.class === "other")?.entries).toBe(2);
  });

  it("never reports user data as a candidate, however old and unreferenced it is", async () => {
    const root = await scaffold();
    await writeFile(path.join(root, "proj", "agents", "agent", "agent_state", "vault.toml"), "s");
    await writeFile(
      path.join(root, "proj", "agents", "agent", "snapshots", "v1", "state.json"),
      "s",
    );
    await writeFile(
      path.join(root, "proj", "agents", "agent", "workspaces", "mine", "code.ts"),
      "s",
    );
    await backdate(root, 400);

    const ledger = await scanStorage(root, emptyLiveSet(), policy({ tmpIdleDays: 1 }));
    expect(ledger.candidates).toEqual([]);
    const protectedBytes = ledger.classes.find((c) => c.class === "protected")?.bytes ?? 0;
    expect(protectedBytes).toBeGreaterThan(0);
  });

  it("judges a temporary Workspace by reference first: a referenced one is never a candidate", async () => {
    const root = await scaffold();
    const ws = path.join(root, "proj", "agents", "agent", "workspaces", "tmp-abcd1234");
    await writeFile(path.join(ws, "deliverable.md"), "work");
    await backdate(ws, 90);

    // Referenced by a live Session: old, non-empty, still not a candidate.
    const referenced = await scanStorage(
      root,
      live({ workspacePaths: new Set([await fs.realpath(ws)]) }),
      policy({ tmpIdleDays: 1 }),
    );
    expect(referenced.candidates.filter((c) => c.class === "tmp_workspaces")).toEqual([]);
    expect(referenced.classes.find((c) => c.class === "tmp_workspaces")?.entries).toBe(1);

    // Nothing references it: unreferenced, and idle at a one-day threshold.
    const orphan = await scanStorage(root, emptyLiveSet(), policy({ tmpIdleDays: 1 }));
    const entry = orphan.candidates.find((c) => c.class === "tmp_workspaces");
    expect(entry?.rules).toEqual(["unreferenced", "idle"]);
    expect(entry?.referenced).toBe(false);
  });

  it("calls an unreferenced empty temporary Workspace `empty`, and still lists it as a candidate", async () => {
    const root = await scaffold();
    const ws = path.join(root, "proj", "agents", "agent", "workspaces", "tmp-empty");
    await fs.mkdir(ws, { recursive: true });

    const ledger = await scanStorage(root, emptyLiveSet(), policy({ tmpIdleDays: null }));
    expect(ledger.candidates.find((c) => c.class === "tmp_workspaces")?.rules).toEqual([
      "empty",
      "unreferenced",
    ]);
  });

  it("calls a draft directory whose Session is gone an orphan, and one whose Session is live not a candidate", async () => {
    const root = await scaffold();
    await writeFile(
      path.join(root, "proj", "agents", "agent", "scratchpad", "gone", "tmp.txt"),
      "x",
    );
    await writeFile(
      path.join(root, "proj", "agents", "agent", "scratchpad", "here", "tmp.txt"),
      "x",
    );

    const ledger = await scanStorage(root, live({ sessionIds: new Set(["here"]) }));
    const candidates = ledger.candidates.filter((c) => c.class === "session_drafts");
    expect(candidates.map((c) => c.path)).toEqual(["proj/agents/agent/scratchpad/gone"]);
    expect(candidates[0]?.rules).toEqual(["orphan"]);
  });

  it("judges a live Session's drafts idle only against that Session's own last activity", async () => {
    const root = await scaffold();
    await writeFile(path.join(root, "proj", "agents", "agent", "scratchpad", "s1", "tmp.txt"), "x");
    await backdate(path.join(root, "proj", "agents", "agent", "scratchpad", "s1"), 40);

    const active = await scanStorage(
      root,
      live({ sessionIds: new Set(["s1"]), sessionLastActiveMs: new Map([["s1", Date.now()]]) }),
      policy({ draftIdleDays: 30 }),
    );
    expect(active.candidates).toEqual([]);

    const stale = await scanStorage(
      root,
      live({
        sessionIds: new Set(["s1"]),
        sessionLastActiveMs: new Map([["s1", Date.now() - 60 * DAY_MS]]),
      }),
      policy({ draftIdleDays: 30 }),
    );
    expect(stale.candidates[0]?.rules).toEqual(["idle"]);
  });

  it("evicts a draft budget oldest-first and stops at the target, leaving the newest alone", async () => {
    const root = await scaffold();
    const drafts = path.join(root, "proj", "agents", "agent", "scratchpad");
    for (const [name, days] of [
      ["old", 30],
      ["middle", 20],
      ["new", 1],
    ] as const) {
      await writeFile(path.join(drafts, name, "blob.bin"), "x".repeat(1000));
      await backdate(path.join(drafts, name), days);
    }

    const ledger = await scanStorage(
      root,
      live({ sessionIds: new Set(["old", "middle", "new"]) }),
      policy({ draftBudgetBytes: 2000 }),
    );
    const byPath = new Map(ledger.candidates.map((c) => [c.path, c]));
    expect(byPath.get("proj/agents/agent/scratchpad/old")?.rules).toEqual(["budget"]);
    expect(byPath.has("proj/agents/agent/scratchpad/new")).toBe(false);
  });

  it("judges Trace days by silence and by budget, and reports both as candidates", async () => {
    const root = await scaffold();
    const traces = path.join(root, "proj", "agents", "agent", "traces");
    for (const [date, days] of [
      ["2026-01-01", 60],
      ["2026-02-01", 10],
    ] as const) {
      await writeFile(path.join(traces, date, "sess_000.jsonl"), "x".repeat(500));
      await backdate(path.join(traces, date), days);
    }

    const byAge = await scanStorage(root, emptyLiveSet(), policy({ traceIdleDays: 30 }));
    expect(byAge.candidates.map((c) => c.path)).toEqual(["proj/agents/agent/traces/2026-01-01"]);

    const byBudget = await scanStorage(root, emptyLiveSet(), policy({ traceBudgetBytes: 900 }));
    expect(byBudget.candidates.map((c) => c.path)).toEqual(["proj/agents/agent/traces/2026-01-01"]);
  });

  it("judges a shared environment idle only when Agent State does not mention its name", async () => {
    const root = await scaffold();
    const envs = path.join(root, "proj", "agents", "agent", "shared_env");
    await writeFile(path.join(envs, "playwright", "lib", "node"), "x");
    await writeFile(path.join(envs, "forgotten", "lib", "node"), "x");
    await backdate(envs, 120);
    await writeFile(
      path.join(root, "proj", "agents", "agent", "agent_state", "AGENTS.md"),
      "Always reuse shared_env/playwright for browsing.",
    );
    await backdate(path.join(root, "proj", "agents", "agent", "agent_state"), 120);

    const ledger = await scanStorage(root, emptyLiveSet(), policy({ sharedEnvIdleDays: 90 }));
    const candidates = ledger.candidates.filter((c) => c.class === "shared_env");
    expect(candidates.map((c) => c.path)).toEqual(["proj/agents/agent/shared_env/forgotten"]);
    // Both environments are still accounted for: judging one idle removes nothing from the ledger.
    expect(ledger.classes.find((c) => c.class === "shared_env")?.entries).toBe(2);
  });

  it("reports environments that look duplicated without making them candidates", async () => {
    const root = await scaffold();
    const envs = path.join(root, "proj", "agents", "agent", "shared_env");
    await writeFile(path.join(envs, "csu-mail", "lib", "a"), "xxxx");
    await writeFile(path.join(envs, "csumail", "lib", "a"), "yyyy");
    await writeFile(path.join(envs, "pw", "bin", "a"), "z");

    const ledger = await scanStorage(root, emptyLiveSet());
    expect(ledger.candidates.filter((c) => c.class === "shared_env")).toEqual([]);
    const byName = ledger.sharedEnvGroups.find((g) => g.kind === "name");
    expect(byName?.members).toEqual([
      "proj/agents/agent/shared_env/csu-mail",
      "proj/agents/agent/shared_env/csumail",
    ]);
    const byStructure = ledger.sharedEnvGroups.find((g) => g.kind === "structure");
    expect(byStructure?.members).toEqual(byName?.members);
  });

  it("reports a shared environment's marker when it has one", async () => {
    const root = await scaffold();
    const env = path.join(root, "proj", "agents", "agent", "shared_env", "browser");
    await writeFile(path.join(env, "lib", "a"), "x");
    await writeFile(
      path.join(env, ".adelie-env.json"),
      JSON.stringify({ name: "browser", purpose: "headless checks" }),
    );

    const ledger = await scanStorage(root, emptyLiveSet());
    expect(ledger.candidates).toEqual([]);
    const envs = ledger.classes.find((c) => c.class === "shared_env");
    expect(envs?.entries).toBe(1);
    expect(envs?.bytes).toBeGreaterThan(1);
  });

  it("defaults every threshold to off except the temporary-Workspace idle rule", async () => {
    const root = await scaffold();
    await writeFile(
      path.join(root, "proj", "agents", "agent", "workspaces", "tmp-old", "x.md"),
      "x",
    );
    await writeFile(path.join(root, "proj", "agents", "agent", "shared_env", "old", "a"), "x");
    await writeFile(path.join(root, "proj", "agents", "agent", "scratchpad", "s", "a"), "x");
    await writeFile(
      path.join(root, "proj", "agents", "agent", "traces", "2026-01-01", "s_0.jsonl"),
      "x",
    );
    await backdate(root, 500);

    // Age is the weakest rule the ledger has: what the defaults enable is exactly the two
    // classes whose candidates need no judgement about a Session's history — a temporary
    // Workspace nobody points at, and a draft directory whose Session is gone. Neither is a
    // threshold an operator has to set, because both are statements about references. Drafts
    // of *live* Sessions, Traces and environments stay out of the list until a policy names a
    // threshold, and a policy is what an operator writes.
    const ledger = await scanStorage(root, emptyLiveSet(), DEFAULT_STORAGE_POLICY);
    expect(ledger.candidates.map((c) => `${c.class}:${c.path}`)).toEqual([
      "tmp_workspaces:proj/agents/agent/workspaces/tmp-old",
      "session_drafts:proj/agents/agent/scratchpad/s",
    ]);
    expect(DEFAULT_STORAGE_POLICY.tmpIdleDays).toBe(30);
    expect(DEFAULT_STORAGE_POLICY.draftIdleDays).toBeNull();
    expect(DEFAULT_STORAGE_POLICY.draftBudgetBytes).toBeNull();
    expect(DEFAULT_STORAGE_POLICY.traceIdleDays).toBeNull();
    expect(DEFAULT_STORAGE_POLICY.traceBudgetBytes).toBeNull();
    expect(DEFAULT_STORAGE_POLICY.sharedEnvIdleDays).toBeNull();
  });

  it("caps the candidate list per class while the class totals stay exact", async () => {
    const root = await scaffold();
    const drafts = path.join(root, "proj", "agents", "agent", "scratchpad");
    for (const name of ["a", "b", "c"]) await writeFile(path.join(drafts, name, "f"), "x");

    const ledger = await scanStorage(root, emptyLiveSet(), policy({ maxCandidatesPerClass: 1 }));
    expect(ledger.candidates.filter((c) => c.class === "session_drafts")).toHaveLength(1);
    expect(ledger.classes.find((c) => c.class === "session_drafts")?.candidateEntries).toBe(3);
  });

  // A mode-000 directory is unreadable to the tests' own user but not to root, and CI runs as
  // an ordinary user while a developer's container often does not; on Windows the mode bits do
  // not remove read access at all. Skipping beats a test that passes for the wrong reason.
  // The expected path is the directory's realpath, because the scan walks the root's realpath
  // (on macOS a temp dir reaches it through /var → /private/var).
  it.skipIf(process.getuid?.() === 0 || process.platform === "win32")(
    "reports a directory it cannot read instead of throwing or guessing",
    async () => {
      const root = await scaffold();
      const sealed = path.join(root, "proj", "agents", "agent", "scratchpad", "sealed");
      await writeFile(path.join(sealed, "f"), "x");
      await fs.chmod(sealed, 0o000);
      try {
        const ledger = await scanStorage(root, emptyLiveSet());
        expect(ledger.unreadable).toContain(await fs.realpath(sealed));
        expect(ledger.classes.find((c) => c.class === "session_drafts")?.entries).toBe(1);
      } finally {
        await fs.chmod(sealed, 0o755);
      }
    },
  );

  it("adds the volume's own numbers, so a report can say how close the disk is", async () => {
    const root = await scaffold();
    const ledger = await scanStorage(root, emptyLiveSet());
    if (ledger.disk !== null) {
      expect(ledger.disk.totalBytes).toBeGreaterThan(0);
      expect(ledger.disk.freeBytes).toBeLessThanOrEqual(ledger.disk.totalBytes);
    }
    expect(ledger.root).toBe(await fs.realpath(root));
  });
});

/**
 * The bill a person reviews, and the two filesystem questions an apply asks before a move:
 * whether a recorded path may be touched at all, and whether it still measures as recorded.
 *
 * These are the properties the design's safety rules are made of, and all of them are pure
 * enough to pin here: the whitelist is a regular expression over the recorded path, the
 * containment rule is `realpath` against the root, and a fingerprint that ignores content is
 * exactly as strong as the drift it has to notice.
 */
describe("storage plan", () => {
  it("keeps the classes it may act on to the one whose move is reversible", () => {
    // Pinning the list, not describing it: widening it is a decision about consequences a
    // person did not get to read (an image URL that stops resolving, a replay with a hole).
    expect([...EXECUTABLE_STORAGE_CLASSES]).toEqual(["tmp_workspaces"]);
    expect(isExecutableStorageClass("tmp_workspaces")).toBe(true);
    expect(isExecutableStorageClass("session_drafts")).toBe(false);
    expect(isExecutableStorageClass("traces")).toBe(false);
    expect(isExecutableStorageClass("shared_env")).toBe(false);
    expect(isExecutableStorageClass("protected")).toBe(false);
  });

  it("only admits the recorded paths of an executable class", () => {
    const ok = "proj/agents/agent/workspaces/tmp-8e8a3ace";
    expect(isPlannablePath(ok, "tmp_workspaces")).toBe(true);
    // A Workspace that is not temporary is user data, whatever else is true of it.
    expect(isPlannablePath("proj/agents/agent/workspaces/mine", "tmp_workspaces")).toBe(false);
    // Nested below one, above one, or outside the layout: none of them is a temporary Workspace.
    expect(isPlannablePath(`${ok}/inner`, "tmp_workspaces")).toBe(false);
    expect(isPlannablePath("proj/agents/agent/workspaces", "tmp_workspaces")).toBe(false);
    expect(isPlannablePath("proj/agents/agent/agent_state", "tmp_workspaces")).toBe(false);
    // Escapes and host-specific forms are refused before any filesystem call.
    expect(isPlannablePath("../outside", "tmp_workspaces")).toBe(false);
    expect(isPlannablePath("proj/agents/agent/workspaces/tmp-x/../tmp-y", "tmp_workspaces")).toBe(
      false,
    );
    expect(isPlannablePath("proj//agents/agent/workspaces/tmp-x", "tmp_workspaces")).toBe(false);
    expect(isPlannablePath("/proj/agents/agent/workspaces/tmp-x", "tmp_workspaces")).toBe(false);
    expect(isPlannablePath("proj\\agents\\agent\\workspaces\\tmp-x", "tmp_workspaces")).toBe(false);
    // Nothing else has a prefix whitelist yet, so nothing else may be planned.
    expect(isPlannablePath("proj/agents/agent/scratchpad/s", "session_drafts")).toBe(false);
    expect(isPlannablePath("web.db", "database")).toBe(false);
  });

  it("resolves a planned path only inside the root, and only to a real directory", async () => {
    const root = await scaffold();
    const workspace = path.join(root, "proj", "agents", "agent", "workspaces", "tmp-one");
    await writeFile(path.join(workspace, "f.md"), "x");
    // Against the real path, not the one spelled above: the resolver answers with the realpath, and
    // a temporary directory is not its own realpath everywhere — macOS's `/var` is a link to
    // `/private/var`, and Windows hands out a short name for the user's own directory.
    expect(await resolveStorageEntry(root, "proj/agents/agent/workspaces/tmp-one")).toBe(
      await fs.realpath(workspace),
    );

    // A file, a missing path and a symlink are all refused: the first two have nothing to move,
    // and a link is the one way a move could take something from outside the root with it.
    expect(await resolveStorageEntry(root, "web.db")).toBeNull();
    expect(await resolveStorageEntry(root, "proj/agents/agent/workspaces/tmp-gone")).toBeNull();
    await fs.symlink(path.join(root, "proj", "agents"), path.join(root, "link-to-agents"));
    expect(await resolveStorageEntry(root, "link-to-agents/agent/workspaces/tmp-one")).toBeNull();
    // Lexical escapes never reach the filesystem.
    expect(await resolveStorageEntry(root, "../outside")).toBeNull();
    expect(await resolveStorageEntry(root, "/etc")).toBeNull();
  });

  it("follows the root's own realpath but refuses a link out of it", async () => {
    const outside = await tempRoot();
    await writeFile(
      path.join(outside, "proj", "agents", "agent", "workspaces", "tmp-out", "f"),
      "x",
    );
    const root = await scaffold();
    // A directory inside the root that is really somewhere else: `resolveStorageEntry` asks the
    // parent's realpath, so a linked Workspace directory cannot be planned.
    await fs.mkdir(path.join(root, "proj", "agents", "agent", "workspaces"), { recursive: true });
    await fs.symlink(
      path.join(outside, "proj", "agents", "agent", "workspaces", "tmp-out"),
      path.join(root, "proj", "agents", "agent", "workspaces", "tmp-out"),
    );
    expect(await resolveStorageEntry(root, "proj/agents/agent/workspaces/tmp-out")).toBeNull();
  });

  it("builds a bill from the candidates, leaving pinned paths out of it entirely", async () => {
    const root = await scaffold();
    await writeFile(path.join(root, "proj", "agents", "agent", "workspaces", "tmp-a", "f"), "x");
    await writeFile(path.join(root, "proj", "agents", "agent", "scratchpad", "s", "f"), "x");
    const ledger = await scanStorage(root, emptyLiveSet());
    const pinned = "proj/agents/agent/workspaces/tmp-a";

    const plan = buildStoragePlan(ledger, {
      id: "2026-01-01-00-00-00-aaaaaa",
      nowMs: 1_767_225_600_000,
      pins: new Set([pinned]),
    });

    // The draft directory stays on the bill (report-only, but it is what a person should see);
    // the pinned Workspace does not — that is the whole meaning of a pin.
    expect(plan.entries.map((e) => e.path)).toEqual(["proj/agents/agent/scratchpad/s"]);
    expect(plan.excluded).toEqual([pinned]);
    expect(plan.totalBytes).toBe(plan.entries.reduce((sum, entry) => sum + entry.bytes, 0));
    expect(plan.expiresAtMs - plan.createdAtMs).toBe(STORAGE_PLAN_TTL_MS);
    // Only the executable class is selected by "all of them", which is what the button means.
    expect(planDefaultSelection(plan)).toEqual([]);

    // The same ledger without the pin: both candidates are on the bill, and "all of them"
    // selects exactly the temporary Workspace — the draft list stays visible but unselectable.
    const open = buildStoragePlan(ledger, { id: "2026-01-01-00-00-00-bbbbbb", nowMs: 0 });
    expect(open.entries.map((e) => e.path)).toEqual([
      "proj/agents/agent/workspaces/tmp-a",
      "proj/agents/agent/scratchpad/s",
    ]);
    expect(open.excluded).toEqual([]);
    expect(planDefaultSelection(open)).toEqual(["proj/agents/agent/workspaces/tmp-a"]);
  });

  it("fingerprints what a bill said, and notices a tree that changed or vanished", async () => {
    const root = await scaffold();
    const workspace = path.join(root, "proj", "agents", "agent", "workspaces", "tmp-drift");
    await writeFile(path.join(workspace, "f.md"), "one");
    const ledger = await scanStorage(root, emptyLiveSet());
    const plan = buildStoragePlan(ledger, { id: "p", nowMs: Date.now() });
    const entry = plan.entries[0];
    expect(entry).toBeDefined();
    if (entry === undefined) return;

    const fingerprint = planEntryFingerprint(entry);
    expect(fingerprint).toBe(entry.fingerprint);
    expect(plan.fingerprint).toBe(planFingerprint(plan.entries));

    const measured = async (): Promise<string> => {
      const now = await measureStorageEntry(workspace);
      return planEntryFingerprint({
        path: entry.path,
        bytes: now?.bytes ?? 0,
        newestMtimeMs: now?.newestMtimeMs ?? 0,
      });
    };
    expect(await measured()).toBe(entry.fingerprint);

    // A write inside the tree — the drift an approval must not slide past.
    await writeFile(path.join(workspace, "second.md"), "two");
    expect(await measured()).not.toBe(entry.fingerprint);
    // And a tree that is gone measures as nothing at all, rather than as an empty one.
    await fs.rm(workspace, { recursive: true, force: true });
    expect(await measureStorageEntry(workspace)).toBeNull();
  });

  it("names a plan id after the moment of the scan, so ids sort by time", () => {
    const id = storagePlanId(Date.UTC(2026, 9, 10, 13, 5, 22), "4f2a");
    // Local time, so the minutes and seconds are what a clock in this time zone showed; the
    // date part is what makes a directory listing read chronologically.
    expect(id).toMatch(/^2026-10-\d\d-\d\d-\d\d-22-4f2a$/);
    expect(storageTrashId(Date.UTC(2026, 9, 10, 13, 5, 22))).toMatch(/^2026\d{4}-\d{6}$/);
  });
});
