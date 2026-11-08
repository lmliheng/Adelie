/**
 * The cost center's error table and its clear action.
 *
 * Two properties a type checker cannot see. The action is offered only where it can succeed —
 * the route is owner-only, so showing it to a member would be an affordance whose only outcome
 * is a 403 — and only while there are rows to take.
 *
 * The other is the confirmation's wording, which is the whole safety mechanism here: the delete
 * is scoped to the filter on screen, so a dialog that named the Project's whole history, or
 * only the visible page, would send someone into an irreversible action describing the wrong
 * set — as would one that left out the records an ignore rule is holding back. Those sentences
 * are pure functions for exactly this reason — this package's vitest runs in `node`,
 * deliberately, so an opened dialog is not something a test can read.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { UsageErrorIgnoreRule, UsageErrorItem, UsageErrors } from "@adelie/server/api";
import {
  ErrorsPanel,
  IgnoreRulesBox,
  errorCopyText,
  errorsClearKeepsIgnoredText,
  errorsClearScopeText,
  ignoreRuleText,
} from "../src/features/usage/errors-panel";
import type { ErrorsFilters } from "../src/features/usage/errors-panel";
import { formatDateTime } from "../src/lib/format";
import { S, setActiveStrings, zh } from "../src/lib/strings";
import { en } from "../src/lib/strings-en";

afterEach(() => setActiveStrings(zh));

const item = (code: string): UsageErrorItem => ({
  ts: "2026-08-27T10:00:00.000Z",
  source: "http",
  code,
  kind: "unexpected",
  message: `${code} went wrong`,
  count: 1,
  firstTs: "2026-08-27T10:00:00.000Z",
});

function errorsOf(items: UsageErrorItem[], ignored = 0): UsageErrors {
  const total = items.reduce((sum, e) => sum + e.count, 0);
  return {
    total,
    unexpected: total,
    ignored,
    topCode: null,
    recent: items,
    rows: items.length,
  };
}

const FILTERS: ErrorsFilters = { from: "2026-08-01", to: "2026-08-27" };

function render(
  opts: {
    items?: UsageErrorItem[];
    ignored?: number;
    canClear?: boolean;
    canIgnore?: boolean;
    filters?: ErrorsFilters;
  } = {},
): string {
  const items = opts.items ?? [item("internal")];
  return renderToStaticMarkup(
    createElement(ErrorsPanel, {
      errors: errorsOf(items, opts.ignored ?? 0),
      projectId: "p1",
      filters: opts.filters ?? FILTERS,
      canClear: opts.canClear ?? true,
      canIgnore: opts.canIgnore ?? true,
      onReload: () => {},
    }),
  );
}

describe("ErrorsPanel clear action", () => {
  it("is offered to the Project owner only", () => {
    expect(render({ canClear: true })).toContain(S.usage.errorsClear);
    // A member reads the panel; the route refuses the delete, so the button is not there to
    // promise otherwise.
    expect(render({ canClear: false })).not.toContain(S.usage.errorsClear);
  });

  it("is absent while the filtered table is empty", () => {
    const empty = render({ items: [] });
    expect(empty).toContain(S.usage.errorsEmpty);
    expect(empty).not.toContain(S.usage.errorsClear);
  });

  it("is absent while a date bound is blank: the sentence could not describe that delete", () => {
    // A cleared date input sends no bound, which the route reads as unbounded on that side —
    // wider than anything the confirmation's "records outside that range are kept" can promise.
    expect(render({ filters: { from: "", to: "2026-08-27" } })).not.toContain(S.usage.errorsClear);
  });

  it("keeps the pager independent of it: rows but one page shows the action alone", () => {
    const onePage = render({ items: [item("internal")] });
    expect(onePage).toContain(S.usage.errorsClear);
    expect(onePage).not.toContain(S.usage.errorsOlder);
  });
});

describe("ErrorsPanel rows", () => {
  it("a row standing for several records says how many after its message, and when the first was", () => {
    const folded: UsageErrorItem = {
      ...item("messaging_connect_failed"),
      message: "gateway stopped acknowledging heartbeats",
      count: 3,
      firstTs: "2026-08-27T06:00:00.000Z",
    };
    const html = render({ items: [folded] });
    expect(html).toContain("×3");
    expect(html).toContain(
      `data-tooltip="${S.usage.errorsFirstAt(formatDateTime(folded.firstTs))}"`,
    );
    // The time shown is the latest one.
    expect(html).toContain(formatDateTime(folded.ts));
  });

  it("a single record says nothing more than it did", () => {
    const html = render({ items: [item("internal")] });
    expect(html).not.toContain("×1");
    expect(html).not.toContain(S.usage.errorsFirstAt(formatDateTime(item("internal").ts)));
  });

  it("pages by rows, while the stats above count records", () => {
    // Ten rows on this page out of 25, standing for 40 records.
    const recent = Array.from({ length: 10 }, (_, i) => item(`code_${i}`));
    const html = renderToStaticMarkup(
      createElement(ErrorsPanel, {
        errors: { total: 40, unexpected: 40, ignored: 0, topCode: null, recent, rows: 25 },
        projectId: "p1",
        filters: FILTERS,
        canClear: true,
        canIgnore: true,
        onReload: () => {},
      }),
    );
    expect(html).toContain(S.usage.errorsPageOf(1, 3, 25));
    expect(html).toContain(">40<");
  });
});

describe("errorsClearScopeText", () => {
  for (const [locale, dict] of Object.entries({ zh, en })) {
    it(`${locale}: a custom range is named by its dates, and the Agent when one is selected`, () => {
      setActiveStrings(dict);
      const ranged = errorsClearScopeText(FILTERS, undefined, 12);
      expect(ranged).toContain("2026-08-01");
      expect(ranged).toContain("2026-08-27");
      expect(ranged).toContain("12");
      // No Agent filter: the sentence must not claim one, or it describes a narrower delete
      // than the one about to run.
      expect(ranged).not.toContain("agent-7");

      const perAgent = errorsClearScopeText({ ...FILTERS, agentId: "agent-7" }, undefined, 3);
      expect(perAgent).toContain("agent-7");
      expect(perAgent).toContain("2026-08-01");
      expect(perAgent).toContain("3");
    });

    it(`${locale}: a quick preset is named as the picker names it, never as the dates behind it`, () => {
      setActiveStrings(dict);
      for (const preset of ["1h", "1d", "7d", "30d", "90d"] as const) {
        const text = errorsClearScopeText(FILTERS, preset, 12);
        expect(text).toContain(dict.usage.errorsClearRangePreset(preset));
        expect(text).not.toContain("2026-08-01");
        expect(text).not.toContain("2026-08-27");
        expect(text).toContain("12");
      }
      const perAgent = errorsClearScopeText({ ...FILTERS, agentId: "agent-7" }, "7d", 3);
      expect(perAgent).toContain("agent-7");
      expect(perAgent).toContain(dict.usage.errorsClearRangePreset("7d"));
    });
  }

  it("an empty agentId is no filter at all (the panel's own spelling of 'all agents')", () => {
    expect(errorsClearScopeText({ ...FILTERS, agentId: "" }, "7d", 4)).toBe(
      errorsClearScopeText(FILTERS, "7d", 4),
    );
  });

  for (const [locale, dict] of Object.entries({ zh, en })) {
    it(`${locale}: the table's category filter is named too, and the other category kept`, () => {
      setActiveStrings(dict);
      // The delete is scoped to what the table shows, so a sentence that left the category out
      // would tell the reader they keep rows it is about to take. The sentence names the category
      // as the control does; English drops the capital because it reads the word mid-sentence.
      const name = (label: string) => label.toLowerCase();
      const perKind = errorsClearScopeText({ ...FILTERS, kind: "unexpected" }, "7d", 5);
      expect(name(perKind)).toContain(name(dict.usage.errorsUnexpected));
      expect(perKind).toContain("5");

      const both = errorsClearScopeText(
        { ...FILTERS, kind: "expected", agentId: "agent-7" },
        "7d",
        2,
      );
      expect(name(both)).toContain(name(dict.usage.errorsExpected));
      expect(both).toContain("agent-7");
      expect(both).toContain(dict.usage.errorsClearRangePreset("7d"));
    });
  }
});

describe("ErrorsPanel category control", () => {
  it("is drawn with both categories and 'all', and narrows nothing until one is chosen", () => {
    const html = render({ items: [item("internal")] });
    for (const label of [
      S.usage.errorsFilterAll,
      S.usage.errorsUnexpected,
      S.usage.errorsExpected,
    ]) {
      expect(html).toContain(label);
    }
    // Nothing chosen: the table is the unfiltered first page and says so.
    expect(html).not.toContain(S.usage.errorsEmptyKind);
  });

  it("stays on screen while the table is empty, so its own choice can be undone", () => {
    const html = render({ items: [] });
    expect(html).toContain(S.usage.errorsFilterAll);
    expect(html).toContain(S.usage.errorsUnexpected);
  });
});

describe("ErrorsPanel copy action", () => {
  it("is drawn once per row, named for what it copies", () => {
    const html = render({ items: [item("internal"), item("tool_failed:exec_command")] });
    expect(html.split(`aria-label="${S.usage.errorsCopy}"`).length - 1).toBe(2);
    // An empty table has nothing to copy, so the action goes with the rows.
    expect(render({ items: [] })).not.toContain(S.usage.errorsCopy);
  });

  // Where a copy here is for pasting the error somewhere else, the text has to stand alone: the
  // reader on the other end sees none of the panel's filters, its tooltips, or the row's fold
  // count. Asserted per locale because the heading reads in the interface's language.
  for (const [locale, dict] of Object.entries({ zh, en })) {
    it(`${locale}: carries the time, the source · code, the type and the message in full`, () => {
      setActiveStrings(dict);
      const e: UsageErrorItem = {
        ...item("tool_failed:exec_command"),
        source: "environment",
        kind: "unexpected",
        message: "EBUSY: resource busy or locked, rmdir 'skills/wps-office'\n  at rm (node:fs)",
      };
      const text = errorCopyText(e);
      expect(text).toContain(formatDateTime(e.ts));
      // The bracketed source is abbreviated as the table abbreviates it, and the code is raw:
      // `[environment]` is the server's spelling, `[env]` the panel's.
      expect(text).toContain("[env] tool_failed:exec_command");
      expect(text).toContain(dict.usage.errorsUnexpected);
      // The message is copied whole, newlines included — the detail after the first line is the
      // part that explains the error.
      expect(text.endsWith(`\n${e.message}`)).toBe(true);
      expect(text).toContain("  at rm (node:fs)");
      // Heading and message are two parts, not one run-on line.
      expect(text.split("\n")[0]).not.toContain("EBUSY");
    });

    it(`${locale}: a folded row also carries how many records and when the first was`, () => {
      setActiveStrings(dict);
      const folded: UsageErrorItem = {
        ...item("messaging_connect_failed"),
        count: 3,
        firstTs: "2026-08-27T06:00:00.000Z",
      };
      const text = errorCopyText(folded);
      expect(text.split("\n")[0]).toContain("×3");
      expect(text.split("\n")[0]).toContain(
        dict.usage.errorsFirstAt(formatDateTime(folded.firstTs)),
      );
      // A single record says neither: the count is already the absence of a fold.
      const single = errorCopyText(item("internal"));
      expect(single).not.toContain("×1");
      expect(single).not.toContain(
        dict.usage.errorsFirstAt(formatDateTime(item("internal").firstTs)),
      );
    });
  }

  it("reads an unknown category as expected, as the badge beside it does", () => {
    // The route only writes the two kinds; a row from an older or newer server must still copy
    // something true rather than the word "undefined".
    const text = errorCopyText({ ...item("internal"), kind: "something_new" });
    expect(text).toContain(S.usage.errorsExpected);
    expect(text).not.toContain("undefined");
  });
});

/** The rule list, rendered on its own: the panel fetches it in an effect, which `renderToStaticMarkup` never runs. */
describe("IgnoreRulesBox", () => {
  const rule = (over: Partial<UsageErrorIgnoreRule> = {}): UsageErrorIgnoreRule => ({
    id: 7,
    source: "llm",
    code: "llm_retried",
    messageLike: null,
    note: null,
    createdBy: "owner",
    createdAt: "2026-08-27T10:00:00.000Z",
    hidden: 349,
    lastTs: "2026-08-27T09:00:00.000Z",
    ...over,
  });

  const box = (rules: UsageErrorIgnoreRule[] | null): string =>
    renderToStaticMarkup(createElement(IgnoreRulesBox, { rules, onUnignore: () => {} }));

  it("draws the empty state when the Project has no rules yet, rather than an empty list", () => {
    for (const rules of [null, []]) {
      const html = box(rules);
      expect(html).toContain(S.usage.errorsIgnoreRules);
      expect(html).toContain(S.usage.errorsIgnoreRuleNone);
    }
  });

  it("gives each rule what it covers, how much and how new, and the way back out", () => {
    const html = box([rule()]);
    expect(html).toContain("[llm] llm_retried");
    expect(html).toContain(S.usage.errorsIgnoreRuleHidden(349));
    expect(html).toContain(S.usage.errorsIgnoreRuleLast(formatDateTime(rule().lastTs!)));
    expect(html).toContain(S.usage.errorsUnignore);
    expect(html).toContain(S.usage.errorsIgnoreNotice);
  });

  it("a rule that covers nothing yet says so instead of standing for a zero", () => {
    const html = box([rule({ hidden: 0, lastTs: null })]);
    expect(html).toContain(S.usage.errorsIgnoreRuleHiddenNone);
    expect(html).not.toContain(S.usage.errorsIgnoreRuleHidden(0));
  });

  it("carries the owner's own reason when they wrote one", () => {
    expect(box([rule({ note: "引擎每次都会自己重连" })])).toContain("引擎每次都会自己重连");
  });

  // The one sentence a rule must not overstate: `[llm] llm_retried` covers every record of that
  // code, and one narrowed to a fragment covers only part of it — the list has to say which.
  for (const [locale, dict] of Object.entries({ zh, en })) {
    it(`${locale}: a fragment-narrowed rule names the fragment, a whole-class one does not`, () => {
      setActiveStrings(dict);
      const narrowed = ignoreRuleText(rule({ messageLike: "UND_ERR_SOCKET" }));
      expect(narrowed).toContain("[llm] llm_retried");
      expect(narrowed).toContain("UND_ERR_SOCKET");
      expect(narrowed).toContain(dict.usage.errorsIgnoreRuleFragment("UND_ERR_SOCKET"));

      const whole = ignoreRuleText(rule());
      expect(whole).toBe("[llm] llm_retried");
      expect(whole).not.toContain(dict.usage.errorsIgnoreRuleFragment(""));
    });
  }
});

describe("ErrorsPanel ignore action", () => {
  it("is offered to the Project owner only: the route refuses a member, so the panel does not promise it", () => {
    expect(render({ canIgnore: true })).toContain(S.usage.errorsIgnoreAction);
    expect(render({ canIgnore: false })).not.toContain(S.usage.errorsIgnoreAction);
  });

  it("is drawn once per row, and goes with the rows", () => {
    const html = render({ items: [item("internal"), item("tool_failed:exec_command")] });
    expect(html.split(`aria-label="${S.usage.errorsIgnoreAction}"`).length - 1).toBe(2);
    expect(render({ items: [] })).not.toContain(S.usage.errorsIgnoreAction);
  });
});

describe("ErrorsPanel ignored view", () => {
  it("is one of the control's four choices, beside the two categories and both", () => {
    const html = render({ items: [item("internal")] });
    for (const label of [
      S.usage.errorsFilterAll,
      S.usage.errorsUnexpected,
      S.usage.errorsExpected,
      S.usage.errorsIgnored,
    ]) {
      expect(html).toContain(label);
    }
  });

  it("reports what the rules hold back, so the numbers beside it are never read as the whole range", () => {
    const html = render({ items: [item("internal")], ignored: 261 });
    expect(html).toContain(`>${S.usage.errorsIgnored}<`);
    expect(html).toContain(">261<");
  });

  it("says in the clear confirmation that the ignored records are not the ones it counts", () => {
    // The sentence names what the table showed; on any other view that leaves the ignored rows out,
    // and a reader taking "42 records" for the whole range would be reading it wrong. The dialog is
    // not renderable here (see the file header), so its own wording is asserted as a pure function.
    expect(errorsClearKeepsIgnoredText(5, FILTERS)).toBe(S.usage.errorsClearKeepsIgnored(5));
    // Nothing held back: nothing to add. On the ignored view those records are the sentence's own
    // subject, so the note would count them twice.
    expect(errorsClearKeepsIgnoredText(0, FILTERS)).toBeNull();
    expect(errorsClearKeepsIgnoredText(5, { ...FILTERS, ignored: true })).toBeNull();
  });
});

describe("errorsClearScopeText on the ignored view", () => {
  for (const [locale, dict] of Object.entries({ zh, en })) {
    it(`${locale}: names the ignored records as such, and keeps what is not ignored`, () => {
      setActiveStrings(dict);
      const text = errorsClearScopeText({ ...FILTERS, ignored: true }, "7d", 6);
      // It says "ignored" in the interface's own word for it — the sentence names the set it takes.
      expect(text.toLowerCase()).toContain(dict.usage.errorsIgnored.toLowerCase());
      expect(text).toContain("6");
      expect(text).toContain(dict.usage.errorsClearRangePreset("7d"));
      // Not the category sentence: the ignored view is not a category, and what it keeps is every
      // record no rule covers rather than "the other category".
      expect(text).not.toContain(dict.usage.errorsClearRangeCustom(FILTERS.from!, FILTERS.to!));

      const perAgent = errorsClearScopeText(
        { ...FILTERS, ignored: true, agentId: "agent-7" },
        "7d",
        2,
      );
      expect(perAgent).toContain("agent-7");
      expect(perAgent).toContain(dict.usage.errorsClearRangePreset("7d"));
    });
  }
});
