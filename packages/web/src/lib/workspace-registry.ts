/**
 * Manually-added Workspaces of the sidebar (pure decisions, unit tested): the header's
 * new-workspace button lets the user browse to a directory, and the picked path must show
 * up as a workspace group IMMEDIATELY — even with zero Sessions. There is no Workspace
 * entity on the server (groups are otherwise derived purely from Session paths), so the
 * picked paths persist frontend-side per Project (`penguin.…` key naming, injectable
 * storage — the model-group-expansion.ts convention) and merge into the grouping as
 * empty groups.
 *
 * An entry is `{ path, machineId?, alias?, hiddenAt? }`, and the first two together are its
 * identity: one directory on one machine. The alias is a display name set via the group's
 * rename action (it replaces the basename as the group label — for session-backed groups
 * too — while the full path stays in the tooltip; an empty alias reverts to the basename).
 * Loads stay tolerant of the branch's earlier string-only stored shape.
 *
 * Lifecycle: an entry stays until the group's 删除工作区 hides it (`hiddenAt`, and that works
 * for a group the server derives from Sessions too — sidebar-only: disk and Sessions are never
 * touched, and picking the directory again in 新建工作区 takes it back onto the list). Once
 * Sessions exist the entry mostly dedups away at merge, but it still carries the alias and the
 * hidden stamp and keeps the group visible after those Sessions are gone.
 */
import {
  isTempWorkspace,
  workspaceGroupKey,
  workspaceGroupPath,
  workspaceLabel,
} from "./session-grouping";
import type { WorkspaceGroup } from "./session-grouping";

/** One registered Workspace: the normalized path, plus an optional display alias and hidden stamp. */
export interface WorkspaceEntry {
  path: string;
  /** Display name overriding the path basename (set via the group's rename action; absent = basename). */
  alias?: string;
  /**
   * The machine this directory is ON, by its own id. Absent means the local machine —
   * which is also every entry registered before workspaces could name one, so absence has
   * to keep meaning "here" rather than "unknown".
   *
   * A path is only meaningful together with its machine: `/srv/app` on two machines is two
   * different directories, so the pair is the identity and `path` alone is not.
   */
  machineId?: string;
  /**
   * When the user took this Workspace off the sidebar (ISO 8601; absent = on the list). The
   * group is left out of it — session-backed or not — while every Session in it is older than
   * this instant, so a chat CREATED in the directory afterwards brings the group back and a
   * live conversation never ends up invisible (dropHiddenWorkspaces). Re-registering the pick
   * clears the stamp: that is the way back onto the list.
   */
  hiddenAt?: string;
}

/**
 * Whether two entries name the SAME directory: the path and the machine both, with absence
 * and null both meaning this one. Every lookup in this module goes through it — a path-only
 * match would rename, or delete, whichever machine's entry came first in the array.
 */
function sameWorkspace(
  a: { path: string; machineId?: string | null },
  b: { path: string; machineId?: string | null },
): boolean {
  return a.path === b.path && (a.machineId ?? null) === (b.machineId ?? null);
}

/** Minimal storage interface (the subset of localStorage used here); tests inject an in-memory implementation. */
export interface WorkspaceRegistryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Storage key of one Project's manually-added Workspaces (sidebar key-naming convention). */
export const workspaceRegistryKey = (projectId: string): string =>
  `penguin.sidebarWorkspaces.${projectId}`;

/**
 * Canonical form of a picked path: trimmed, trailing separators dropped (the server
 * hands back resolved paths without them, so `/srv/app/` must dedup against
 * `/srv/app`), roots kept whole. Both root shapes are preserved: posix `/`, and a
 * win32 DRIVE root — stripping `C:\` down to `C:` would turn an absolute path into a
 * drive-RELATIVE one, so the registry would hold `C:` while Sessions key `C:\`
 * (phantom duplicate group, and a new chat resolving somewhere else entirely).
 * win32 is a supported target (ci-windows + the `--win` desktop build).
 * Empty in → empty out (never registered).
 */
export function normalizeWorkspacePath(path: string): string {
  let p = path.trim();
  while (p.length > 1 && (p.endsWith("/") || p.endsWith("\\"))) {
    // `C:\` / `C:/` is a root: one more strip would leave the drive-relative `C:`.
    if (/^[A-Za-z]:[/\\]$/.test(p)) break;
    p = p.slice(0, -1);
  }
  return p;
}

/** Parses one stored element: a plain string (the branch's earlier shape) or an entry object; junk yields null. */
function parseEntry(x: unknown): WorkspaceEntry | null {
  if (typeof x === "string") {
    const p = normalizeWorkspacePath(x);
    return p === "" ? null : { path: p };
  }
  if (typeof x === "object" && x !== null && typeof (x as { path?: unknown }).path === "string") {
    const p = normalizeWorkspacePath((x as { path: string }).path);
    if (p === "") return null;
    const rawAlias = (x as { alias?: unknown }).alias;
    const alias = typeof rawAlias === "string" ? rawAlias.trim() : "";
    const rawMachine = (x as { machineId?: unknown }).machineId;
    const machineId = typeof rawMachine === "string" && rawMachine !== "" ? rawMachine : undefined;
    // Junk stamps are dropped rather than carried: the one thing this field can do is HIDE a
    // group, and an unparseable instant would hide it for good (dropHiddenWorkspaces skips
    // entries it cannot read, so the group stays on the list).
    const rawHidden = (x as { hiddenAt?: unknown }).hiddenAt;
    const hiddenAt =
      typeof rawHidden === "string" && rawHidden.trim() !== "" ? rawHidden.trim() : undefined;
    return {
      path: p,
      ...(alias === "" ? {} : { alias }),
      ...(machineId === undefined ? {} : { machineId }),
      ...(hiddenAt === undefined ? {} : { hiddenAt }),
    };
  }
  return null;
}

/** Reads a Project's registered Workspaces; no Project, nothing stored, or corrupted storage degrade to empty. Junk elements are dropped, entries re-normalized and deduped (first wins), and the old string-only shape still loads. */
export function loadWorkspaceRegistry(
  projectId: string | null,
  storage?: WorkspaceRegistryStorage,
): WorkspaceEntry[] {
  if (projectId === null) return [];
  try {
    // localStorage resolved INSIDE the try (see pinned-sessions.ts): touching it throws
    // a SecurityError with site data blocked, and this runs from a useState initializer.
    const store = storage ?? localStorage;
    const parsed: unknown = JSON.parse(store.getItem(workspaceRegistryKey(projectId)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const out: WorkspaceEntry[] = [];
    for (const x of parsed) {
      const entry = parseEntry(x);
      // Deduped on the PAIR, as registerWorkspace stores it: dropping the second machine's
      // entry here would lose a Workspace on load, silently and for good.
      if (entry !== null && !out.some((e) => sameWorkspace(e, entry))) out.push(entry);
    }
    return out;
  } catch {
    return [];
  }
}

/** Writes a Project's registered Workspaces (best-effort: quota limits / private browsing fail silently). */
export function saveWorkspaceRegistry(
  projectId: string | null,
  entries: readonly WorkspaceEntry[],
  storage?: WorkspaceRegistryStorage,
): void {
  if (projectId === null) return;
  try {
    (storage ?? localStorage).setItem(workspaceRegistryKey(projectId), JSON.stringify(entries));
  } catch {
    /* best-effort persistence (quota limits / private browsing) */
  }
}

/**
 * Registers a picked path: normalized and prepended (newest registration first).
 * Returns the INPUT array unchanged (same reference) for anything unregisterable —
 * callers skip the state update and storage write. Besides the empty path and an
 * already-registered one that is NOT hidden (re-picking a hidden directory is how its group
 * comes back), a TEMPORARY-workspace path is rejected: the merge below can
 * never give it a group (the merged temp group owns that space), so accepting it would
 * store an entry whose group never appears — no rename/remove overflow to undo it, and
 * re-picking would hit the already-registered exit, leaving a ghost only a
 * localStorage wipe could clear.
 */
export function registerWorkspace(
  entries: readonly WorkspaceEntry[],
  path: string,
  machineId?: string,
): readonly WorkspaceEntry[] {
  const p = normalizeWorkspacePath(path);
  if (p === "" || isTempWorkspace(p)) return entries;
  // Deduped on the PAIR: the same path on two machines is two different directories, and
  // collapsing them would hide one behind the other with no way to tell which.
  const existing = entries.find((e) => sameWorkspace(e, { path: p, machineId }));
  if (existing !== undefined && existing.hiddenAt === undefined) return entries;
  // A HIDDEN entry is the one case where the same pick is not a no-op: picking the directory
  // again is how the group the user removed comes back, so the stamp goes and the alias stays.
  const kept = entries.filter((e) => e !== existing);
  return [
    {
      path: p,
      ...(existing?.alias === undefined ? {} : { alias: existing.alias }),
      ...(machineId === undefined ? {} : { machineId }),
    },
    ...kept,
  ];
}

/**
 * Sets (or, with a blank alias, clears) a registered Workspace's display alias.
 * Returns the INPUT array unchanged (same reference) when the pair isn't registered
 * or the alias doesn't actually change. The machine is carried across the rewrite: an
 * entry that lost it would name a directory here rather than the one that was renamed.
 */
export function setWorkspaceAlias(
  entries: readonly WorkspaceEntry[],
  path: string,
  machineId: string | null,
  alias: string,
): readonly WorkspaceEntry[] {
  const a = alias.trim();
  const target = { path, ...(machineId === null ? {} : { machineId }) };
  const entry = entries.find((e) => sameWorkspace(e, target));
  if (!entry || (entry.alias ?? "") === a) return entries;
  return entries.map((e) =>
    sameWorkspace(e, target)
      ? {
          path: e.path,
          ...(a === "" ? {} : { alias: a }),
          ...(e.machineId === undefined ? {} : { machineId: e.machineId }),
          // Renaming a group the user had removed must not put it back on the list — and the
          // stamp has to survive the rewrite, or its group would reappear out of nowhere.
          ...(e.hiddenAt === undefined ? {} : { hiddenAt: e.hiddenAt }),
        }
      : e,
  );
}

/**
 * Takes a Workspace off the sidebar (the group's ⋯ menu → 删除工作区): stamps the pair with the
 * instant of the removal, which `dropHiddenWorkspaces` reads to leave the group — and the chats
 * inside it — off the list. Sidebar-only: the directory on disk and every Session in it stay
 * exactly as they were, and re-picking the directory in 新建工作区 clears the stamp.
 *
 * An alias already set on the pair survives the rewrite. Same-reference fast exit for an
 * unrepresentable path or a pair that is already hidden under the very same instant.
 */
export function hideWorkspace(
  entries: readonly WorkspaceEntry[],
  path: string,
  machineId: string | null,
  hiddenAt: string,
): readonly WorkspaceEntry[] {
  const p = normalizeWorkspacePath(path);
  const at = hiddenAt.trim();
  if (p === "" || at === "" || isTempWorkspace(p)) return entries;
  const target = { path: p, ...(machineId === null ? {} : { machineId }) };
  const entry = entries.find((e) => sameWorkspace(e, target));
  if (entry?.hiddenAt === at) return entries;
  return [
    {
      path: p,
      ...(entry?.alias === undefined ? {} : { alias: entry.alias }),
      ...(machineId === null ? {} : { machineId }),
      hiddenAt: at,
    },
    ...entries.filter((e) => !sameWorkspace(e, target)),
  ];
}

/**
 * Drops the groups the user removed from the sidebar, keyed by `workspaceGroupKey` — the
 * session-derived ones INCLUDED, which is the whole point: a group with Sessions used to
 * survive 删除工作区 (the merge only ever drops an empty registry group), so the list kept the
 * Workspaces the user was done with.
 *
 * A hidden entry hides its group only while the group holds no chat CREATED after the removal
 * instant. A conversation started in that directory since then puts the group back: a live chat
 * can never be invisible, and the stale stamp simply stops hiding anything (removing it again
 * writes a fresh one). The empty group the merge adds for a hidden entry is dropped as well, so
 * the Workspace leaves the list whether it had Sessions or not.
 *
 * `createdAt` is injected to keep the rule pure and testable; a Session whose stamp is missing
 * or unparseable counts as older — it cannot prove the group is in use. Same-reference fast exit
 * when no entry hides anything.
 */
export function dropHiddenWorkspaces<T>(
  groups: WorkspaceGroup<T>[],
  entries: readonly WorkspaceEntry[],
  createdAt: (session: T) => string | null | undefined,
): WorkspaceGroup<T>[] {
  const hiddenAt = new Map<string, number>();
  for (const e of entries) {
    if (e.hiddenAt === undefined) continue;
    const at = Date.parse(e.hiddenAt);
    // An entry we cannot read hides nothing (see parseEntry): the group stays on the list.
    if (!Number.isNaN(at)) hiddenAt.set(workspaceGroupKey(e.path, e.machineId ?? null), at);
  }
  if (hiddenAt.size === 0) return groups;
  const kept = groups.filter((g) => {
    const at = hiddenAt.get(g.key);
    if (at === undefined) return true;
    return g.sessions.some((s) => {
      const raw = createdAt(s);
      const created = raw === null || raw === undefined ? Number.NaN : Date.parse(raw);
      return Number.isFinite(created) && created > at;
    });
  });
  return kept.length === groups.length ? groups : kept;
}

/**
 * Merges the registered Workspaces into the session-derived grouping: registered-only
 * paths become EMPTY groups, labelled by alias ?? basename; paths whose group already
 * exists dedup away (matched by workspaceGroupKey, so trailing-separator variants
 * collide correctly) but still apply their alias to that group's label; a path that
 * reads as a temporary workspace never forms a group (the merged temp group owns that
 * space — registerWorkspace rejects those up front).
 *
 * The empty groups sort AFTER the session-derived ones (in registration order, newest
 * first). They hold no conversations, and the list renders behind a 10-group display
 * cap: fronting them would push every group with real chats behind 更多分组 as soon as
 * a handful of Workspaces were registered. The sidebar widens the cap when it registers
 * one, so a just-added Workspace is still revealed immediately.
 *
 * A HIDDEN entry is nothing special here — it still applies its alias, and the empty group it
 * adds is dropped right afterwards by dropHiddenWorkspaces, which owns the hiding rule (a group
 * off the list is a decision about the list, not about the merge).
 */
export function mergeRegisteredWorkspaces<T>(
  groups: readonly WorkspaceGroup<T>[],
  registered: readonly WorkspaceEntry[],
): WorkspaceGroup<T>[] {
  const aliasByKey = new Map(
    registered
      .filter((e) => e.alias !== undefined)
      .map((e) => [workspaceGroupKey(e.path, e.machineId ?? null), e.alias as string]),
  );
  const existing = new Set(groups.map((g) => g.key));
  const added: WorkspaceGroup<T>[] = [];
  for (const { path, alias, machineId } of registered) {
    const machine = machineId ?? null;
    const key = workspaceGroupKey(path, machine);
    // Already grouped (by its own machine's Sessions), or a temp-shaped path.
    if (existing.has(key) || workspaceGroupPath(key) !== path) continue;
    existing.add(key);
    added.push({
      key,
      label: alias ?? workspaceLabel(path),
      fullPath: path,
      machineId: machine,
      temp: false,
      sessions: [],
    });
  }
  const relabelled = groups.map((g) => {
    const alias = aliasByKey.get(g.key);
    return alias === undefined ? g : { ...g, label: alias };
  });
  return added.length === 0 ? relabelled : [...relabelled, ...added];
}
