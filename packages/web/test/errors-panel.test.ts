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
 * set. That sentence is a pure function for exactly this reason — this package's vitest runs in
 * `node`, deliberately, so an opened dialog is not something a test can read.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { UsageErrorItem, UsageErrors } from "@adelie/server/api";
import {
  ErrorsPanel,
  errorCopyText,
  errorsClearScopeText,
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

function errorsOf(items: UsageErrorItem[]): UsageErrors {
  const total = items.reduce((sum, e) => sum + e.count, 0);
  return {
    total,
    unexpected: total,
    topCode: null,
    recent: items,
    rows: items.length,
  };
}

const FILTERS: ErrorsFilters = { from: "2026-08-01", to: "2026-08-27" };

function render(
  opts: {
    items?: UsageErrorItem[];
    canClear?: boolean;
    filters?: ErrorsFilters;
  } = {},
): string {
  const items = opts.items ?? [item("internal")];
  return renderToStaticMarkup(
    createElement(ErrorsPanel, {
      errors: errorsOf(items),
      projectId: "p1",
      filters: opts.filters ?? FILTERS,
      canClear: opts.canClear ?? true,
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
        errors: { total: 40, unexpected: 40, topCode: null, recent, rows: 25 },
        projectId: "p1",
        filters: FILTERS,
        canClear: true,
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
