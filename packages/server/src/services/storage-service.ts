/**
 * The data root's storage ledger, and the human-reviewed cleanup that reads it.
 *
 * Two halves, one vocabulary. `report()` walks the root and answers with what is there and
 * what could go — it deletes nothing, moves nothing and is safe to call at any moment (see
 * core's state/storage.ts, the single definition point of the classes it maps). Everything else
 * here is the design's second step: a **bill** written out of that ledger, reviewed by a person,
 * approved once, and only then moved — into the trash, never unlinked.
 *
 * The rules that shape the whole node, in one place:
 *
 * - **Nothing runs by itself.** There is no timer and no threshold that acts; a scan happens
 *   because somebody asked for one, and a move because somebody selected entries and pressed
 *   the button. What may happen automatically is a report.
 * - **The cleanup mode gates every write.** `enabled` is off until a person turns it on;
 *   scanning, pinning, moving and purging are all refused while it is off, so an untouched
 *   install has exactly the read-only behaviour the previous version had.
 * - **A plan is used once, and only if the disk still matches it.** An approval quotes the
 *   bill's fingerprint; the entries are re-measured and re-checked against live state before
 *   anything moves, so a tree that grew, was touched or came alive in the meantime stops the
 *   run instead of being cleaned up half-reviewed.
 * - **A move is a rename into `<root>/.trash/<stamp>/items/<original path>`** plus a manifest,
 *   which makes the whole thing reversible with the same call. The one deletion in the file is
 *   `purge`, which removes a trash entry a person named (or one past the retention) — and it
 *   never touches anything that is not already in the trash.
 *
 * Liveness is the server's own state, so it is assembled here rather than in core's pure
 * `scanStorage`: `SessionIndex.listByProject` over `Projects.listAll` is every Session row that
 * still exists — the index creation, Trace adoption and deletion all keep current — and each
 * row carries both the Workspace it points at and its last activity. At apply time it is read
 * again, so a Workspace that a Session started using after the scan is refused rather than
 * moved.
 *
 * A Session in the middle of being deleted (`SessionManager.beginSessionDeletion`) is NOT
 * excluded, because that window is not reachable from a node: `SessionManager` keeps its
 * `deletingSessions` set private, and the `Sessions` mechanism exposes only the begin/end pair
 * with no way to ask about one id. Counting such a Session as live is the safe direction — it
 * can only make an entry look referenced, never claim that something a deletion is about to
 * remove is free — and for apply it means the entry is refused, which is the answer a person
 * can act on (scan again once the deletion is done).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  buildStoragePlan,
  EXECUTABLE_STORAGE_CLASSES,
  isExecutableStorageClass,
  isPlannablePath,
  isInsideRoot,
  measureStorageEntry,
  planEntryFingerprint,
  resolveStorageEntry,
  scanStorage,
  storageLogFile,
  storagePlanId,
  storagePlansDir,
  storageTrashDir,
  storageTrashId,
} from "@lmliheng/penguin-core";
import type {
  StorageClass,
  StorageEntry as LedgerEntry,
  StorageLiveSet,
  StoragePlan,
  StoragePlanEntry,
} from "@lmliheng/penguin-core";
import { Component, Interface, Use } from "@lmliheng/penguin-core/kernel";
import { HttpError } from "../http/errors.js";
import type {
  StorageApplyResponse,
  StorageCandidate,
  StoragePlanView,
  StoragePurgeResponse,
  StorageReport,
  StorageRestoreResponse,
  StorageSettings,
  StorageSettingsUpdateRequest,
  StorageTrashEntry,
} from "../api/types.js";
import type { Paths } from "../hmr/capabilities.js";
import type { Projects } from "../mechanisms/projects.js";
import type { SessionIndex } from "../mechanisms/sessions.js";
import type { Settings } from "../mechanisms/settings.js";

/**
 * What a node may require to work with the data root's storage: the report, and the reviewed
 * cleanup that reads it. There is no "clean this class" or "run a policy" method — the design's
 * guarantee is that a removal needs a specific bill a person looked at, and a surface narrower
 * than that could not express one.
 */
@Interface()
export abstract class StorageAdmin {
  abstract report(): Promise<StorageReport>;
  abstract settings(): StorageSettings;
  abstract updateSettings(update: StorageSettingsUpdateRequest): StorageSettings;
  /** Scans and writes a bill; refuses while the cleanup mode is off. */
  abstract scan(): Promise<StoragePlanView>;
  abstract plans(): Promise<StoragePlanView[]>;
  abstract plan(planId: string): Promise<StoragePlanView>;
  abstract pin(input: { path: string; pinned: boolean }): Promise<StorageSettings>;
  abstract apply(input: {
    planId: string;
    fingerprint: string;
    paths: string[];
  }): Promise<StorageApplyResponse>;
  abstract trash(): Promise<StorageTrashEntry[]>;
  abstract restore(trashId: string): Promise<StorageRestoreResponse>;
  abstract purge(trashId: string | null): Promise<StoragePurgeResponse>;
}

/** `server_settings` key holding the cleanup mode's settings, one JSON object. */
const STORAGE_SETTINGS_KEY = "storage";

/** Trash entries live this long before a purge without an id may remove them. */
const DEFAULT_TRASH_TTL_DAYS = 14;
const MIN_TRASH_TTL_DAYS = 1;
const MAX_TRASH_TTL_DAYS = 365;

/** Plans a listing returns, newest first — enough to review, not a second storage table. */
const PLAN_LIST_LIMIT = 20;

/** Ids are used as file and directory names, so they are checked before they are joined. */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

const TRASH_MANIFEST = "manifest.json";
const TRASH_ITEMS_DIR = "items";

/** The defaults of a machine that has never turned the cleanup mode on. */
const DEFAULT_STORAGE_SETTINGS: StorageSettings = {
  enabled: false,
  trashTtlDays: DEFAULT_TRASH_TTL_DAYS,
  pins: [],
};

/** What a trash entry's manifest records: enough to put every tree back where it came from. */
interface TrashManifest {
  id: string;
  createdAtMs: number;
  planId: string;
  items: { path: string; class: StorageClass; bytes: number; files: number }[];
}

@Component()
export class StorageService implements StorageAdmin {
  @Use() private readonly paths!: Paths;
  @Use() private readonly projects!: Projects;
  @Use() private readonly sessions!: SessionIndex;
  @Use() private readonly settingsRepo!: Settings;

  /** The write in flight, by name — the single-writer rule, made visible rather than queued. */
  private running: string | null = null;

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

  settings(): StorageSettings {
    return this.readSettings();
  }

  updateSettings(update: StorageSettingsUpdateRequest): StorageSettings {
    const current = this.readSettings();
    const next: StorageSettings = {
      enabled: update.enabled ?? current.enabled,
      trashTtlDays: update.trashTtlDays ?? current.trashTtlDays,
      pins: update.pins ?? current.pins,
    };
    if (
      !Number.isInteger(next.trashTtlDays) ||
      next.trashTtlDays < MIN_TRASH_TTL_DAYS ||
      next.trashTtlDays > MAX_TRASH_TTL_DAYS
    ) {
      throw new HttpError(
        400,
        "invalid_trash_ttl",
        `trashTtlDays must be a whole number of days between ${MIN_TRASH_TTL_DAYS} and ${MAX_TRASH_TTL_DAYS}.`,
      );
    }
    for (const pin of next.pins) this.assertPinnablePath(pin);
    if (next.enabled !== current.enabled) {
      this.audit({ action: next.enabled ? "mode_on" : "mode_off" });
    }
    // A changed pin list is a decision about data, so it is recorded like one: the audit file
    // is what answers "why is this entry not on the bill any more" months later.
    for (const pin of next.pins)
      if (!current.pins.includes(pin)) this.audit({ action: "pin", path: pin });
    for (const pin of current.pins)
      if (!next.pins.includes(pin)) this.audit({ action: "unpin", path: pin });
    this.settingsRepo.set(STORAGE_SETTINGS_KEY, JSON.stringify(next));
    return next;
  }

  async pin(input: { path: string; pinned: boolean }): Promise<StorageSettings> {
    this.assertModeOn("pinning");
    this.assertPinnablePath(input.path);
    const current = this.readSettings();
    const pins = input.pinned
      ? [...new Set([...current.pins, input.path])].sort()
      : current.pins.filter((pin) => pin !== input.path);
    return this.updateSettings({ pins });
  }

  async scan(): Promise<StoragePlanView> {
    this.assertModeOn("scanning");
    this.assertIdle("scan");
    this.running = "scan";
    try {
      const nowMs = Date.now();
      const pins = new Set(this.readSettings().pins);
      const ledger = await scanStorage(this.paths.root, await this.liveSet());
      const plan = buildStoragePlan(ledger, {
        id: storagePlanId(nowMs, randomBytes(3).toString("hex")),
        nowMs,
        pins,
      });
      await this.writePlan(plan);
      this.audit({
        action: "scan",
        planId: plan.id,
        entries: plan.entries.length,
        bytes: plan.totalBytes,
        excluded: plan.excluded.length,
      });
      return toPlanView(plan, nowMs);
    } finally {
      this.running = null;
    }
  }

  async plans(): Promise<StoragePlanView[]> {
    const dir = storagePlansDir(this.paths.root);
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch {
      return [];
    }
    const nowMs = Date.now();
    const views: StoragePlanView[] = [];
    // The id starts with its local timestamp, so a reverse string sort is newest first.
    for (const name of names
      .filter((n) => n.endsWith(".json"))
      .sort()
      .reverse()) {
      if (views.length >= PLAN_LIST_LIMIT) break;
      const plan = await this.readPlanFile(name.slice(0, -".json".length));
      if (plan !== null) views.push(toPlanView(plan, nowMs));
    }
    return views;
  }

  async plan(planId: string): Promise<StoragePlanView> {
    const plan = await this.readPlanFile(planId);
    if (plan === null) {
      throw new HttpError(
        404,
        "plan_not_found",
        "No plan with that id. Scan again for a new bill.",
      );
    }
    return toPlanView(plan, Date.now());
  }

  /**
   * The one destructive path: validate the whole batch against the bill and the disk, and only
   * then move each entry. Validation is all-or-nothing — a single stale, pinned, referenced or
   * disallowed entry refuses the run and names why, because a person approved a list and not a
   * subset of it — while the moves themselves are per entry, so one failure does not strand the
   * rest half-done (each move is logged before it happens, and a rerun converges).
   */
  async apply(input: {
    planId: string;
    fingerprint: string;
    paths: string[];
  }): Promise<StorageApplyResponse> {
    this.assertModeOn("applying");
    this.assertIdle("apply");
    this.running = "apply";
    try {
      const nowMs = Date.now();
      const plan = await this.readPlanFile(input.planId);
      if (plan === null) {
        throw new HttpError(
          404,
          "plan_not_found",
          "No plan with that id. Scan again for a new bill.",
        );
      }
      if (plan.appliedAtMs !== undefined) {
        throw new HttpError(
          409,
          "plan_used",
          "This plan has already been applied. A plan is valid for one run: scan again for a new bill.",
        );
      }
      if (nowMs > plan.expiresAtMs) {
        throw new HttpError(
          409,
          "plan_expired",
          "This plan is older than 24 hours. Scan again so the bill describes the disk as it is now.",
        );
      }
      if (input.fingerprint !== plan.fingerprint) {
        throw new HttpError(
          409,
          "plan_stale",
          "The fingerprint does not match this plan. Read the bill again before approving it.",
        );
      }
      if (input.paths.length === 0) {
        throw new HttpError(
          400,
          "nothing_selected",
          "Nothing was selected. Approve at least one entry, by its recorded path.",
        );
      }
      const entries = this.selectEntries(plan, input.paths);
      await this.assertBatchStillValid(entries);
      const result = await this.moveToTrash(plan, entries, nowMs);
      // The plan is spent even when every move failed: it was approved once, and nothing may be
      // replayed against a disk the next scan will describe differently.
      await this.writePlan({
        ...plan,
        appliedAtMs: nowMs,
        appliedPaths: result.moved.map((item) => item.path),
      });
      this.audit({
        action: "apply",
        planId: plan.id,
        trashId: result.trashId,
        moved: result.moved.length,
        failed: result.failed.length,
        bytes: result.freedBytes,
      });
      return result;
    } finally {
      this.running = null;
    }
  }

  async trash(): Promise<StorageTrashEntry[]> {
    const dir = storageTrashDir(this.paths.root);
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch {
      return [];
    }
    const nowMs = Date.now();
    const ttlMs = this.readSettings().trashTtlDays * 86_400_000;
    const entries: StorageTrashEntry[] = [];
    for (const name of names.sort().reverse()) {
      const entry = await this.readTrashEntry(name);
      if (entry === null) continue;
      entries.push({ ...entry, expired: nowMs - Date.parse(entry.createdAt) > ttlMs });
    }
    return entries;
  }

  /** Puts every tree in one trash entry back where it came from, refusing what is in the way. */
  async restore(trashId: string): Promise<StorageRestoreResponse> {
    this.assertModeOn("restoring");
    this.assertIdle("restore");
    this.running = "restore";
    try {
      const manifest = await this.readTrashManifest(trashId);
      if (manifest === null) {
        throw new HttpError(404, "trash_not_found", "No trash entry with that id.");
      }
      const entryDir = path.join(storageTrashDir(this.paths.root), trashId);
      const restored: string[] = [];
      const skipped: { path: string; reason: string }[] = [];
      for (const item of manifest.items) {
        const source = path.join(entryDir, TRASH_ITEMS_DIR, ...item.path.split("/"));
        const target = path.join(this.paths.root, ...item.path.split("/"));
        if (!(await exists(source))) {
          skipped.push({ path: item.path, reason: "not_in_trash" });
          continue;
        }
        if (await exists(target)) {
          // Something else is there now — the path was reused by a new Session's Workspace, or
          // the tree was put back by other means. Neither is a reason to overwrite it.
          skipped.push({ path: item.path, reason: "target_exists" });
          continue;
        }
        try {
          await fs.mkdir(path.dirname(target), { recursive: true });
          await this.audit({ action: "restore", trashId, path: item.path });
          await fs.rename(source, target);
          restored.push(item.path);
        } catch (e) {
          skipped.push({ path: item.path, reason: reasonOf(e) });
        }
      }
      // An entry that holds nothing any more is removed with the empty directories it leaves:
      // nothing in it is data a person put there, and an empty trash reads as a broken one.
      // "Holds nothing" is asked of the whole tree, not of the top level: moving one tree out
      // leaves the directories it was nested in behind, empty.
      const remaining = await hasAnyContent(path.join(entryDir, TRASH_ITEMS_DIR));
      if (!remaining) await fs.rm(entryDir, { recursive: true, force: true });
      this.audit({
        action: "restore_done",
        trashId,
        restored: restored.length,
        skipped: skipped.length,
      });
      return { id: trashId, restored, skipped, remaining };
    } finally {
      this.running = null;
    }
  }

  /**
   * The one place that deletes. With an id it removes that trash entry; without one it removes
   * the entries past the retention. Both are a person's command — nothing calls this on a
   * timer — and neither can reach anything outside `<root>/.trash`.
   */
  async purge(trashId: string | null): Promise<StoragePurgeResponse> {
    this.assertModeOn("purging");
    this.assertIdle("purge");
    this.running = "purge";
    try {
      if (trashId !== null && !ID_PATTERN.test(trashId)) {
        throw new HttpError(400, "invalid_trash_id", "That is not a trash id.");
      }
      const ttlMs = this.readSettings().trashTtlDays * 86_400_000;
      const nowMs = Date.now();
      const purged: { id: string; bytes: number; files: number }[] = [];
      const trashRoot = storageTrashDir(this.paths.root);
      if (trashId !== null && !(await exists(path.join(trashRoot, trashId)))) {
        throw new HttpError(404, "trash_not_found", "No trash entry with that id.");
      }
      const candidates =
        trashId === null
          ? (await this.trash()).filter((entry) => entry.expired).map((entry) => entry.id)
          : [trashId];
      for (const id of candidates) {
        const dir = path.join(trashRoot, id);
        const measured = await measureStorageEntry(dir);
        if (measured === null) continue;
        await this.audit({
          action: "purge",
          trashId: id,
          bytes: measured.bytes,
          expiredOnly: trashId === null,
          ageMs: nowMs,
        });
        await fs.rm(dir, { recursive: true, force: true });
        purged.push({ id, bytes: measured.bytes, files: measured.files });
      }
      return { purged };
    } finally {
      this.running = null;
    }
  }

  /**
   * The selected paths, as plan entries: every one must be on the bill, of a class this version
   * may act on, allowed by the prefix whitelist, and not pinned. Checked before the disk is
   * touched at all, and the failure names the path so the person can fix the selection.
   */
  private selectEntries(plan: StoragePlan, paths: string[]): StoragePlanEntry[] {
    const byPath = new Map(plan.entries.map((entry) => [entry.path, entry]));
    const pins = new Set(this.readSettings().pins);
    const selected: StoragePlanEntry[] = [];
    const seen = new Set<string>();
    for (const requested of paths) {
      if (seen.has(requested)) continue;
      seen.add(requested);
      const entry = byPath.get(requested);
      if (entry === undefined) {
        throw new HttpError(
          400,
          "unknown_path",
          `Not an entry of this plan: ${requested}. Read the bill again.`,
        );
      }
      if (!isExecutableStorageClass(entry.class)) {
        throw new HttpError(
          409,
          "class_not_executable",
          `This version does not clean ${entry.class} entries; it only reports them: ${entry.path}.`,
        );
      }
      if (!isPlannablePath(entry.path, entry.class)) {
        throw new HttpError(
          400,
          "path_not_allowed",
          `Outside what this class may touch: ${entry.path}.`,
        );
      }
      if (pins.has(entry.path)) {
        throw new HttpError(
          409,
          "pinned_path",
          `Pinned — it will never be cleaned: ${entry.path}.`,
        );
      }
      selected.push(entry);
    }
    return selected;
  }

  /**
   * The disk check, run against the whole selection before a single move: every entry still
   * resolves inside the root as a real directory, still measures exactly as the bill recorded,
   * and is still unreferenced by live state. All-or-nothing on purpose — the answer to any
   * mismatch is a new scan, and a partial run would clean up a list nobody reviewed as a whole.
   */
  private async assertBatchStillValid(entries: StoragePlanEntry[]): Promise<void> {
    const root = this.paths.root;
    const live = await this.liveSet();
    const gone: string[] = [];
    const changed: string[] = [];
    const escaped: string[] = [];
    const revived: string[] = [];
    const targets: { entry: StoragePlanEntry; target: string }[] = [];
    for (const entry of entries) {
      const target = await resolveStorageEntry(root, entry.path);
      if (target === null) {
        // Either it vanished, or it is a symlink (or a file) where the bill recorded a
        // directory: both are drift, and neither may be moved.
        escaped.push(entry.path);
        continue;
      }
      const measured = await measureStorageEntry(target);
      if (measured === null) {
        gone.push(entry.path);
        continue;
      }
      const nowFingerprint = planEntryFingerprint({
        path: entry.path,
        bytes: measured.bytes,
        newestMtimeMs: measured.newestMtimeMs,
      });
      if (nowFingerprint !== entry.fingerprint) {
        changed.push(entry.path);
        continue;
      }
      if (live.workspacePaths.has(target)) {
        revived.push(entry.path);
        continue;
      }
      targets.push({ entry, target });
    }
    if (escaped.length > 0) {
      throw new HttpError(
        409,
        "path_not_allowed",
        `No longer a directory inside the data root, or not one this version may move: ${nameList(escaped)}.`,
      );
    }
    if (gone.length > 0) {
      throw new HttpError(409, "plan_stale", `Gone since the scan: ${nameList(gone)}. Scan again.`);
    }
    if (changed.length > 0) {
      throw new HttpError(
        409,
        "plan_stale",
        `Changed since the scan (size or modification time): ${nameList(changed)}. Scan again.`,
      );
    }
    if (revived.length > 0) {
      throw new HttpError(
        409,
        "entry_still_live",
        `A Session started using this after the scan, so it is not a candidate any more: ${nameList(revived)}.`,
      );
    }
  }

  /**
   * Moves each approved entry into this run's trash directory. A rename within one filesystem,
   * so a move is atomic and a failure leaves the tree exactly where it was; the audit line is
   * written *before* the move, which is what makes a torn run explainable.
   */
  private async moveToTrash(
    plan: StoragePlan,
    entries: StoragePlanEntry[],
    nowMs: number,
  ): Promise<StorageApplyResponse> {
    const trashRoot = storageTrashDir(this.paths.root);
    const moved: { path: string; bytes: number; files: number }[] = [];
    const failed: { path: string; reason: string }[] = [];
    // Resolve the entries again here rather than trusting the check above: the two are one
    // breath apart, but the path is what gets joined, and it is cheap to be sure.
    const resolved: { entry: StoragePlanEntry; target: string }[] = [];
    for (const entry of entries) {
      const target = await resolveStorageEntry(this.paths.root, entry.path);
      if (target === null) {
        failed.push({ path: entry.path, reason: "path_not_allowed" });
        continue;
      }
      resolved.push({ entry, target });
    }
    if (resolved.length === 0) {
      return { planId: plan.id, trashId: null, moved, failed, freedBytes: 0 };
    }
    const trashId = await this.createTrashEntry(trashRoot, plan, nowMs);
    const entryDir = path.join(trashRoot, trashId);
    const manifest: TrashManifest = {
      id: trashId,
      createdAtMs: nowMs,
      planId: plan.id,
      items: resolved.map(({ entry }) => ({
        path: entry.path,
        class: entry.class,
        bytes: entry.bytes,
        files: entry.files,
      })),
    };
    await fs.writeFile(
      path.join(entryDir, TRASH_MANIFEST),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    for (const { entry, target } of resolved) {
      const destination = path.join(entryDir, TRASH_ITEMS_DIR, ...entry.path.split("/"));
      try {
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await this.audit({
          action: "move",
          planId: plan.id,
          trashId,
          path: entry.path,
          class: entry.class,
          bytes: entry.bytes,
          files: entry.files,
          rules: entry.rules,
        });
        await fs.rename(target, destination);
        moved.push({ path: entry.path, bytes: entry.bytes, files: entry.files });
      } catch (e) {
        failed.push({ path: entry.path, reason: reasonOf(e) });
        await this.audit({
          action: "move_failed",
          planId: plan.id,
          path: entry.path,
          reason: reasonOf(e),
        });
      }
    }
    return {
      planId: plan.id,
      trashId,
      moved,
      failed,
      freedBytes: moved.reduce((sum, item) => sum + item.bytes, 0),
    };
  }

  /** This run's trash directory, with a counter when another run already used the stamp. */
  private async createTrashEntry(
    trashRoot: string,
    plan: StoragePlan,
    nowMs: number,
  ): Promise<string> {
    const stamp = storageTrashId(nowMs);
    for (let attempt = 0; ; attempt += 1) {
      const id = attempt === 0 ? stamp : `${stamp}-${attempt + 1}`;
      const dir = path.join(trashRoot, id);
      try {
        await fs.mkdir(dir, { recursive: false });
        return id;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") {
          await fs.mkdir(trashRoot, { recursive: true });
          continue;
        }
        if ((e as NodeJS.ErrnoException).code === "EEXIST" && attempt < 50) continue;
        // Inside the trash but outside a run's directory, so the manifest is still the record
        // of what moved: a failure to name the run's own directory is worth stopping for.
        throw new HttpError(
          500,
          "trash_unavailable",
          `Could not create a trash entry under ${trashRoot} for plan ${plan.id}.`,
        );
      }
    }
  }

  /** Reads one trash entry: the manifest for its items, the disk for its size. */
  private async readTrashEntry(id: string): Promise<StorageTrashEntry | null> {
    const dir = path.join(storageTrashDir(this.paths.root), id);
    const measured = await measureStorageEntry(dir);
    if (measured === null) return null;
    const manifest = await this.readTrashManifest(id);
    const createdAtMs = manifest?.createdAtMs ?? (await mtimeMs(dir));
    return {
      id,
      createdAt: new Date(createdAtMs).toISOString(),
      planId: manifest?.planId ?? null,
      bytes: measured.bytes,
      files: measured.files,
      items: manifest?.items ?? [],
      // Overwritten by the caller, which is where the retention setting is read.
      expired: false,
    };
  }

  /**
   * A trash entry's manifest, or null when it is missing or unreadable. A hand-edited or
   * truncated manifest still lets the entry be listed and purged — it just cannot be restored
   * entry by entry, which is a documentable state rather than a crash.
   */
  private async readTrashManifest(id: string): Promise<TrashManifest | null> {
    if (!ID_PATTERN.test(id)) return null;
    try {
      const raw = await fs.readFile(
        path.join(storageTrashDir(this.paths.root), id, TRASH_MANIFEST),
        "utf8",
      );
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return null;
      const manifest = parsed as Partial<TrashManifest>;
      if (!Array.isArray(manifest.items)) return null;
      return {
        id,
        createdAtMs: typeof manifest.createdAtMs === "number" ? manifest.createdAtMs : 0,
        planId: typeof manifest.planId === "string" ? manifest.planId : "",
        items: manifest.items.filter(
          (item): item is TrashManifest["items"][number] =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as { path?: unknown }).path === "string",
        ),
      };
    } catch {
      return null;
    }
  }

  private async writePlan(plan: StoragePlan): Promise<void> {
    const dir = storagePlansDir(this.paths.root);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `${plan.id}.json`),
      `${JSON.stringify(plan, null, 2)}\n`,
      "utf8",
    );
  }

  private async readPlanFile(id: string): Promise<StoragePlan | null> {
    if (!ID_PATTERN.test(id)) return null;
    try {
      const raw = await fs.readFile(
        path.join(storagePlansDir(this.paths.root), `${id}.json`),
        "utf8",
      );
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return null;
      const plan = parsed as Partial<StoragePlan>;
      if (typeof plan.fingerprint !== "string" || !Array.isArray(plan.entries)) return null;
      return {
        id,
        root: typeof plan.root === "string" ? plan.root : this.paths.root,
        createdAtMs: typeof plan.createdAtMs === "number" ? plan.createdAtMs : 0,
        expiresAtMs: typeof plan.expiresAtMs === "number" ? plan.expiresAtMs : 0,
        fingerprint: plan.fingerprint,
        totalBytes: typeof plan.totalBytes === "number" ? plan.totalBytes : 0,
        entries: plan.entries.filter((entry): entry is StoragePlanEntry => isPlanEntry(entry)),
        excluded: Array.isArray(plan.excluded)
          ? plan.excluded.filter((p) => typeof p === "string")
          : [],
        ...(typeof plan.appliedAtMs === "number" ? { appliedAtMs: plan.appliedAtMs } : {}),
        ...(Array.isArray(plan.appliedPaths)
          ? { appliedPaths: plan.appliedPaths.filter((p) => typeof p === "string") }
          : {}),
      };
    } catch {
      return null;
    }
  }

  private readSettings(): StorageSettings {
    const raw = this.settingsRepo.get(STORAGE_SETTINGS_KEY);
    if (raw === null) return { ...DEFAULT_STORAGE_SETTINGS };
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return { ...DEFAULT_STORAGE_SETTINGS };
      const value = parsed as Partial<StorageSettings>;
      const ttl = value.trashTtlDays;
      return {
        // Default off on anything unreadable: the mode is the switch a person turns on, and an
        // unparseable row means nobody has.
        enabled: value.enabled === true,
        trashTtlDays:
          typeof ttl === "number" &&
          Number.isInteger(ttl) &&
          ttl >= MIN_TRASH_TTL_DAYS &&
          ttl <= MAX_TRASH_TTL_DAYS
            ? ttl
            : DEFAULT_TRASH_TTL_DAYS,
        pins: Array.isArray(value.pins) ? value.pins.filter((p) => typeof p === "string") : [],
      };
    } catch {
      return { ...DEFAULT_STORAGE_SETTINGS };
    }
  }

  /** The mode is the whole gate: with it off, nothing here writes and nothing may be planned. */
  private assertModeOn(what: string): void {
    if (!this.readSettings().enabled) {
      throw new HttpError(
        409,
        "storage_mode_off",
        `Cleanup mode is off, so ${what} is not available. The ledger stays readable; turn the mode on in Settings → Storage.`,
      );
    }
  }

  private assertIdle(what: string): void {
    if (this.running !== null) {
      throw new HttpError(
        409,
        "storage_busy",
        `Another storage ${this.running} is running; try ${what} once it finishes.`,
      );
    }
  }

  /**
   * A pin must name something inside the root that exists now — the same containment rule a
   * move obeys. A pin for a path that is not there would silently do nothing, and a pin that
   * escaped the root would be a decision about something this machine does not own.
   */
  private assertPinnablePath(relativePath: string): void {
    if (relativePath === "" || relativePath.startsWith("/") || relativePath.includes("\\")) {
      throw new HttpError(
        400,
        "invalid_pin",
        `A pin is a path relative to the data root: ${relativePath}.`,
      );
    }
    if (relativePath.split("/").some((segment) => segment === "" || segment === "..")) {
      throw new HttpError(
        400,
        "invalid_pin",
        `A pin must not contain empty or parent segments: ${relativePath}.`,
      );
    }
    const target = path.resolve(this.paths.root, relativePath);
    if (!isInsideRoot(this.paths.root, target)) {
      throw new HttpError(400, "invalid_pin", `Outside the data root: ${relativePath}.`);
    }
  }

  /**
   * One JSON line per decision about data, appended to `<root>/logs/storage-gc.jsonl` and never
   * rewritten. Best effort: a log that cannot be written must not take a move down with it (the
   * move is the thing the person asked for, and the trash manifest records it too), but the
   * failure is not swallowed silently either — it is reported on stderr of the server process.
   */
  private async audit(record: Record<string, unknown> & { action: string }): Promise<void> {
    const line = `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`;
    try {
      await fs.mkdir(path.dirname(storageLogFile(this.paths.root)), { recursive: true });
      await fs.appendFile(storageLogFile(this.paths.root), line, "utf8");
    } catch (e) {
      process.stderr.write(`storage: could not write the audit log: ${reasonOf(e)}\n`);
    }
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

/** A stored plan as the page and the CLI read it: the same bill, with ISO instants. */
function toPlanView(plan: StoragePlan, nowMs: number): StoragePlanView {
  const expired = nowMs > plan.expiresAtMs;
  return {
    id: plan.id,
    root: plan.root,
    createdAt: new Date(plan.createdAtMs).toISOString(),
    expiresAt: new Date(plan.expiresAtMs).toISOString(),
    fingerprint: plan.fingerprint,
    totalBytes: plan.totalBytes,
    entries: plan.entries.map((entry) => ({
      path: entry.path,
      class: entry.class,
      bytes: entry.bytes,
      files: entry.files,
      lastModifiedAt:
        entry.newestMtimeMs === 0 ? null : new Date(entry.newestMtimeMs).toISOString(),
      rules: entry.rules,
      fingerprint: entry.fingerprint,
      executable: isExecutableStorageClass(entry.class),
    })),
    excluded: plan.excluded,
    executableClasses: [...EXECUTABLE_STORAGE_CLASSES],
    appliedAt: plan.appliedAtMs === undefined ? null : new Date(plan.appliedAtMs).toISOString(),
    appliedPaths: plan.appliedPaths ?? [],
    usable: plan.appliedAtMs === undefined && !expired,
    expired,
  };
}

/** Whether a parsed JSON value is one plan entry, field for field, before it is trusted. */
function isPlanEntry(value: unknown): value is StoragePlanEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<StoragePlanEntry>;
  return (
    typeof entry.path === "string" &&
    typeof entry.class === "string" &&
    typeof entry.bytes === "number" &&
    typeof entry.files === "number" &&
    typeof entry.newestMtimeMs === "number" &&
    typeof entry.fingerprint === "string" &&
    Array.isArray(entry.rules)
  );
}

/** A path list for a refusal message, capped so a wild selection cannot flood the response. */
function nameList(paths: string[]): string {
  const shown = paths.slice(0, 10).join(", ");
  return paths.length > 10 ? `${shown} … (${paths.length} in all)` : shown;
}

/** `fs.access` as a boolean, for the "is something already there" questions. */
async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/** Names in a directory, or none when it is not there. */
async function readdirNames(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

/**
 * Whether anything under `dir` is not a directory: a file, a link, anything that would be lost
 * by removing the tree. Empty directories are what a restore leaves behind, and a trash entry
 * holding only those holds nothing.
 */
async function hasAnyContent(dir: string): Promise<boolean> {
  for (const name of await readdirNames(dir)) {
    const full = path.join(dir, name);
    const st = await fs.lstat(full).catch(() => null);
    if (st === null) continue;
    if (!st.isDirectory()) return true;
    if (await hasAnyContent(full)) return true;
  }
  return false;
}

/** A directory's own modification time, which is the fallback stamp of a manifest-less entry. */
async function mtimeMs(target: string): Promise<number> {
  try {
    return (await fs.stat(target)).mtimeMs;
  } catch {
    return 0;
  }
}

/** A failure's own words, for a report a person reads (`no such file or directory`). */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
