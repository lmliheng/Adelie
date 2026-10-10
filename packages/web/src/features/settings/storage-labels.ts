/**
 * The storage report's, and its bills', vocabulary in the reader's words (storage-section.tsx
 * draws it).
 *
 * The ledger's classes and rules arrive as ids — `session_drafts`, `orphan` — because the API,
 * the rules engine in `@lmliheng/penguin-core` (its `state/storage.ts` defines them) and the
 * cleanup plan a scan writes all have to agree on them. A person reading the report has to
 * recognise what `shared_env` or `budget` means, so every id is translated here, in one place,
 * and both dictionaries carry the words (`S.settings`), so the labels follow the UI language like
 * the rest of the app. A bill's state and a trash entry's are the same kind of value and are
 * translated here too, though those two are derived (see {@link storagePlanState}).
 *
 * Every map is keyed by the DTO's own union and read through it rather than being a partial list
 * with a fallback: a fallback would quietly render a class the engine added as "Other", which is
 * exactly the kind of claim this report must not make — the same value would then be missing from
 * a class's figures and appear under someone else's name. Instead a new class is a type error
 * here, and the build stops until a human decides what it is called and what clearing it costs.
 *
 * The strings are read through `S` at call time, not captured at module scope, so a language
 * switch (which remounts the tree) reads the new dictionary.
 */
import type {
  StorageCandidateRule,
  StorageClass,
  StorageEnvGroup,
  StoragePlanView,
  StorageTrashEntry,
} from "@lmliheng/penguin-server/api";
import { S } from "../../lib/strings";

/** The class of `entry` in the reader's words (`protected` → 用户资产 / "User assets"). */
export function storageClassLabel(entry: StorageClass): string {
  return S.settings.storageClassNames[entry];
}

/**
 * What clearing one entry of that class would cost the person — the draft images that stop
 * previewing, the rebuild source a Trace is, the environment to install again. Shown under the
 * class's name, so the sentence assumes the name has been read.
 */
export function storageClassCost(entry: StorageClass): string {
  return S.settings.storageClassCost[entry];
}

/** Why one entry is listed as a candidate (`orphan` → 会话已删除 / "Session deleted"). */
export function storageRuleLabel(rule: StorageCandidateRule): string {
  return S.settings.storageRuleNames[rule];
}

/**
 * Every rule one candidate matched, in one line. An empty list is shown as its own words rather
 * than as an empty cell: a candidate with no recorded rule is a fact about the report, and a blank
 * beside other rows would read as "no reason at all".
 */
export function storageRulesLabel(rules: readonly StorageCandidateRule[]): string {
  if (rules.length === 0) return S.settings.storageRulesNone;
  return rules.map(storageRuleLabel).join(" · ");
}

/** Whether a look-alike environment group was matched by name or by what it holds. */
export function storageEnvGroupKindLabel(kind: StorageEnvGroup["kind"]): string {
  return kind === "name"
    ? S.settings.storageEnvGroupKindName
    : S.settings.storageEnvGroupKindStructure;
}

/** How a bill stands with the reviewer: open for approval, spent once, or past its day. */
export type StoragePlanState = "usable" | "applied" | "expired";

/**
 * The state of `plan`. `applied` is asked first because it is the stronger fact: a bill applied
 * yesterday is spent whether or not its day has also passed, and reading it as "expired" would
 * point a reviewer at the clock instead of at the scan they need.
 *
 * This is the sentence, not the permission — whether the server would still accept an approval is
 * its own `usable` flag, which the page obeys rather than recomputes.
 */
export function storagePlanState(plan: StoragePlanView): StoragePlanState {
  if (plan.appliedAt !== null) return "applied";
  return plan.expired ? "expired" : "usable";
}

/** What that state means, in one sentence (`usable` → it can still be approved). */
export function storagePlanStateText(state: StoragePlanState): string {
  return S.settings.storagePlanStateText[state];
}

/** How a trash entry stands: inside the retention, or past it. Nothing removes it on its own. */
export type StorageTrashState = "fresh" | "expired";

/** The entry's own state, from the flag the server computed against the current retention. */
export function storageTrashState(entry: StorageTrashEntry): StorageTrashState {
  return entry.expired ? "expired" : "fresh";
}

/** What that state means for the entry, under the listing's state column. */
export function storageTrashStateLabel(state: StorageTrashState): string {
  return S.settings.storageTrashStateNames[state];
}

/**
 * Whether this version may move a row of a bill at all. The other half of the answer — what the
 * row costs to clear — is the class's own line ({@link storageClassCost}), so a report-only row is
 * read with the same price tag beside it, plus the fact that nothing here will pay it.
 */
export function storageExecutableLabel(executable: boolean): string {
  return S.settings.storageExecutable[executable ? "yes" : "no"];
}
