/**
 * The data root's storage ledger, read-only — the numbers behind `GET /api/admin/storage`.
 *
 * This node reports and nothing else: it walks the root, classifies what is there and answers
 * with the ledger. It deletes nothing, moves nothing, creates nothing and writes no cache, so
 * it is safe to call at any moment — and it is deliberately NOT reachable from a scheduler.
 * A job that produced this report on a timer would be the first step back towards acting on
 * it automatically, which is exactly what the design rules out: every removal is a person's
 * decision, taken against a report they are looking at (see core's state/storage.ts, the
 * single definition point of the vocabulary this service only maps).
 *
 * Liveness is what makes a ledger meaningful, and it is the server's own state, so this node
 * assembles it here rather than in core's pure `scanStorage`, which cannot reach a database:
 * `SessionIndex.listByProject` over `Projects.listAll` is every Session row that still exists
 * — the index creation, Trace adoption and deletion all keep current — and each row carries
 * both the Workspace that Session points at and its last activity.
 *
 * A Session in the middle of being deleted (`SessionManager.beginSessionDeletion` /
 * `assertSessionNotDeleting`) is NOT excluded here, because that window is not reachable from
 * a node: `SessionManager` keeps its `deletingSessions` set private, and the `Sessions`
 * mechanism exposes only the begin/end pair with no way to ask about one id. Counting such a
 * Session as live is the safe direction for a read-only report — it can only make an entry
 * look referenced, never claim that something a deletion is about to remove is free — whereas
 * a query added to the session runtime for this one caller would be a change to the deletion
 * window itself, which this slice does not need.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { scanStorage } from "@lmliheng/penguin-core";
import type { StorageLiveSet, StorageEntry as LedgerEntry } from "@lmliheng/penguin-core";
import { Component, Interface, Use } from "@lmliheng/penguin-core/kernel";
import type { StorageCandidate, StorageReport } from "../api/types.js";
import type { Paths } from "../hmr/capabilities.js";
import type { Projects } from "../mechanisms/projects.js";
import type { SessionIndex } from "../mechanisms/sessions.js";

/**
 * What a node may require to read the storage ledger: the report, and nothing else. The DTO
 * is the whole contract, so nothing on a route can reach a scan policy or a removal through
 * it — a caller cannot ask for a wider candidate list than the design's defaults, because
 * there is no argument to ask with.
 */
@Interface()
export abstract class StorageLedgerReader {
  abstract report(): Promise<StorageReport>;
}

@Component()
export class StorageService implements StorageLedgerReader {
  @Use() private readonly paths!: Paths;
  @Use() private readonly projects!: Projects;
  @Use() private readonly sessions!: SessionIndex;

  async report(): Promise<StorageReport> {
    // The design's default policy, with no way to pass another one (see the interface above):
    // the report lists what is provably unreferenced or empty, and every age- or budget-based
    // rule stays off.
    const ledger = await scanStorage(this.paths.root, await this.liveSet());
    return {
      root: ledger.root,
      // The instant the walk observed, as ISO: the report describes that moment rather than
      // the moment it is read, which is why the stamp is not taken here.
      scannedAt: new Date(ledger.scannedAtMs).toISOString(),
      totalBytes: ledger.totalBytes,
      // Field-for-field the ledger's own: the DTO spells the shape out instead of importing
      // core's types (api/types.ts is the Web contract and takes core's pure subpaths only),
      // so the compiler is what keeps the two in step.
      classes: ledger.classes,
      candidates: ledger.candidates.map(toCandidate),
      sharedEnvGroups: ledger.sharedEnvGroups,
      disk: ledger.disk,
      unreadable: ledger.unreadable,
    };
  }

  /**
   * The server's live state, in the shape core's `StorageLiveSet` asks for: every Session id
   * that still exists, the REAL path of each Workspace those Sessions point at (core compares
   * realpaths, and a Workspace can sit under a symlinked parent — a user's home on macOS
   * reaches it through `/var` → `/private/var`), and each Session's last activity in epoch ms.
   *
   * One row per Session is enough for all three, so this is two indexed queries per Project
   * and no filesystem work beyond resolving the Workspace paths.
   *
   * Which Projects exist is the database's answer too (`Projects.listAll`), the same enumeration
   * the scheduler and the organization runtime make — so a Session whose Project the index does
   * not know (a root copied onto a machine whose index was never rebuilt for it) is not in the
   * set. That gap closes on its own: bringing such a root into the index is exactly what the
   * boot-time adoption sweep does.
   */
  private async liveSet(): Promise<StorageLiveSet> {
    const sessionIds = new Set<string>();
    const sessionLastActiveMs = new Map<string, number>();
    const workspaces = new Set<string>();
    for (const project of this.projects.listAll()) {
      for (const row of this.sessions.listByProject(project.projectId)) {
        sessionIds.add(row.sessionId);
        // A stamp that cannot be parsed is left out rather than replaced with "now": a Session
        // with no known activity is then never judged idle, which is the conservative way
        // round for a report a person may act on.
        const lastActiveMs = Date.parse(row.lastActiveAt);
        if (!Number.isNaN(lastActiveMs)) sessionLastActiveMs.set(row.sessionId, lastActiveMs);
        if (row.workspace !== "") workspaces.add(row.workspace);
      }
    }
    return {
      sessionIds,
      workspacePaths: await realPathsOf(workspaces),
      sessionLastActiveMs,
    };
  }
}

/**
 * A candidate as the Web contract spells it. Core reports the newest mtime as epoch ms and 0
 * for "nothing could be stat'd"; the DTO asks for ISO or null, because a 0 turned into a date
 * would read as a file from 1970 — an ancient entry — rather than one of unknown age.
 */
function toCandidate(entry: LedgerEntry): StorageCandidate {
  return {
    path: entry.path,
    class: entry.class,
    bytes: entry.bytes,
    files: entry.files,
    lastModifiedAt: entry.newestMtimeMs === 0 ? null : new Date(entry.newestMtimeMs).toISOString(),
    referenced: entry.referenced,
    rules: entry.rules,
  };
}

/**
 * The realpaths of a set of Workspace paths. A path that is gone still needs a stable form to
 * compare against, so it falls back to its resolved self — core's own rule for the directory
 * it is walking — which keeps both sides of the temporary-Workspace comparison agreeing
 * whether or not that Workspace still exists.
 */
async function realPathsOf(workspaces: ReadonlySet<string>): Promise<Set<string>> {
  const resolved = await Promise.all(
    [...workspaces].map(async (workspace) => {
      try {
        return await fs.realpath(workspace);
      } catch {
        return path.resolve(workspace);
      }
    }),
  );
  return new Set(resolved);
}
