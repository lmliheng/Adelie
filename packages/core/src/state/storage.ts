/**
 * The data root's storage ledger — what is on disk, what it is for, and what migh be
 * removable.
 *
 * This module is the **single definition point of the cleanup vocabulary** and it is
 * deliberately pure: it walks a data root and reports, and it never moves or deletes
 * anything. Every destructive action lives in the server's storage service, so the
 * ledger can be produced by the CLI on a machine whose server is not running, and both
 * callers can never disagree about what a class means.
 *
 * Two ideas carry the whole design:
 *
 * - **A class is a rule about provenance, not a directory name.** `protected` is user
 *   data (Agent State, Project config, a Workspace the user chose, user vaults, plugins,
 *   benchmarks, snapshots); everything else is derived — a temporary Workspace, a
 *   Session's drafts, a Trace shard, an environment the model built for itself. Nothing
 *   in the first group is ever reported as a candidate.
 * - **A candidate is a claim, never an action.** An entry carries the rules it matched
 *   (`empty`, `unreferenced`, `orphan`, `idle`, `budget`) and whether it is still
 *   referenced; the caller reviews that list and decides. `referenced` is recomputed
 *   from live state by the caller at execution time, so a stale ledger can never be
 *   used to delete something that came alive in between.
 *
 * Liveness is an **input**, not something this module can discover: which Sessions still
 * exist is a database question, and the database is the server's. `StorageLiveSet` is
 * what the caller must supply, and an empty one means "nothing is referenced", which is
 * why `emptyLiveSet()` is separate and named rather than a default argument.
 *
 * Cost: one walk of the root, `lstat` per file, no file contents read — except the
 * `agent_state` text scan that the shared-environment text guard needs, which runs only
 * when a policy enables the idle rule for that class and only for the one Agent whose
 * environment is being judged.
 *
 * The numbers are **apparent sizes** (`st_size`), not allocated blocks, so a tree of many
 * small files weighs less here than `du` reports for it — on the install this was written
 * against, 5.4G of apparent size against `du`'s 6.0G, the difference being filesystem
 * block rounding across ~100k files. A report is a map of what is there and what it is
 * for; it is not a substitute for `df`, which is why the volume's own numbers ride along.
 */
import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

/** The classes the ledger accounts for. Every byte under the root lands in exactly one. */
export const STORAGE_CLASSES = [
  "protected",
  "tmp_workspaces",
  "session_drafts",
  "traces",
  "shared_env",
  "trash",
  "database",
  "other",
] as const;

export type StorageClass = (typeof STORAGE_CLASSES)[number];

/**
 * What a candidate matched. `empty` and `unreferenced` belong to temporary Workspaces,
 * `orphan` to a Session's drafts, `idle` to anything judged by silence, and `budget` to
 * anything evicted by a size cap (oldest first).
 */
export type CandidateRule = "empty" | "unreferenced" | "orphan" | "idle" | "budget";

/**
 * Thresholds. **Every one of them defaults to off** (`null`) except the temporary
 * Workspace idle rule, whose candidate list is the least ambiguous thing the ledger can
 * produce — and even that only lists.
 *
 * The defaults are off on purpose and for a measured reason: on the install this was
 * designed against, the data root was ten days old, so an age-based rule reported zero
 * bytes of anything older than thirty days while the root had grown to 6.0G. Age is a
 * slow lever; the ledger's value is that it names the fast ones (references, budgets,
 * duplicate environments) instead of pretending timestamps will save the disk.
 */
export interface StoragePolicy {
  /** A temporary Workspace no Session references and untouched for this long. */
  tmpIdleDays: number | null;
  /** A draft directory whose Session has been silent for this long. */
  draftIdleDays: number | null;
  /** Per-Agent draft budget; exceeding it evicts the oldest drafts down to 70%. */
  draftBudgetBytes: number | null;
  /** A Trace date directory older than this. */
  traceIdleDays: number | null;
  /** Per-Agent Trace budget; exceeding it evicts the oldest date directories down to 70%. */
  traceBudgetBytes: number | null;
  /** A shared environment untouched for this long **and** unmentioned in Agent State. */
  sharedEnvIdleDays: number | null;
  /** Candidates kept per class in the returned list (the per-class totals stay exact). */
  maxCandidatesPerClass: number;
}

export const DEFAULT_STORAGE_POLICY: StoragePolicy = {
  tmpIdleDays: 30,
  draftIdleDays: null,
  draftBudgetBytes: null,
  traceIdleDays: null,
  traceBudgetBytes: null,
  sharedEnvIdleDays: null,
  maxCandidatesPerClass: 200,
};

/** Bytes a budget rule evicts down to, so a single run does not empty the class. */
const BUDGET_EVICTION_TARGET = 0.7;

/** What the caller must know about live state for the ledger to be meaningful. */
export interface StorageLiveSet {
  /** Session ids that still exist (the draft-directory test). */
  sessionIds: ReadonlySet<string>;
  /** Real paths of the Workspaces live Sessions still point at (the temporary-Workspace test). */
  workspacePaths: ReadonlySet<string>;
  /** Session id -> last activity, epoch ms (the draft idle test). */
  sessionLastActiveMs: ReadonlyMap<string, number>;
}

/** A live set that claims nothing is referenced — named, so passing it is always a decision. */
export function emptyLiveSet(): StorageLiveSet {
  return { sessionIds: new Set(), workspacePaths: new Set(), sessionLastActiveMs: new Map() };
}

/** One accounted thing: a temporary Workspace, a Session's drafts, a Trace day, an environment. */
export interface StorageEntry {
  /** Path relative to the data root, `/`-separated (what a plan and a pin record). */
  path: string;
  class: StorageClass;
  bytes: number;
  files: number;
  /** Newest modification inside the entry, epoch ms; 0 when nothing could be stat'd. */
  newestMtimeMs: number;
  /** Whether live state still points at this entry (a Workspace a Session uses, a Session's drafts). */
  referenced: boolean;
  /** Rules this entry matched; empty means it is not a candidate. */
  rules: CandidateRule[];
  /** For `shared_env`: the environment's own marker was found (see `.adelie-env.json`). */
  marked?: boolean;
  /** Subdirectories unreadable while measuring; the entry is still reported with what was read. */
  unreadable: number;
}

export interface StorageClassReport {
  class: StorageClass;
  bytes: number;
  files: number;
  entries: number;
  candidateEntries: number;
  candidateBytes: number;
}

/**
 * Environments that look like the same toolchain installed more than once. Report only:
 * the remedy is a merge a person triggers, never a deletion, because two environments
 * that look alike may be at different versions and only one of them may work.
 */
export interface SharedEnvGroup {
  kind: "name" | "structure";
  /** The normalized name or the structure signature the members share. */
  key: string;
  /** Relative paths, largest first. */
  members: string[];
  bytes: number;
}

export interface StorageLedger {
  root: string;
  scannedAtMs: number;
  /** Sum of every entry, i.e. what the classification accounts for. */
  totalBytes: number;
  classes: StorageClassReport[];
  /** Candidates, largest first, capped per class; the class totals above stay exact. */
  candidates: StorageEntry[];
  /** Duplicate-looking environments; never candidates. */
  sharedEnvGroups: SharedEnvGroup[];
  /** Disk facts beside the ledger, so a report can say how close the volume is. */
  disk: { freeBytes: number; totalBytes: number } | null;
  /** Paths that could not be read (capped); a report says so rather than guessing. */
  unreadable: string[];
}

interface Measured {
  bytes: number;
  files: number;
  newestMtimeMs: number;
  /** Immediate subdirectory names (for the environment structure signature). */
  topLevel: string[];
  unreadable: number;
}

const UNREADABLE_REPORT_CAP = 20;
const STATE_TEXT_READ_CAP_BYTES = 8 * 1024 * 1024;

/** `realpath` with a fallback that still yields a stable absolute path for a vanished entry. */
async function realPathOrResolve(p: string): Promise<string> {
  try {
    return await fs.realpath(p);
  } catch {
    return path.resolve(p);
  }
}

/** Measures one file or directory tree. Symlinks are counted as entries and never followed. */
async function measure(target: string, unreadable: string[]): Promise<Measured> {
  let bytes = 0;
  let files = 0;
  let newest = 0;
  let bad = 0;
  const topLevel: string[] = [];

  const note = (p: string): void => {
    if (unreadable.length < UNREADABLE_REPORT_CAP) unreadable.push(p);
  };

  const visit = async (dir: string, depth: number): Promise<void> => {
    let children;
    try {
      children = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      bad += 1;
      note(dir);
      return;
    }
    if (depth === 0) for (const c of children) topLevel.push(c.name);
    for (const child of children) {
      const full = path.join(dir, child.name);
      let st;
      try {
        st = await fs.lstat(full);
      } catch {
        bad += 1;
        note(full);
        continue;
      }
      if (st.mtimeMs > newest) newest = st.mtimeMs;
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) await visit(full, depth + 1);
      else if (st.isFile()) {
        bytes += st.size;
        files += 1;
      }
    }
  };

  let st;
  try {
    st = await fs.lstat(target);
  } catch {
    return { bytes: 0, files: 0, newestMtimeMs: 0, topLevel, unreadable: bad };
  }
  if (st.isDirectory()) {
    const dirSt = st;
    if (dirSt.mtimeMs > newest) newest = dirSt.mtimeMs;
    await visit(target, 0);
  } else if (st.isFile()) {
    bytes = st.size;
    files = 1;
    if (st.mtimeMs > newest) newest = st.mtimeMs;
  }
  return { bytes, files, newestMtimeMs: newest, topLevel, unreadable: bad };
}

/** The relative, `/`-separated form of a path under the root — what a plan records. */
function relativeTo(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join("/");
}

function ageDays(newestMtimeMs: number, nowMs: number): number {
  if (newestMtimeMs <= 0) return 0;
  return (nowMs - newestMtimeMs) / 86_400_000;
}

/** A name with case, separators and punctuation removed: `csu-mail` and `csumail` collide. */
function normalizedEnvName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** A structure signature: what the environment holds at its top level, and how many files. */
function envStructureKey(measured: Measured): string {
  const names = [...measured.topLevel].sort().join(",");
  const bucket = measured.files < 100 ? "s" : measured.files < 10_000 ? "m" : "l";
  return `${names}|${bucket}`;
}

/** Collector for one scan; holds the aggregates the report is built from and nothing else. */
class Ledger {
  readonly entries: StorageEntry[] = [];
  readonly unreadable: string[] = [];

  constructor(private readonly root: string) {}

  entry(
    target: string,
    classKey: StorageClass,
    measured: Measured,
    options: { referenced?: boolean; rules?: CandidateRule[]; marked?: boolean } = {},
  ): StorageEntry {
    const entry: StorageEntry = {
      path: relativeTo(this.root, target),
      class: classKey,
      bytes: measured.bytes,
      files: measured.files,
      newestMtimeMs: measured.newestMtimeMs,
      referenced: options.referenced ?? false,
      rules: options.rules ?? [],
      unreadable: measured.unreadable,
      ...(options.marked !== undefined ? { marked: options.marked } : {}),
    };
    this.entries.push(entry);
    return entry;
  }

  async readdir(dir: string): Promise<Dirent[]> {
    try {
      return await fs.readdir(dir, { withFileTypes: true });
    } catch {
      if (this.unreadable.length < UNREADABLE_REPORT_CAP) this.unreadable.push(dir);
      return [];
    }
  }

  async fileExists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }
}

/** All text under an Agent's `agent_state`, so the environment name guard is one pass per Agent. */
async function readAgentStateText(agentState: string): Promise<string | null> {
  const parts: string[] = [];
  let budget = STATE_TEXT_READ_CAP_BYTES;
  const visit = async (dir: string): Promise<void> => {
    let children;
    try {
      children = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const child of children) {
      if (budget <= 0) return;
      const full = path.join(dir, child.name);
      if (child.isDirectory()) {
        await visit(full);
        continue;
      }
      if (!child.isFile()) continue;
      let st;
      try {
        st = await fs.lstat(full);
      } catch {
        continue;
      }
      if (st.size > budget) continue;
      try {
        parts.push(await fs.readFile(full, "utf8"));
        budget -= st.size;
      } catch {
        // A file that vanished between readdir and read is simply not part of the text.
      }
    }
  };
  try {
    await visit(agentState);
  } catch {
    return null;
  }
  return parts.join("\n");
}

/**
 * Walks `root` and reports what it found. Pure with respect to the data root: reads only,
 * and an entry that cannot be read is counted as unknown rather than assumed empty.
 */
export async function scanStorage(
  root: string,
  live: StorageLiveSet,
  policy: StoragePolicy = DEFAULT_STORAGE_POLICY,
  nowMs: number = Date.now(),
): Promise<StorageLedger> {
  const realRoot = await realPathOrResolve(root);
  const ledger = new Ledger(realRoot);
  const stateTextCache = new Map<string, string | null>();
  const sharedEnvGroups: SharedEnvGroup[] = [];

  const measured = (target: string): Promise<Measured> => measure(target, ledger.unreadable);

  /** One Agent's shared environments: judged by silence only when the policy asks for it. */
  const scanSharedEnv = async (envRoot: string, agentState: string): Promise<void> => {
    const children = await ledger.readdir(envRoot);
    const byName = new Map<string, StorageEntry[]>();
    const byStructure = new Map<string, StorageEntry[]>();
    for (const child of children) {
      if (!child.isDirectory()) continue;
      const full = path.join(envRoot, child.name);
      const m = await measured(full);
      const marked = await ledger.fileExists(path.join(full, ".adelie-env.json"));
      const rules: CandidateRule[] = [];
      if (
        policy.sharedEnvIdleDays !== null &&
        ageDays(m.newestMtimeMs, nowMs) > policy.sharedEnvIdleDays
      ) {
        if (!stateTextCache.has(agentState)) {
          stateTextCache.set(agentState, await readAgentStateText(agentState));
        }
        const text = stateTextCache.get(agentState) ?? "";
        const mentionedInState = text.includes(child.name);
        const mentionedInWorkspaces = [...live.workspacePaths].some((w) => w.includes(child.name));
        if (!mentionedInState && !mentionedInWorkspaces) rules.push("idle");
      }
      const entry = ledger.entry(full, "shared_env", m, { rules, marked });
      const nameKey = normalizedEnvName(child.name);
      const nameBucket = byName.get(nameKey);
      if (nameBucket === undefined) byName.set(nameKey, [entry]);
      else nameBucket.push(entry);
      const structureKey = envStructureKey(m);
      const structureBucket = byStructure.get(structureKey);
      if (structureBucket === undefined) byStructure.set(structureKey, [entry]);
      else structureBucket.push(entry);
    }
    for (const [key, members] of byName) {
      if (members.length < 2) continue;
      sharedEnvGroups.push({
        kind: "name",
        key,
        members: members.map((m) => m.path).sort(),
        bytes: members.reduce((sum, m) => sum + m.bytes, 0),
      });
    }
    for (const [key, members] of byStructure) {
      if (members.length < 2) continue;
      sharedEnvGroups.push({
        kind: "structure",
        key,
        members: members.map((m) => m.path).sort(),
        bytes: members.reduce((sum, m) => sum + m.bytes, 0),
      });
    }
  };

  /** One Agent's drafts, with the orphan and idle rules and the optional budget eviction. */
  const scanDrafts = async (draftRoot: string): Promise<StorageEntry[]> => {
    const entries: StorageEntry[] = [];
    for (const child of await ledger.readdir(draftRoot)) {
      if (!child.isDirectory()) continue;
      const full = path.join(draftRoot, child.name);
      const m = await measured(full);
      const referenced = live.sessionIds.has(child.name);
      const rules: CandidateRule[] = [];
      if (!referenced) rules.push("orphan");
      else if (policy.draftIdleDays !== null) {
        const last = live.sessionLastActiveMs.get(child.name);
        if (last !== undefined && ageDays(last, nowMs) > policy.draftIdleDays) rules.push("idle");
      }
      entries.push(ledger.entry(full, "session_drafts", m, { referenced, rules }));
    }
    if (policy.draftBudgetBytes !== null) {
      const total = entries.reduce((sum, e) => sum + e.bytes, 0);
      if (total > policy.draftBudgetBytes) {
        const target = policy.draftBudgetBytes * BUDGET_EVICTION_TARGET;
        let running = total;
        for (const entry of [...entries].sort((a, b) => a.newestMtimeMs - b.newestMtimeMs)) {
          if (running <= target) break;
          if (entry.rules.includes("orphan")) continue;
          entry.rules.push("budget");
          running -= entry.bytes;
        }
      }
    }
    return entries;
  };

  /** One Agent's Trace days, with the idle rule and the optional budget eviction. */
  const scanTraces = async (traceRoot: string): Promise<StorageEntry[]> => {
    const entries: StorageEntry[] = [];
    for (const child of await ledger.readdir(traceRoot)) {
      if (!child.isDirectory()) continue;
      const full = path.join(traceRoot, child.name);
      const m = await measured(full);
      const rules: CandidateRule[] = [];
      if (policy.traceIdleDays !== null && ageDays(m.newestMtimeMs, nowMs) > policy.traceIdleDays) {
        rules.push("idle");
      }
      entries.push(ledger.entry(full, "traces", m, { rules }));
    }
    if (policy.traceBudgetBytes !== null) {
      const total = entries.reduce((sum, e) => sum + e.bytes, 0);
      if (total > policy.traceBudgetBytes) {
        const target = policy.traceBudgetBytes * BUDGET_EVICTION_TARGET;
        let running = total;
        for (const entry of [...entries].sort((a, b) => a.newestMtimeMs - b.newestMtimeMs)) {
          if (running <= target) break;
          if (!entry.rules.includes("idle")) entry.rules.push("budget");
          running -= entry.bytes;
        }
      }
    }
    return entries;
  };

  for (const top of await ledger.readdir(realRoot)) {
    const full = path.join(realRoot, top.name);
    if (!top.isDirectory()) {
      // Root-level files: the database and its sidecars are accounted for as such, and
      // anything else (the API token, the install id, the server lock) is `other` — small,
      // but named, so the classification stays complete rather than nearly so.
      const classKey: StorageClass =
        top.name === "web.db" || top.name.startsWith("web.db-") ? "database" : "other";
      ledger.entry(full, classKey, await measured(full));
      continue;
    }
    if (top.name === ".trash") {
      for (const child of await ledger.readdir(full)) {
        ledger.entry(
          path.join(full, child.name),
          "trash",
          await measured(path.join(full, child.name)),
        );
      }
      continue;
    }
    if (top.name === "users" || top.name === "plugins") {
      ledger.entry(full, "protected", await measured(full));
      continue;
    }
    const agents = path.join(full, "agents");
    if (!(await ledger.fileExists(agents))) {
      ledger.entry(full, "other", await measured(full));
      continue;
    }
    // A Project directory: `agents/` is walked Agent by Agent, and everything beside it
    // (`benchmarks/`, the Project config) is user data.
    for (const child of await ledger.readdir(full)) {
      if (child.name === "agents") continue;
      ledger.entry(
        path.join(full, child.name),
        "protected",
        await measured(path.join(full, child.name)),
      );
    }
    for (const agent of await ledger.readdir(agents)) {
      if (!agent.isDirectory()) continue;
      const agentRoot = path.join(agents, agent.name);
      const agentState = path.join(agentRoot, "agent_state");
      for (const child of await ledger.readdir(agentRoot)) {
        const childPath = path.join(agentRoot, child.name);
        if (!child.isDirectory()) {
          ledger.entry(childPath, "other", await measured(childPath));
          continue;
        }
        switch (child.name) {
          case "agent_state":
          case "snapshots":
            ledger.entry(childPath, "protected", await measured(childPath));
            break;
          case "scratchpad":
            await scanDrafts(childPath);
            break;
          case "traces":
            await scanTraces(childPath);
            break;
          case "shared_env":
            await scanSharedEnv(childPath, agentState);
            break;
          case "workspaces": {
            for (const ws of await ledger.readdir(childPath)) {
              const wsPath = path.join(childPath, ws.name);
              const m = await measured(wsPath);
              const isTemp = ws.name.startsWith("tmp-");
              if (!isTemp) {
                ledger.entry(wsPath, "protected", m, { referenced: true });
                continue;
              }
              const referenced = live.workspacePaths.has(await realPathOrResolve(wsPath));
              const rules: CandidateRule[] = [];
              if (!referenced && m.files === 0) rules.push("empty");
              if (!referenced) {
                rules.push("unreferenced");
                if (
                  policy.tmpIdleDays !== null &&
                  ageDays(m.newestMtimeMs, nowMs) > policy.tmpIdleDays
                ) {
                  rules.push("idle");
                }
              }
              ledger.entry(wsPath, "tmp_workspaces", m, { referenced, rules });
            }
            break;
          }
          default:
            ledger.entry(childPath, "other", await measured(childPath));
        }
      }
    }
  }

  // Aggregate. Every entry is in exactly one class, so the totals sum to the root's own size.
  const classes: StorageClassReport[] = STORAGE_CLASSES.map((classKey) => {
    const own = ledger.entries.filter((e) => e.class === classKey);
    const candidates = own.filter((e) => e.rules.length > 0);
    return {
      class: classKey,
      bytes: own.reduce((sum, e) => sum + e.bytes, 0),
      files: own.reduce((sum, e) => sum + e.files, 0),
      entries: own.length,
      candidateEntries: candidates.length,
      candidateBytes: candidates.reduce((sum, e) => sum + e.bytes, 0),
    };
  });

  const candidates: StorageEntry[] = [];
  for (const classKey of STORAGE_CLASSES) {
    const own = ledger.entries
      .filter((e) => e.class === classKey && e.rules.length > 0)
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, policy.maxCandidatesPerClass);
    candidates.push(...own);
  }

  return {
    root: realRoot,
    scannedAtMs: nowMs,
    totalBytes: ledger.entries.reduce((sum, e) => sum + e.bytes, 0),
    classes,
    candidates,
    sharedEnvGroups: sharedEnvGroups.sort((a, b) => b.bytes - a.bytes),
    disk: await diskFacts(realRoot),
    unreadable: ledger.unreadable,
  };
}

/** Whether `target` is `root` itself or something below it. Lexical: both sides are absolute. */
export function isInsideRoot(root: string, target: string): boolean {
  const resolved = path.resolve(target);
  const base = path.resolve(root);
  return resolved === base || resolved.startsWith(base + path.sep);
}

/**
 * Where a planned entry actually is, or null when it may not be touched. Four refusals, in
 * the order the design's guardrails ask for them: a path with `..` or an absolute form is
 * refused lexically before any filesystem call; the target must be a real directory rather
 * than a symlink; it must resolve inside the root; and its realpath must be the path itself,
 * so no directory above it is a link either.
 *
 * The last one is stricter than containment needs and is the version that is easy to state:
 * a tree is moved only from exactly where the bill recorded it. A link anywhere in the chain
 * means the recorded path and the real one disagree, and a person reading the bill was looking
 * at the wrong sentence — a case worth refusing rather than interpreting. A root reached
 * through a symlinked parent (a home on macOS reaches its data through `/var`) is unaffected:
 * both sides of the comparison are under the root's own realpath.
 *
 * Resolution is per call and never cached: what it answers is exactly the thing that can have
 * changed since the scan, and a stale answer here is a move of the wrong thing.
 */
export async function resolveStorageEntry(
  root: string,
  relativePath: string,
): Promise<string | null> {
  if (relativePath === "" || relativePath.startsWith("/") || relativePath.includes("\\")) {
    return null;
  }
  if (relativePath.split("/").some((segment) => segment === "" || segment === "..")) return null;
  const realRoot = await realPathOrResolve(root);
  const target = path.join(realRoot, ...relativePath.split("/"));
  if (!isInsideRoot(realRoot, target)) return null;
  let st;
  try {
    st = await fs.lstat(target);
  } catch {
    return null;
  }
  if (st.isSymbolicLink() || !st.isDirectory()) return null;
  if ((await realPathOrResolve(target)) !== target) return null;
  return target;
}

/**
 * Measures one entry again, the same way the scan measured it, so an approval can be checked
 * against the disk as it is now rather than as the scan found it. Null when the entry is
 * gone — which is drift too, not a silently empty tree.
 */
export async function measureStorageEntry(
  target: string,
): Promise<{ bytes: number; files: number; newestMtimeMs: number } | null> {
  try {
    await fs.lstat(target);
  } catch {
    return null;
  }
  const measured = await measure(target, []);
  return { bytes: measured.bytes, files: measured.files, newestMtimeMs: measured.newestMtimeMs };
}

// ---------------------------------------------------------------------------
// From candidate to executed: the plan a person approves
// ---------------------------------------------------------------------------
/**
 * The classes a cleanup may actually move in this version. One class at a time, on purpose:
 * a temporary Workspace is the entry whose whole premise is that nobody points at it, so a
 * move can be undone by a rename and nothing in a running Session notices. Drafts, Traces and
 * environments each carry a consequence a person must weigh (an image URL in an old message
 * stops resolving, a replay loses its shard, a toolchain has to be installed again), and every
 * one of them deserves its own review rather than riding along with the first switch that
 * happens to exist. Classes outside this list are reported and planned, never applied.
 */
export const EXECUTABLE_STORAGE_CLASSES: readonly StorageClass[] = ["tmp_workspaces"];

export function isExecutableStorageClass(classKey: StorageClass): boolean {
  return EXECUTABLE_STORAGE_CLASSES.includes(classKey);
}

/** Short hex digest, for the fingerprints a plan records. Not a security boundary. */
function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * A temporary Workspace's recorded path: `<project>/agents/<agent>/workspaces/tmp-<suffix>`.
 * Anchored, one path segment per level, so a plan file edited by hand (or written by an older
 * version) cannot name `../..`, a nested path inside a Workspace, or a Workspace that is not
 * temporary.
 */
const TEMP_WORKSPACE_PATH = /^[^/]+\/agents\/[^/]+\/workspaces\/tmp-[^/]+$/;

/**
 * Whether a recorded path is one this class may act on at all — the prefix whitelist of the
 * design's safety rules, applied to the `/`-separated relative paths a plan records. Purely
 * lexical: whether the path escapes the root through a symlink is a filesystem question the
 * server answers with `realpath`, and it asks this first so a plan that was tampered with is
 * refused before anything is stat'd.
 */
export function isPlannablePath(relativePath: string, classKey: StorageClass): boolean {
  if (relativePath === "" || relativePath.startsWith("/") || relativePath.includes("\\")) {
    return false;
  }
  if (relativePath.split("/").some((segment) => segment === "" || segment === "..")) return false;
  switch (classKey) {
    case "tmp_workspaces":
      return TEMP_WORKSPACE_PATH.test(relativePath);
    default:
      // Nothing else is executable yet, so nothing else has a prefix to be checked against —
      // and answering `true` here would be a whitelist that whitelists everything.
      return false;
  }
}

/**
 * How long an approved-but-unexecuted plan stays valid. A day is long enough to review a bill
 * over lunch and short enough that a plan stopped describing the disk a week ago by the time
 * somebody presses the button; the design asks for exactly this bound, after which the answer
 * is a fresh scan rather than a guess.
 */
export const STORAGE_PLAN_TTL_MS = 24 * 60 * 60 * 1000;

/** One line of a bill: a candidate, and everything needed to prove it has not changed since. */
export interface StoragePlanEntry {
  /** Path relative to the root, `/`-separated — what was measured and what a move would name. */
  path: string;
  class: StorageClass;
  bytes: number;
  files: number;
  /** Newest modification inside the entry at scan time, epoch ms (0 = nothing could be stat'd). */
  newestMtimeMs: number;
  rules: CandidateRule[];
  /**
   * The entry as it was measured, as one short hash. Re-measured before a move: a mismatch
   * means the tree grew, shrank or was touched after the person read the bill, and the answer
   * is a new scan — never a partial cleanup of something nobody reviewed.
   */
  fingerprint: string;
}

/**
 * A scan's output, as a file a person reviews: what could go, why, and how big it is. Written
 * by the server, read by the page and the CLI, and **used once** — `appliedAtMs` is the whole
 * one-shot rule, so an approval cannot be replayed against a disk that has moved on.
 */
export interface StoragePlan {
  id: string;
  /** The real path of the root the scan walked. */
  root: string;
  createdAtMs: number;
  expiresAtMs: number;
  /** Hash over the entries, in order — what an approval quotes back to prove it read this one. */
  fingerprint: string;
  /** Sum of `entries`, i.e. what this bill accounts for (not the root's size). */
  totalBytes: number;
  entries: StoragePlanEntry[];
  /** Paths a pin kept out of the bill — why a candidate the report shows is missing from it. */
  excluded: string[];
  /** When an apply ran; a plan is valid until then. */
  appliedAtMs?: number;
  /** The paths that apply actually moved. */
  appliedPaths?: string[];
}

/** The local-time parts of an instant, for the names a person reads in a directory listing. */
function localStamp(nowMs: number): {
  date: string;
  time: string;
  compact: string;
} {
  const at = new Date(nowMs);
  const pad = (n: number): string => String(n).padStart(2, "0");
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  const time = `${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}`;
  return { date, time, compact: `${date.replace(/-/g, "")}-${time.replace(/-/g, "")}` };
}

/**
 * A plan id: `2026-10-10-13-05-22-4f2a` — the moment of the scan plus a suffix that keeps two
 * apart, in the machine's own local time because this name is read by a person looking at the
 * directory (or at a bill's header) rather than parsed. Ids of the same shape sort by time as
 * strings, which is all the plan list needs.
 */
export function storagePlanId(nowMs: number, suffix: string): string {
  const stamp = localStamp(nowMs);
  return `${stamp.date}-${stamp.time}-${suffix}`;
}

/**
 * A trash entry's id: `20261010-130522`, the moment of the run. Folders, not files, so the
 * compact form reads better in a listing; a collision (two runs inside one second, which the
 * single-writer rule should prevent anyway) is resolved by the caller appending a counter.
 */
export function storageTrashId(nowMs: number): string {
  return localStamp(nowMs).compact;
}

/**
 * One entry's fingerprint: what the bill said about this tree, in one short hash. Size and
 * newest mtime rather than a walk of every file — a plan names hundreds of trees and hashing
 * their contents would cost more than the cleanup saves — and both change when a tree is
 * written to, which is the drift an approval has to notice.
 */
export function planEntryFingerprint(entry: {
  path: string;
  bytes: number;
  newestMtimeMs: number;
}): string {
  return hash(`${entry.path}\n${entry.bytes}\n${Math.round(entry.newestMtimeMs)}`).slice(0, 32);
}

/** The whole bill's fingerprint, over its entries in order. */
export function planFingerprint(entries: readonly StoragePlanEntry[]): string {
  return hash(entries.map((entry) => entry.fingerprint).join("\n")).slice(0, 32);
}

/** The plan's entries this version may act on — what "全选本类" means, said once, in core. */
export function planDefaultSelection(plan: StoragePlan): string[] {
  return plan.entries.filter((entry) => isExecutableStorageClass(entry.class)).map((e) => e.path);
}

/**
 * Turns a ledger's candidates into a bill. Pure: the pins are an argument, the id is an
 * argument, and the clock is an argument — the file it becomes is the server's business.
 *
 * Pinned paths are left out entirely (the design's "pin 过的东西不再出现在任何账单里"), which is
 * why the pin list is applied here rather than filtered out again at each call site: one place
 * decides what a person may be asked about.
 */
export function buildStoragePlan(
  ledger: StorageLedger,
  options: { id: string; nowMs: number; pins?: ReadonlySet<string>; ttlMs?: number },
): StoragePlan {
  const pins = options.pins ?? new Set<string>();
  const excluded: string[] = [];
  const entries: StoragePlanEntry[] = [];
  for (const candidate of ledger.candidates) {
    if (candidate.rules.length === 0) continue;
    if (pins.has(candidate.path)) {
      excluded.push(candidate.path);
      continue;
    }
    entries.push({
      path: candidate.path,
      class: candidate.class,
      bytes: candidate.bytes,
      files: candidate.files,
      newestMtimeMs: candidate.newestMtimeMs,
      rules: [...candidate.rules],
      fingerprint: planEntryFingerprint(candidate),
    });
  }
  return {
    id: options.id,
    root: ledger.root,
    createdAtMs: options.nowMs,
    expiresAtMs: options.nowMs + (options.ttlMs ?? STORAGE_PLAN_TTL_MS),
    fingerprint: planFingerprint(entries),
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    entries,
    excluded,
  };
}

/** The volume's free/total bytes, or null where the platform cannot answer. */
async function diskFacts(
  target: string,
): Promise<{ freeBytes: number; totalBytes: number } | null> {
  try {
    const st = await fs.statfs(target);
    return { freeBytes: st.bavail * st.bsize, totalBytes: st.blocks * st.bsize };
  } catch {
    return null;
  }
}
