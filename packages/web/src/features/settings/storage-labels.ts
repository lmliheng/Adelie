/**
 * The storage report's vocabulary in the reader's words (storage-section.tsx draws it).
 *
 * The ledger's classes and rules arrive as ids — `session_drafts`, `orphan` — because the API,
 * the rules engine in `@lmliheng/penguin-core` (its `state/storage.ts` defines them) and a future
 * cleanup plan all have to agree on them. A person reading the report has to recognise what
 * `shared_env` or `budget` means, so every id is translated here, in one place, and both
 * dictionaries carry the words (`S.settings`), so the labels follow the UI language like the
 * rest of the app.
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
