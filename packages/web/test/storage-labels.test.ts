/**
 * The storage report's and its bills' vocabulary (features/settings/storage-labels.ts), pinned by
 * value.
 *
 * The report's reader decides nothing from this page, but they do read it: a class or a rule
 * rendered as its raw id (`session_drafts`, `orphan`) is a word this audience cannot act on, and a
 * class that silently fell through to "Other" would hide the very thing the report measured. So
 * every id the API can send is checked here, in both dictionaries, at once:
 *
 * - each class has a name of its own and a line saying what clearing it would cost — including the
 *   classes that never become a candidate, which say that rather than inventing a price;
 * - each rule has a name of its own;
 * - a candidate's rules render joined, and an empty list renders words rather than nothing;
 * - a look-alike environment group says what matched it (the name, or what it holds);
 * - a bill's state and a trash entry's are read off what the server sent, and each has its own
 *   sentence — the state decides whether the boxes on a bill mean anything, so it cannot be the
 *   same words for two of them;
 * - a bill row says whether this version may move it, which is the one thing a reviewer cannot
 *   learn from its size.
 *
 * The lists below are written out rather than derived from a union, so a value the engine adds
 * fails this test (as it fails the type check in storage-labels.ts) instead of passing quietly.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  storageClassCost,
  storageClassLabel,
  storageEnvGroupKindLabel,
  storageExecutableLabel,
  storagePlanState,
  storagePlanStateText,
  storageRulesLabel,
  storageTrashState,
  storageTrashStateLabel,
} from "../src/features/settings/storage-labels";
import type { StoragePlanState, StorageTrashState } from "../src/features/settings/storage-labels";
import { setActiveStrings, zh } from "../src/lib/strings";
import { en } from "../src/lib/strings-en";
import type {
  StorageCandidateRule,
  StorageClass,
  StoragePlanView,
  StorageTrashEntry,
} from "@lmliheng/penguin-server/api";

/** Every class the ledger accounts for (core's STORAGE_CLASSES, the API's StorageClass). */
const CLASSES: StorageClass[] = [
  "protected",
  "tmp_workspaces",
  "session_drafts",
  "traces",
  "shared_env",
  "trash",
  "database",
  "other",
];

/** Every rule a candidate can carry. */
const RULES: StorageCandidateRule[] = ["empty", "unreferenced", "orphan", "idle", "budget"];

/** Every state a bill can be read as, and every state a trash entry can. */
const PLAN_STATES: StoragePlanState[] = ["usable", "applied", "expired"];
const TRASH_STATES: StorageTrashState[] = ["fresh", "expired"];

/** The two answers a bill row gives about whether this version may move it. */
const EXECUTABLE = [true, false];

/** A bill carrying only what decides its state. */
function plan(over: Partial<StoragePlanView>): StoragePlanView {
  return {
    id: "2026-10-10-09-12-00-4f2a1c",
    root: "/home/demo/.adelie/data",
    createdAt: "2026-10-10T09:12:00.000Z",
    expiresAt: "2026-10-11T09:12:00.000Z",
    fingerprint: "fp",
    totalBytes: 0,
    entries: [],
    excluded: [],
    executableClasses: ["tmp_workspaces"],
    appliedAt: null,
    appliedPaths: [],
    usable: true,
    expired: false,
    ...over,
  };
}

afterEach(() => setActiveStrings(zh));

describe("storageClassLabel / storageClassCost", () => {
  it("names every class in the reader's words, in both locales", () => {
    for (const [locale, dict] of [
      ["zh", zh],
      ["en", en],
    ] as const) {
      setActiveStrings(dict);
      const labels = CLASSES.map((cls) => storageClassLabel(cls));
      for (const cls of CLASSES) {
        expect(storageClassLabel(cls), `${locale} ${cls}`).toBe(
          dict.settings.storageClassNames[cls],
        );
        // The hole this guards: a missing entry would leave the raw id on screen, which reads as
        // a directory name rather than as a kind of data.
        expect(storageClassLabel(cls), `${locale} ${cls}`).not.toBe(cls);
      }
      // One word per class: two classes sharing a name would merge in the reader's head.
      expect(new Set(labels).size, locale).toBe(CLASSES.length);
    }
  });

  it("says what clearing a class would cost, in both locales, once per class", () => {
    for (const [locale, dict] of [
      ["zh", zh],
      ["en", en],
    ] as const) {
      setActiveStrings(dict);
      for (const cls of CLASSES) {
        const cost = storageClassCost(cls);
        expect(cost, `${locale} ${cls}`).toBe(dict.settings.storageClassCost[cls]);
        expect(cost.trim(), `${locale} ${cls}`).not.toBe("");
        // The cost line is read under the class's own name, so it must not be the name again.
        expect(cost, `${locale} ${cls}`).not.toBe(dict.settings.storageClassNames[cls]);
      }
      const costs = CLASSES.map((cls) => storageClassCost(cls));
      expect(new Set(costs).size, locale).toBe(CLASSES.length);
    }
  });
});

describe("storageRulesLabel", () => {
  it("names every rule in the reader's words, in both locales", () => {
    for (const [locale, dict] of [
      ["zh", zh],
      ["en", en],
    ] as const) {
      setActiveStrings(dict);
      for (const rule of RULES) {
        expect(storageRulesLabel([rule]), `${locale} ${rule}`).toBe(
          dict.settings.storageRuleNames[rule],
        );
        expect(storageRulesLabel([rule]), `${locale} ${rule}`).not.toBe(rule);
      }
    }
  });

  it("joins the rules one candidate matched, keeping their order and repeating none", () => {
    setActiveStrings(zh);
    expect(storageRulesLabel(["empty", "unreferenced"])).toBe("空目录 · 无引用");
    expect(storageRulesLabel(["idle", "budget"])).toBe("静默超期 · 超出预算");
  });

  it("says so in words when the server recorded no rule, rather than rendering nothing", () => {
    for (const dict of [zh, en]) {
      setActiveStrings(dict);
      expect(storageRulesLabel([])).toBe(dict.settings.storageRulesNone);
      expect(storageRulesLabel([]).trim()).not.toBe("");
    }
  });
});

describe("storageEnvGroupKindLabel", () => {
  it("says whether the group was matched by name or by what it holds", () => {
    for (const dict of [zh, en]) {
      setActiveStrings(dict);
      expect(storageEnvGroupKindLabel("name")).toBe(dict.settings.storageEnvGroupKindName);
      expect(storageEnvGroupKindLabel("structure")).toBe(
        dict.settings.storageEnvGroupKindStructure,
      );
      expect(storageEnvGroupKindLabel("name")).not.toBe(storageEnvGroupKindLabel("structure"));
    }
  });
});

describe("storagePlanState / storagePlanStateText", () => {
  it("reads the state off what the bill carries, with 'applied' stronger than 'expired'", () => {
    expect(storagePlanState(plan({}))).toBe("usable");
    expect(storagePlanState(plan({ expired: true, usable: false }))).toBe("expired");
    expect(storagePlanState(plan({ appliedAt: "2026-10-10T10:00:00.000Z", usable: false }))).toBe(
      "applied",
    );
    // A bill applied yesterday is spent whatever its day says: reading it as "expired" would point
    // the reviewer at the clock instead of at the scan they need.
    expect(
      storagePlanState(
        plan({ appliedAt: "2026-10-09T10:00:00.000Z", expired: true, usable: false }),
      ),
    ).toBe("applied");
  });

  it("has its own sentence for each state, in both locales", () => {
    for (const dict of [zh, en]) {
      setActiveStrings(dict);
      const sentences = PLAN_STATES.map((state) => storagePlanStateText(state));
      for (const state of PLAN_STATES) {
        expect(storagePlanStateText(state), state).toBe(dict.settings.storagePlanStateText[state]);
        expect(storagePlanStateText(state).trim(), state).not.toBe("");
        // A state that read as another state's words would tell a reviewer to wait for a bill that
        // is already spent, or to approve one whose boxes no longer mean anything.
        expect(storagePlanStateText(state), state).not.toBe(state);
      }
      expect(new Set(sentences).size, "one sentence per state").toBe(PLAN_STATES.length);
    }
  });
});

describe("storageTrashState / storageTrashStateLabel", () => {
  const entry = (over: Partial<StorageTrashEntry>): StorageTrashEntry => ({
    id: "20261010-130522",
    createdAt: "2026-10-10T13:05:22.000Z",
    planId: "2026-10-10-13-05-00-4f2a1c",
    bytes: 1_000,
    files: 3,
    items: [],
    expired: false,
    ...over,
  });

  it("takes the flag the server computed against the retention", () => {
    expect(storageTrashState(entry({}))).toBe("fresh");
    expect(storageTrashState(entry({ expired: true }))).toBe("expired");
  });

  it("says what each state means for the entry, in both locales", () => {
    for (const dict of [zh, en]) {
      setActiveStrings(dict);
      for (const state of TRASH_STATES) {
        expect(storageTrashStateLabel(state), state).toBe(
          dict.settings.storageTrashStateNames[state],
        );
        expect(storageTrashStateLabel(state), state).not.toBe(state);
      }
      expect(storageTrashStateLabel("fresh")).not.toBe(storageTrashStateLabel("expired"));
    }
  });
});

describe("storageExecutableLabel", () => {
  it("says whether this version may move a row, in both locales, once per answer", () => {
    for (const dict of [zh, en]) {
      setActiveStrings(dict);
      for (const flag of EXECUTABLE) {
        expect(storageExecutableLabel(flag), String(flag)).toBe(
          dict.settings.storageExecutable[flag ? "yes" : "no"],
        );
        expect(storageExecutableLabel(flag).trim(), String(flag)).not.toBe("");
      }
      // "Can be moved" and "report only" must not be the same words: that difference is the whole
      // reason a row is drawn with a dead box.
      expect(storageExecutableLabel(true)).not.toBe(storageExecutableLabel(false));
    }
  });
});
