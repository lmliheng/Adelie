/**
 * The bill's bookkeeping (storage-section.tsx draws it, storage-labels.ts names it).
 *
 * Everything here is a pure function of a bill, the pins and the ticked paths, so what a reviewer
 * is about to approve can be read off one value — and pinned by a test without a DOM (this
 * package's vitest runs in Node). Three rules are the whole flow:
 *
 * - **Nothing is selected until somebody selects it.** The default is "keep", so an empty
 *   selection is the state the page opens in, and a selection is what a click on a class's own
 *   button (or on one row) turns into — never something a bill arrives with.
 * - **A selection only ever names what may be moved.** Two things take a row out of reach, and
 *   both are the server's rules rather than this module's guesses: the API's `executable` flag (a
 *   bill lists entries this version can only report — see `StoragePlanEntryView.executable`) and
 *   the pins (an apply containing a pinned path is refused as a whole, with 409 `pinned_path`).
 * - **A pin is read from the settings, not from the bill.** The bill was written before the pin
 *   existed, so a page that decided reachability from `plan.excluded` alone would offer a row the
 *   very next click could not move.
 *
 * The bill is a snapshot of one instant, so nothing here is derived from the disk or from an
 * earlier bill: the paths a selection holds are paths *this* bill recorded, and the fingerprint
 * sent back is the one this bill carries — which is what makes an approval say what was read.
 */
import type {
  StorageApplyRequest,
  StorageClass,
  StoragePlanEntryView,
  StoragePlanView,
} from "@lmliheng/penguin-server/api";

/** The paths ticked on a bill; a fresh constant, so the page's default never mutates. */
export const NO_SELECTION: ReadonlySet<string> = new Set<string>();

/** One class's slice of a bill, with what its entries come to. */
export interface StorageBillGroup {
  class: StorageClass;
  /** Summed here rather than read off the report: a bill's own rows are what a reviewer sees. */
  bytes: number;
  files: number;
  entries: StoragePlanEntryView[];
}

/**
 * The bill's rows grouped by class, largest class first and largest entry first inside it. Equal
 * sizes fall back to the id, so two bills that account for the same bytes never show their groups
 * in an order the reader cannot explain.
 */
export function storageBillGroups(plan: StoragePlanView): StorageBillGroup[] {
  const byClass = new Map<StorageClass, StoragePlanEntryView[]>();
  for (const entry of plan.entries) {
    const rows = byClass.get(entry.class);
    if (rows === undefined) byClass.set(entry.class, [entry]);
    else rows.push(entry);
  }
  const groups: StorageBillGroup[] = [];
  for (const [classKey, rows] of byClass) {
    const entries = [...rows].sort((a, b) => b.bytes - a.bytes || compareIds(a.path, b.path));
    groups.push({
      class: classKey,
      bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
      files: entries.reduce((sum, entry) => sum + entry.files, 0),
      entries,
    });
  }
  return groups.sort((a, b) => b.bytes - a.bytes || compareIds(a.class, b.class));
}

/** The bill a fresh page should review: the newest one the server still lets be approved. */
export function storageOpenPlan(plans: readonly StoragePlanView[]): StoragePlanView | null {
  // `plans` arrives newest first. Only an approvable bill is adopted: a spent one cannot run
  // whatever is ticked on it, and dead boxes would read as an action the page does not have.
  return plans.find((plan) => plan.usable) ?? null;
}

/** The rows of the bill a reviewer may move: this version's classes, minus the pinned paths. */
export function storageMovableEntries(
  plan: StoragePlanView,
  pins: ReadonlySet<string>,
): StoragePlanEntryView[] {
  return plan.entries.filter((entry) => entry.executable && !pins.has(entry.path));
}

/** The rows of one class a reviewer may move; a class with none is on the bill to be read only. */
export function storageSelectablePaths(
  plan: StoragePlanView,
  classKey: StorageClass,
  pins: ReadonlySet<string>,
): string[] {
  return storageMovableEntries(plan, pins)
    .filter((entry) => entry.class === classKey)
    .map((entry) => entry.path);
}

/** Whether every movable row of a class is already ticked — what flips the class's own button. */
export function storageClassFullySelected(
  plan: StoragePlanView,
  selection: ReadonlySet<string>,
  classKey: StorageClass,
  pins: ReadonlySet<string>,
): boolean {
  const paths = storageSelectablePaths(plan, classKey, pins);
  return paths.length > 0 && paths.every((path) => selection.has(path));
}

/** "Select all of this class": adds its movable rows, and leaves every other class's ticks alone. */
export function storageSelectClass(
  plan: StoragePlanView,
  selection: ReadonlySet<string>,
  classKey: StorageClass,
  pins: ReadonlySet<string>,
): ReadonlySet<string> {
  return new Set([...selection, ...storageSelectablePaths(plan, classKey, pins)]);
}

/** The inverse of {@link storageSelectClass}: drops this class's rows, keeping the others' ticks. */
export function storageUnselectClass(
  plan: StoragePlanView,
  selection: ReadonlySet<string>,
  classKey: StorageClass,
  pins: ReadonlySet<string>,
): ReadonlySet<string> {
  const dropped = new Set(storageSelectablePaths(plan, classKey, pins));
  return new Set([...selection].filter((path) => !dropped.has(path)));
}

/**
 * One row's box. Ticking a path that is not a movable entry of this bill does nothing rather than
 * adding it: the only way a tick can be wrong is by not being movable, and a selection must never
 * hold a path an apply would be refused for.
 */
export function storageTogglePath(
  plan: StoragePlanView,
  selection: ReadonlySet<string>,
  path: string,
  pins: ReadonlySet<string>,
): ReadonlySet<string> {
  const next = new Set(selection);
  if (next.delete(path)) return next;
  if (storageMovableEntries(plan, pins).some((entry) => entry.path === path)) next.add(path);
  return next;
}

/** What the current selection comes to, for the line beside the apply button. */
export function storageSelectionTotals(
  plan: StoragePlanView,
  selection: ReadonlySet<string>,
  pins: ReadonlySet<string>,
): { entries: number; bytes: number } {
  const rows = storageMovableEntries(plan, pins).filter((entry) => selection.has(entry.path));
  return {
    entries: rows.length,
    bytes: rows.reduce((sum, entry) => sum + entry.bytes, 0),
  };
}

/**
 * The approval the ticked rows stand for: the bill's **own** fingerprint, as displayed, and
 * exactly those paths — in the bill's order rather than in the order they were clicked, so the
 * request is a function of the bill and the selection alone. Null when nothing is selected, which
 * is also the state the button that would send it is disabled in.
 *
 * The request is capped at what a reviewer can see themselves: a pinned path and a report-only one
 * are left out rather than sent and refused, because the server refuses the whole batch for one
 * bad path — losing the rest of a reviewed selection to a row the page should never have offered.
 *
 * Whether the bill may still be applied is not decided here: that is the server's `usable` flag,
 * and a request built from a spent bill is refused by the server rather than pre-empted here.
 */
export function storageApplyBody(
  plan: StoragePlanView,
  selection: ReadonlySet<string>,
  pins: ReadonlySet<string>,
): StorageApplyRequest | null {
  const paths = storageMovableEntries(plan, pins)
    .filter((entry) => selection.has(entry.path))
    .map((entry) => entry.path);
  if (paths.length === 0) return null;
  return { planId: plan.id, fingerprint: plan.fingerprint, paths };
}

/** Code-point order, so a sort of equal-sized rows does not depend on the viewer's locale. */
function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
