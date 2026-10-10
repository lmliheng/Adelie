/**
 * The storage report's vocabulary (features/settings/storage-labels.ts), pinned by value.
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
 * - a look-alike environment group says what matched it (the name, or what it holds).
 *
 * The lists below are written out rather than derived from a union, so a value the engine adds
 * fails this test (as it fails the type check in storage-labels.ts) instead of passing quietly.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  storageClassCost,
  storageClassLabel,
  storageEnvGroupKindLabel,
  storageRulesLabel,
} from "../src/features/settings/storage-labels";
import { setActiveStrings, zh } from "../src/lib/strings";
import { en } from "../src/lib/strings-en";
import type { StorageCandidateRule, StorageClass } from "@lmliheng/penguin-server/api";

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
