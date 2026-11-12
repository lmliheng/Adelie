/**
 * Server-side error view for the cost center: **a single panel** — a row of small
 * stats up top (total / unexpected / expected / most common error code),
 * with a recent-errors table below (time, source · error code, kind,
 * message). What an error needs to answer is "what exactly went wrong" — a
 * detail table is more direct than a chart here: the count alone in the stats already covers the summary.
 *
 * The server folds a day's repeats of one error into one row: the stats count records, the
 * table and its pager count rows, and a row standing for several records says how many after
 * its message.
 *
 * Color semantics are consistent site-wide: unexpected (500s / runtime
 * exceptions) is a prominent rose; expected (HttpError, business 4xx) recedes into gray.
 * The outer frame is provided by the caller's ChartCard (full width, below the four business charts).
 */
import { useEffect, useMemo, useState } from "react";
import type { UsageErrorIgnoreRule, UsageErrorItem, UsageErrors } from "@adelie/server/api";
import {
  Badge,
  ConfirmModal,
  CopyButton,
  GlyphIcon,
  ICONS,
  Input,
  Pager,
  Segmented,
  toastError,
  toastSuccess,
} from "@adelie/ui";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { apiErrorText } from "../../lib/api-error";
import { formatDateTime } from "../../lib/format";
import { Empty } from "./usage-charts";
import { toneInk } from "../../lib/tone";

/** The two error categories. */
type ErrorKindKey = "unexpected" | "expected";

/**
 * The table's own control: one of the two categories, both, or the ignored view. The last is not a
 * category — it is the other side of the ignore rules, which is why the table's kinds are still
 * both drawn there (see activeFilters) — but it is the same kind of choice: which slice of the
 * filtered set the table below shows, and therefore what its pager, its row count and the clear
 * act on.
 */
type ErrorKindFilter = ErrorKindKey | "all" | "ignored";

/** The date/agent filter the panel reads through, and that a clear deletes through. */
export interface ErrorsFilters {
  from?: string;
  to?: string;
  /** The trailing window narrowing those dates (the two "last …" presets); both or neither. */
  fromTs?: string;
  toTs?: string;
  agentId?: string;
  /**
   * The table's category filter, when one is chosen. The panel owns this control rather than
   * the page's filter bar, so it is merged in here — and read by the clear as well, because a
   * button that emptied the category the reader had filtered OUT would be taking rows off a
   * table they never saw.
   */
  kind?: ErrorKindKey;
  /**
   * The ignored view: true reads the records the Project's rules cover, which every other view
   * leaves out. Merged in here like `kind`, and for the same reason — the clear takes what the
   * table shows, and on this view that is exactly the ignored rows.
   */
  ignored?: boolean;
}

/** The quick range presets the clear confirmation names by name; a custom range is named by its dates. */
export type ErrorsRangePreset = "1h" | "1d" | "7d" | "30d" | "90d";

/**
 * The one sentence the clear confirmation has to get right: exactly which rows will go.
 *
 * The delete is scoped to the filter on screen, so a dialog naming a wider set (the Project's
 * whole history) or a narrower one (this page of rows) would misdescribe what the button does
 * — which is the entire failure a confirmation exists to prevent. The range is named the way
 * the picker names it — "the last 7 days", not the two dates standing for it, which a reader
 * would have to work back from — and only a custom range, which has no other name, is spelled
 * as its dates. The table's own category filter is part of that set too, so it is named here
 * as well: the button empties what the table shows, and a sentence that left the category out
 * would promise the reader keeps rows the delete is about to take. Pure and exported so that
 * is asserted directly: this package's vitest runs in `node`, so an opened dialog is not
 * something a test can inspect.
 */
export function errorsClearScopeText(
  filters: ErrorsFilters,
  preset: ErrorsRangePreset | undefined,
  count: number,
): string {
  const range =
    preset !== undefined
      ? S.usage.errorsClearRangePreset(preset)
      : S.usage.errorsClearRangeCustom(filters.from ?? "", filters.to ?? "");
  const agent =
    filters.agentId !== undefined && filters.agentId !== "" ? filters.agentId : undefined;
  // The ignored view reads its own set, and what it keeps is every record no rule covers — not
  // "the other category". Naming it with the category sentence would describe the wrong delete, so
  // it has its own.
  if (filters.ignored === true) {
    return agent !== undefined
      ? S.usage.errorsClearScopeIgnoredAgent(count, range, agent)
      : S.usage.errorsClearScopeIgnored(count, range);
  }
  const kind = filters.kind !== undefined ? kindLabel(filters.kind) : undefined;
  if (kind !== undefined && agent !== undefined) {
    return S.usage.errorsClearScopeKindAgent(count, range, kind, agent);
  }
  if (kind !== undefined) return S.usage.errorsClearScopeKind(count, range, kind);
  if (agent !== undefined) return S.usage.errorsClearScopeAgent(count, range, agent);
  return S.usage.errorsClearScope(count, range);
}

/**
 * The line a clear's confirmation adds when the range holds records an ignore rule is keeping off
 * the table — null when there is none to add. Without it, the sentence above reads as the whole
 * range while the ignored records are neither counted nor shown; on the ignored view those records
 * ARE that sentence's subject, so adding this would count them twice. Pure and exported for the
 * reason `errorsClearScopeText` is: this package's vitest runs in `node`, so an opened dialog is
 * not something a test can inspect.
 */
export function errorsClearKeepsIgnoredText(
  ignored: number,
  filters: ErrorsFilters,
): string | null {
  if (ignored <= 0 || filters.ignored === true) return null;
  return S.usage.errorsClearKeepsIgnored(ignored);
}

/**
 * Whether the filter on screen is one a clear may be offered for.
 *
 * Both bounds have to be real dates. A custom range with an emptied date input sends no bound
 * at all, which the route reads as "unbounded on that side" — so the delete would reach past
 * every row the reader saw while the sentence above still promised that records outside the
 * range are kept. Refusing to offer the action is the honest answer; the picker is one click
 * from a range that has both ends.
 */
export function clearableFilter(filters: ErrorsFilters): boolean {
  return Boolean(filters.from) && Boolean(filters.to);
}

/** Copy: S is a runtime live binding (switching language remounts the whole tree), so it must be read at render time. */
function kindLabel(key: ErrorKindKey): string {
  return key === "unexpected" ? S.usage.errorsUnexpected : S.usage.errorsExpected;
}

function kindOf(kind: string): ErrorKindKey {
  return kind === "unexpected" ? "unexpected" : "expected";
}

/**
 * Source labels are abbreviated so the bracket stays narrow beside a long code:
 * `[env] tool_failed:exec_command`, `[http] password`. Only `environment` needs shortening
 * -- every other source is already short enough to read at a glance.
 */
const SOURCE_ABBREV: Readonly<Record<string, string>> = { environment: "env" };

/** `[env] tool_failed:read_file` -- the bracketed source followed by the raw error code. */
function sourceCode(source: string, code: string): string {
  return `[${SOURCE_ABBREV[source] ?? source}] ${code}`;
}

/**
 * What a row's copy button puts on the clipboard: one heading line — when it last happened,
 * where it came from, which category it is in, and, for a row folding several records, how many
 * and when the first was — followed by the message in full.
 *
 * What a copy here is for is getting the error OUT of the panel: pasting it into a chat, an
 * issue, or to another agent. So the block has to stand on its own — the raw code, the full
 * message with its newlines (the provider's 402 body is the part that explains it), and the
 * conditions the panel's two filters would otherwise only imply. Nothing the reader can already
 * see, nothing they cannot: the row's own tooltip carries the first timestamp too, and this is
 * the same two facts in text rather than a mouse-only affordance.
 *
 * Pure and exported for the reason `errorsClearScopeText` is: this package's vitest runs in
 * `node`, so a click and a clipboard are not something a test can observe — the text is.
 */
export function errorCopyText(e: UsageErrorItem): string {
  const head = [formatDateTime(e.ts), sourceCode(e.source, e.code), kindLabel(kindOf(e.kind))];
  if (e.count > 1) {
    head.push(`×${e.count}`, S.usage.errorsFirstAt(formatDateTime(e.firstTs)));
  }
  return `${head.join(" · ")}\n${e.message}`;
}

/**
 * One ignore rule as the panel words it: the bracketed class the table's own column shows, plus
 * the fragment when the rule covers only part of that class — because a rule that says
 * `[llm] llm_retried` while in fact covering only its socket drops would be claiming more than it
 * does, and "why is this particular record still here" is the question the list exists to answer.
 *
 * Pure and exported for the same reason the two text builders beside it are: this package's vitest
 * runs in `node`, where a rendered list is readable but a click is not.
 */
export function ignoreRuleText(rule: UsageErrorIgnoreRule): string {
  const label = sourceCode(rule.source, rule.code);
  return rule.messageLike !== null
    ? `${label} · ${S.usage.errorsIgnoreRuleFragment(rule.messageLike)}`
    : label;
}

/**
 * The ignored view's own explanation: the rules that put those rows there, each with what it covers
 * and how new the newest of it is, and the way back out. Drawn above the table because it is the
 * answer to the question that table raises ("why is this hidden?").
 *
 * A component of its own rather than a block inside the panel for the reason the text builders are
 * functions: this package's vitest runs in `node`, the panel fetches the rules in an effect, and
 * `renderToStaticMarkup` never runs effects — so a list drawn inline could only ever be asserted as
 * "no rules yet". Exported, it is renderable with rules in hand.
 */
export function IgnoreRulesBox({
  rules,
  onUnignore,
}: {
  /** null while the list is not read yet (never fetched, or a read that failed) — drawn as the empty state, which is also what a Project with no rules shows. */
  rules: UsageErrorIgnoreRule[] | null;
  onUnignore: (rule: UsageErrorIgnoreRule) => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-gray-200 px-3 py-2 text-xs dark:border-gray-800">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {S.usage.errorsIgnoreRules}
        </span>
        <span className="text-gray-400 dark:text-gray-500">{S.usage.errorsIgnoreNotice}</span>
      </div>
      {rules === null || rules.length === 0 ? (
        <p className="mt-1 text-gray-400 dark:text-gray-500">{S.usage.errorsIgnoreRuleNone}</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
              data-ignore-rule={rule.id}
            >
              <span className="break-words font-mono text-gray-500 dark:text-gray-400">
                {ignoreRuleText(rule)}
              </span>
              <span className="text-gray-400 dark:text-gray-500">
                {rule.hidden > 0
                  ? S.usage.errorsIgnoreRuleHidden(rule.hidden)
                  : S.usage.errorsIgnoreRuleHiddenNone}
              </span>
              {rule.lastTs !== null && (
                <span className="text-gray-400 dark:text-gray-500">
                  {S.usage.errorsIgnoreRuleLast(formatDateTime(rule.lastTs))}
                </span>
              )}
              <button
                type="button"
                onClick={() => onUnignore(rule)}
                className="rounded-md border border-gray-200 px-2 py-0.5 text-gray-500 transition-colors duration-150 hover:border-gray-300 hover:text-gray-700 dark:border-gray-800 dark:hover:border-gray-700 dark:hover:text-gray-300"
              >
                {S.usage.errorsUnignore}
              </button>
              {/* The owner's own words for why it is silenced, when they wrote any. Muted, and last:
                  it explains a rule that is already fully described without it. */}
              {rule.note !== null && (
                <span className="text-gray-400 dark:text-gray-500">{rule.note}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A single small stat: name + value, one row side by side (not turned into a chart). */
function Stat({
  label,
  value,
  alert,
  muted,
}: {
  label: string;
  value: string;
  /** Prominent value (unexpected errors): rose. */
  alert?: boolean;
  muted?: boolean;
}) {
  const tone = alert
    ? toneInk.danger
    : muted
      ? "text-gray-500 dark:text-gray-400"
      : "text-gray-900 dark:text-gray-100";
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`font-mono text-sm font-semibold tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}

/** Header cell: left-aligned, recessive gray. */
function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`py-1.5 pr-2 font-medium ${className}`}>{children}</th>;
}

/**
 * Error panel: stats + a recent-errors table (the server already takes the top N, newest first).
 * The message column shows **one line per row by default** (kept compact — an error storm can
 * fill the table); clicking a message expands it in place to the full text (wrapping, newlines
 * preserved — the upstream detail after the code, e.g. a provider's 402 body, is what matters),
 * and clicking again collapses it. The full text is also in the hover title. Cells align to the
 * top so an expanded multi-line message keeps the row tidy; height is bounded by the page size
 * alone — the table never scrolls vertically (paging is the way past it). Its four columns need
 * a floor to stay legible, so on a viewport narrower than that floor the table scrolls
 * sideways inside its own box rather than dragging the page along with it.
 *
 * The panel brings one filter of its own: a category control (both / unexpected / expected)
 * right above the table. The stats keep counting both categories — they are the range's summary,
 * and the control says which slice of it the table below is showing — but the table, its pager,
 * its row count and the clear all follow it, and page 0 of a narrowed table is read rather than
 * taken from the dashboard snapshot, which folds both categories.
 *
 * The footer under the table carries the pager and, for a Project owner, the clear action.
 * Clearing deletes the records the current filter selects — the set the reader is looking at,
 * not the Project's whole history — and the confirmation says which set that is and how many
 * records it holds, because a deleted error record has no other copy anywhere. That count is
 * read when the action is clicked and the delete stops at the newest record it saw, so the
 * sentence stays true even across the records the page itself creates while it loads.
 */
export function ErrorsPanel({
  errors,
  projectId,
  filters,
  preset,
  canClear,
  canIgnore,
  onReload,
}: {
  errors: UsageErrors;
  projectId: string;
  /**
   * The dashboard's own date/agent filter — a page must never widen what the summary counted.
   * Memoize it at the call site: the fetch effect depends on the object's identity.
   */
  filters: ErrorsFilters;
  /** The quick preset `filters` stands for, named as such in the clear confirmation; absent for a custom range. */
  preset?: ErrorsRangePreset;
  /**
   * Whether this viewer may empty the table (Project owner). A member can read the panel but
   * not clear it, and the route enforces that on its own; hiding the button keeps the panel
   * from offering an action that can only end in a 403.
   */
  canClear: boolean;
  /**
   * Whether this viewer may manage the ignore rules (Project owner, the same line the clear
   * draws). A member still sees the ignored view and the count in the stats — what a rule hides
   * must never be hidden from them — but not the rules themselves, which are the management
   * surface.
   */
  canIgnore: boolean;
  /**
   * Reload the dashboard — the stats above the table are the caller's data, not this panel's.
   * Called after a clear, and when the confirmation opens: the sentence names a count read at
   * the click, and the stats behind it would otherwise keep the snapshot from before the page's
   * own requests were answered, disagreeing with the dialog in front of the reader.
   */
  onReload: () => void;
}) {
  const { total, unexpected, ignored, topCode, recent, rows } = errors;
  // Page size is read off the first page rather than duplicating the server's ERROR_RECENT_N:
  // whenever a second page exists at all, `recent` is exactly that many rows, so the two cannot
  // drift apart into skipping or repeating rows. (Empty means a single empty page anyway.)
  const pageSize = Math.max(1, recent.length);
  // Paging: page 0 is the `recent` the dashboard response already carried, so it costs no
  // request; later pages are fetched on demand.
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<UsageErrorItem[]>(recent);
  // The row count the pager counts pages against: seeded from the dashboard snapshot, then
  // replaced by each page's own count. The snapshot goes stale (rows evicted by the row cap, an
  // Agent deleted between load and click), and pinning to it computes a page count that can
  // strand the caller on a page the data no longer has. Rows, not records: a page holds rows.
  const [pagedRows, setPagedRows] = useState(rows);
  const [pageError, setPageError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // The table's own category filter. The stats above keep counting both categories — they are
  // the range's summary, and the box that narrows the table is where it says so — so this state
  // lives here rather than in the page's filter bar.
  const [kindFilter, setKindFilter] = useState<ErrorKindFilter>("all");
  // What the reads, the count and the clear all go by: the page's filter, plus this table's own
  // control when one is chosen (see ErrorsFilters.kind / .ignored). The ignored view is the other
  // side of the same axis and covers both categories — a rule does not care which one it hides.
  const activeFilters = useMemo<ErrorsFilters>(
    () =>
      kindFilter === "all"
        ? filters
        : kindFilter === "ignored"
          ? { ...filters, ignored: true }
          : { ...filters, kind: kindFilter },
    [filters, kindFilter],
  );
  // A new dashboard response invalidates the offsets being paged through, so paging goes back to
  // page 0 — whose rows the effect below restores from that same response. Today the panel is
  // remounted on every filter change, which resets this anyway; the reset does not rely on that.
  // The category goes back with it: the offsets on page 2 count the previous category's rows.
  useEffect(() => setPage(0), [recent, kindFilter]);

  // Every value this effect reads is a dep, the page-0 branch's included: one left out would be
  // served from a stale closure, and the repo has no lint rule that would catch it.
  useEffect(() => {
    // Page 0 is restored, never fetched — the dashboard response already carries it, and it is
    // the first page of exactly this filter. Restoring is the whole point of the early return:
    // leaving `items` untouched would keep the previous page's rows and its error on screen
    // under a "page 1" label, with no way out short of changing a filter. With a category chosen
    // it cannot be, though: the dashboard folds both categories into that snapshot, so page 0 of
    // a narrowed table has to be read like any other page.
    if (page === 0 && kindFilter === "all") {
      setItems(recent);
      setPagedRows(rows);
      setPageError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPageError(null);
    api
      .getUsageErrors(projectId, { offset: page * pageSize, limit: pageSize, ...activeFilters })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setPagedRows(res.rows);
      })
      .catch((e: unknown) => {
        // Keep the rows already on screen rather than blanking the table under an error.
        if (!cancelled) setPageError(apiErrorText(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, projectId, activeFilters, recent, rows, kindFilter]);

  const pageCount = Math.max(1, Math.ceil(pagedRows / pageSize));
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  // What the confirmation is about: the count and the newest record's instant, read when the
  // action is clicked rather than carried over from the dashboard's snapshot. The snapshot is
  // taken before the page's own requests are answered — and loading the cost center records
  // one of them (a member's shell asks for the machine list and gets a 403) — so a sentence
  // built from it names one record fewer than the delete then takes. That is exactly what a
  // confirmation exists to prevent (see `errorsClearScopeText`), so the count is re-read here
  // and the delete stops at the newest record this read could see (`until`).
  const [confirmTarget, setConfirmTarget] = useState<{
    total: number;
    until: string;
  } | null>(null);
  const [counting, setCounting] = useState(false);
  // Why the delete the card asked for did not land. It sits in the card, not in a toast: the
  // card is still open on the sentence that was refused, and a deletion whose reason dismissed
  // itself after six seconds reads as "nothing happened" — with the same sentence waiting to be
  // confirmed again. Cleared when the attempt starts and when the card closes.
  const [clearRefusal, setClearRefusal] = useState<string | null>(null);

  /**
   * Reads the count the dialog will name, then opens it. `limit: 1` is all it needs: `total`
   * counts the range's records and the first row (newest first) carries the latest `ts`.
   */
  const openClear = async () => {
    setCounting(true);
    // A card that closed on a refusal and is being opened again starts clean: its sentence was
    // about the previous count, which this read has just replaced.
    setClearRefusal(null);
    try {
      const res = await api.getUsageErrors(projectId, { offset: 0, limit: 1, ...activeFilters });
      const newest = res.items[0]?.ts;
      if (res.total === 0 || newest === undefined) {
        // Emptied between the dashboard's read and this click: nothing to confirm, so the
        // panel catches up instead of offering a delete of nothing.
        onReload();
        return;
      }
      setConfirmTarget({ total: res.total, until: newest });
      setConfirmingClear(true);
      // The stats above the table still show the dashboard's snapshot, which is older than this
      // read by exactly the requests that made this dialog necessary (loading the cost center
      // records an expected 403 of its own). Refresh in the background, not awaited: the
      // confirmation must open on the count it just read even if that second request is slow or
      // fails.
      onReload();
    } catch (e) {
      toastError(apiErrorText(e));
    } finally {
      setCounting(false);
    }
  };

  const runClear = async () => {
    if (confirmTarget === null) return;
    setClearing(true);
    setClearRefusal(null);
    try {
      const res = await api.clearUsageErrors(projectId, {
        ...activeFilters,
        until: confirmTarget.until,
      });
      setConfirmingClear(false);
      toastSuccess(S.usage.errorsClearDone(res.deleted));
      // The stats above the table are the dashboard's own numbers, so the whole response is
      // refetched rather than patched here; that also restores page 0 from the new snapshot.
      onReload();
    } catch (e) {
      setClearRefusal(apiErrorText(e));
    } finally {
      setClearing(false);
    }
  };
  // The Project's ignore rules, read only on the view that manages them: the other views never draw
  // them, and a request whose answer is not on screen is a request not worth making. A member never
  // asks — the route is the owner's, and the ignored rows and the count are theirs to see anyway.
  const [rules, setRules] = useState<UsageErrorIgnoreRule[] | null>(null);
  // Bumped after a rule is added or removed, so the list above re-reads without a second state
  // machine: the version is the effect's dependency, and the effect is what fetches.
  const [rulesVersion, setRulesVersion] = useState(0);
  // The class the dialog is about to silence, with the two fields it may narrow by.
  const [ignoreTarget, setIgnoreTarget] = useState<UsageErrorItem | null>(null);
  const [ignoreFragment, setIgnoreFragment] = useState("");
  const [ignoring, setIgnoring] = useState(false);
  // Same rule as the clear's card: the rule this card asked for did not land, so the reason stays
  // in the card that asked — the row's dialog is the only place that knows which class it was
  // about, and the notice that would carry an undo only appears when the write succeeds.
  const [ignoreRefusal, setIgnoreRefusal] = useState<string | null>(null);
  // The rule just made, kept so the panel can offer the undo in place: the row it stood for is
  // already gone from the table below, so a notice floating elsewhere would point at nothing. The
  // count is the answer the write carried, not the stats above — those are still the dashboard's
  // older snapshot until the reload lands.
  const [justIgnored, setJustIgnored] = useState<{
    id: number;
    label: string;
    hidden: number;
  } | null>(null);

  useEffect(() => {
    if (kindFilter !== "ignored" || !canIgnore) {
      setRules(null);
      return;
    }
    let cancelled = false;
    api
      .getUsageErrorIgnores(projectId)
      .then((res) => {
        if (!cancelled) setRules(res.rules);
      })
      .catch((e: unknown) => {
        // Leave the list out rather than blanking it under an error: the table below is the
        // reader's actual answer, and the rules are the explanation of it.
        if (!cancelled) {
          setRules(null);
          toastError(apiErrorText(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, kindFilter, canIgnore, rulesVersion]);

  /**
   * Silences a class. What the dialog adds over the row is the fragment: the same source · code
   * often carries both the noise and the one line worth seeing (`llm_retried` drops its socket all
   * afternoon and once returns a 500), so the narrowing has to be reachable from the row it is
   * about, not only from an API.
   *
   * The range rides along so the answer can say how many records just left the screen, and the
   * notice stays until it is undone or the panel is remounted — the action is reversible, so this
   * is where the caller's "撤销" lives rather than in a confirmation it does not need.
   */
  const runIgnore = async () => {
    if (ignoreTarget === null) return;
    const { source, code } = ignoreTarget;
    setIgnoring(true);
    setIgnoreRefusal(null);
    try {
      const added = await api.ignoreUsageErrors(
        projectId,
        { source, code, messageLike: ignoreFragment },
        activeFilters,
      );
      const label = sourceCode(source, code);
      setIgnoreTarget(null);
      setIgnoreFragment("");
      setJustIgnored({ id: added.rule.id, label, hidden: added.hidden });
      setRulesVersion((v) => v + 1);
      toastSuccess(S.usage.errorsIgnoreDone(label, added.hidden));
      // The stats above the table are the dashboard's own numbers, so the whole response is
      // refetched: the ignored count and the table's own first page both move with this.
      onReload();
    } catch (e) {
      setIgnoreRefusal(apiErrorText(e));
    } finally {
      setIgnoring(false);
    }
  };

  /** Removes a rule, whichever side of the panel asked — the rule list or the notice left by the row. */
  const unignore = async (id: number, label: string) => {
    try {
      await api.unignoreUsageErrors(projectId, id);
      setJustIgnored((current) => (current?.id === id ? null : current));
      setRulesVersion((v) => v + 1);
      toastSuccess(S.usage.errorsUnignoreDone(label));
      onReload();
    } catch (e) {
      toastError(apiErrorText(e));
    }
  };

  // Message rows expanded to their full text (index into the current page); one line each by default.
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => setExpanded(new Set()), [items]);
  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div>
      {/* Stats: a row of small stats (unexpected is prominent, expected recedes) */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5">
        <Stat label={S.usage.errorsTotal} value={String(total)} />
        <Stat
          label={S.usage.errorsUnexpected}
          value={String(unexpected)}
          alert={unexpected > 0}
          muted={unexpected === 0}
        />
        <Stat label={S.usage.errorsExpected} value={String(total - unexpected)} muted />
        {/* The other side of the same range: what the rules are holding back. Drawn always, so the
            numbers above are never read as the whole truth — a zero above with a number here says
            "nothing loud is left", not "nothing is happening". */}
        <Stat label={S.usage.errorsIgnored} value={String(ignored)} muted />
        {topCode && (
          <Stat
            label={S.usage.errorsTopCode}
            value={`${sourceCode(topCode.source, topCode.code)} ×${topCode.count}`}
          />
        )}
      </div>

      {/* The table's own filter: one category, both, or the ignored view. Right-aligned directly
          above the table it narrows, so it reads as that table's control rather than as part of the
          stats row. It is drawn whenever the panel has a table to narrow — an empty page keeps it,
          since it is the only way back to the view the reader came from. */}
      <div className="mt-3 flex justify-end">
        <div className="w-72">
          <Segmented
            options={[
              { value: "all", label: S.usage.errorsFilterAll },
              { value: "unexpected", label: S.usage.errorsUnexpected },
              { value: "expected", label: S.usage.errorsExpected },
              { value: "ignored", label: S.usage.errorsIgnored },
            ]}
            value={kindFilter}
            onChange={setKindFilter}
            // Four ways to slice the table, so four chips on one row: the default of three would
            // wrap the ignored view onto a line of its own and read as a footnote to the others.
            cols={4}
          />
        </div>
      </div>

      {/* The ignored view's own explanation (see IgnoreRulesBox), drawn only for the owner: managing
          the rules is the owner's, exactly as clearing is. Every other reader still gets the view
          and the count in the stats — what a rule hides is never hidden from them. */}
      {kindFilter === "ignored" && canIgnore && (
        <IgnoreRulesBox
          rules={rules}
          onUnignore={(rule) => void unignore(rule.id, ignoreRuleText(rule))}
        />
      )}

      {/* What the last row action did, with the way back. The row it names is already gone from the
          table below, so the undo has to stand where the table is — a toast would have dismissed
          itself before the reader decided they wanted it back. */}
      {justIgnored !== null && (
        <div
          data-ignore-notice={justIgnored.id}
          className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md bg-surface-muted px-2.5 py-1.5 text-xs text-gray-500 dark:text-gray-400"
        >
          <span className="break-words">
            {S.usage.errorsIgnoreDone(justIgnored.label, justIgnored.hidden)}
          </span>
          <button
            type="button"
            onClick={() => void unignore(justIgnored.id, justIgnored.label)}
            className="inline-flex items-center gap-1 rounded-sm text-fg-subtle transition-colors duration-150 hover:text-fg-muted"
          >
            <GlyphIcon d={ICONS.undo} size={12} />
            {S.usage.errorsIgnoreUndo}
          </button>
        </div>
      )}

      {/* Recent-errors table */}
      {items.length === 0 ? (
        <Empty
          text={
            kindFilter === "all"
              ? S.usage.errorsEmpty
              : kindFilter === "ignored"
                ? S.usage.errorsEmptyIgnored
                : S.usage.errorsEmptyKind
          }
        />
      ) : (
        <div className="mt-2.5 overflow-x-auto overflow-y-clip border-t border-gray-200 dark:border-gray-800">
          {/* The columns beside the message are fixed-width and the message column takes the rest, so
              the table has a minimum below which `table-fixed` starves the message column down to
              zero width and pushes the others past the edge. `min-w` states that floor, and
              this box scrolls it sideways when the viewport is narrower — the page itself must
              never scroll sideways (styles.css). `overflow-y-clip` keeps browsers from reserving
              a vertical scrollbar gutter beside the horizontal one. 784 = the old floor plus the
              copy column's 32 and the ignore column's 32, so those two cost the message column
              nothing. */}
          <table className="w-full min-w-[784px] table-fixed text-xs">
            <thead className="text-left text-gray-400 dark:text-gray-500">
              <tr>
                <Th className="w-32">{S.common.time}</Th>
                {/* Wide enough to fully fit the longest error code: a tool
                    failure's code carries the tool name (e.g. [env]
                    tool_failed:exec_command), and truncating it would hide which tool failed. */}
                <Th className="w-72">{S.usage.errorsColCode}</Th>
                <Th className="w-20">{S.usage.errorsColKind}</Th>
                <Th>{S.usage.errorsColMessage}</Th>
                {/* The two action columns: the copy glyph names its action itself, and so does the
                    ignore one, so both headers stay empty rather than repeating them for a screen
                    reader. */}
                <Th className="w-8" />
                <Th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {items.map((e, i) => {
                const key = kindOf(e.kind);
                return (
                  <tr
                    key={`${e.ts}-${i}`}
                    className="border-t border-gray-100 dark:border-gray-800/60"
                  >
                    {/* The latest of the row's records; the first is in the tooltip. */}
                    <td
                      className="py-1.5 pr-2 align-top font-mono tabular-nums text-gray-400"
                      data-tooltip={
                        e.count > 1 ? S.usage.errorsFirstAt(formatDateTime(e.firstTs)) : undefined
                      }
                      data-tooltip-extra={e.count > 1}
                    >
                      {formatDateTime(e.ts)}
                    </td>
                    <td className="py-1.5 pr-2 align-top font-mono text-gray-500 dark:text-gray-400">
                      <span className="block break-words">{sourceCode(e.source, e.code)}</span>
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <Badge tone={key === "unexpected" ? "danger" : "neutral"}>
                        {kindLabel(key)}
                      </Badge>
                    </td>
                    <td className="py-1.5 align-top text-gray-500 dark:text-gray-400">
                      {/* One line by default; click to expand to the full message (wrapping), click
                          again to collapse. How many of the day's records the row stands for
                          follows as a muted count, outside the truncated text so a long message
                          cannot push it out of sight. */}
                      <button
                        type="button"
                        data-tooltip={e.message}
                        data-tooltip-content="text"
                        onClick={() => toggle(i)}
                        className="flex w-full min-w-0 cursor-pointer items-baseline gap-1.5 text-left transition-colors hover:text-gray-700 dark:hover:text-gray-300"
                      >
                        <span
                          className={`min-w-0 ${
                            expanded.has(i) ? "whitespace-pre-wrap break-words" : "truncate"
                          }`}
                        >
                          {e.message}
                        </span>
                        {e.count > 1 && (
                          <span className="shrink-0 tabular-nums text-gray-400 dark:text-gray-500">
                            ×{e.count}
                          </span>
                        )}
                      </button>
                    </td>
                    {/* The whole record on the clipboard (see errorCopyText). Drawn on every row
                        rather than revealed on hover: a phone has no hover (Tailwind v4 scopes the
                        hover: variants to `@media (hover: hover)`), so a hover-revealed action would
                        simply not exist there — the reason the message cell is a plain button too. */}
                    <td className="py-1.5 pl-2 align-top">
                      <CopyButton
                        text={() => errorCopyText(e)}
                        label={S.usage.errorsCopy}
                        size="sm"
                      />
                    </td>
                    {/* Silence this class: the row's own source · code, which is what the rule
                        covers. Offered to the owner only (the route is theirs) and only where
                        silencing something makes sense — on the ignored view every row already is.
                        The glyph's tooltip names the action, and the dialog that follows names the
                        consequence and lets it be narrowed to a message fragment. */}
                    <td className="py-1.5 pl-2 align-top">
                      {canIgnore && kindFilter !== "ignored" && (
                        <button
                          type="button"
                          aria-label={S.usage.errorsIgnoreAction}
                          data-tooltip={S.usage.errorsIgnoreAction}
                          onClick={() => {
                            setIgnoreTarget(e);
                            setIgnoreFragment("");
                            // A different class: the previous card's refusal named the class it
                            // was about, not this one.
                            setIgnoreRefusal(null);
                          }}
                          className="inline-flex size-5 items-center justify-center rounded-sm text-fg-subtle transition-colors duration-150 hover:bg-surface-muted hover:text-fg-muted"
                        >
                          <GlyphIcon d={ICONS.eyeOff} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* The table's own footer: the clear action on the left, the pager on the right. It is
          rendered whenever there are rows to act on — and unconditionally while paged away
          from the first page, so a later page that came back empty or shrank below the page
          count still offers the way back instead of stranding the reader on a bare table.
          Kept outside the scroll box so it stays reachable without scrolling past the rows.
          The pager itself still appears only once there is more than one page. */}
      {(items.length > 0 || page > 0) && (
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          {/* Offered while there is something to take: the clear reaches exactly the rows the
              panel lists — for an admin, the unattributed rows an admin's read includes too. */}
          {canClear && total > 0 && clearableFilter(activeFilters) && (
            <button
              type="button"
              disabled={clearing || counting}
              onClick={() => void openClear()}
              className="rounded-md border border-gray-200 px-2 py-0.5 transition-colors duration-150 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:bg-transparent disabled:hover:text-gray-500 dark:border-gray-800 dark:hover:border-red-900 dark:hover:bg-red-950/50 dark:hover:text-red-400 dark:disabled:hover:border-gray-800 dark:disabled:hover:bg-transparent dark:disabled:hover:text-gray-400"
            >
              {S.usage.errorsClear}
            </button>
          )}
          {pageError !== null && (
            <span className="text-red-600 dark:text-red-400">{pageError}</span>
          )}
          {(pageCount > 1 || page > 0) && (
            <Pager
              variant="labelled"
              className="ml-auto"
              page={page}
              pageCount={pageCount}
              onChange={setPage}
              previousLabel={S.usage.errorsNewer}
              nextLabel={S.usage.errorsOlder}
              readout={S.usage.errorsPageOf(page + 1, pageCount, pagedRows)}
              disabled={loading}
            />
          )}
        </div>
      )}

      {/* The confirm names the filtered set the delete will actually take — the count and the
          boundary come from the read `openClear` just made, so the number in the sentence is
          the number of records this delete removes — and says plainly that nothing brings it
          back: the rows are the only record these errors ever had. */}
      <ConfirmModal
        open={confirmingClear}
        tone="danger"
        title={S.usage.errorsClearTitle}
        confirmLabel={S.usage.errorsClear}
        cancelLabel={S.common.cancel}
        busy={clearing}
        refusal={clearRefusal === null ? undefined : S.common.refused(clearRefusal)}
        onClose={() => {
          setConfirmingClear(false);
          setClearRefusal(null);
        }}
        onConfirm={() => void runClear()}
      >
        <div className="space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
          {confirmTarget !== null && (
            <p className="break-words">
              {errorsClearScopeText(activeFilters, preset, confirmTarget.total)}
            </p>
          )}
          {/* The sentence above counts what the table showed, which on every view but this one
              leaves the ignored records out — so the reader is told they exist rather than left to
              read "N records" as the whole range. On the ignored view those rows ARE the sentence's
              subject, and this would be counting them twice (see errorsClearKeepsIgnoredText). */}
          {errorsClearKeepsIgnoredText(ignored, activeFilters) !== null && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {errorsClearKeepsIgnoredText(ignored, activeFilters)}
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {S.usage.errorsClearIrreversible}
          </p>
        </div>
      </ConfirmModal>

      {/* Silencing a class. No danger tone and no "cannot be undone" here, because neither is true:
          nothing is deleted, and the notice this leaves behind puts it back in one click. What the
          card adds over the row button is the narrowing — the fragment — which is the difference
          between hiding a class and hiding a class's noise. */}
      <ConfirmModal
        open={ignoreTarget !== null}
        tone="primary"
        glyph={ICONS.eyeOff}
        title={S.usage.errorsIgnoreAction}
        confirmLabel={S.usage.errorsIgnore}
        cancelLabel={S.common.cancel}
        busy={ignoring}
        refusal={ignoreRefusal === null ? undefined : S.common.refused(ignoreRefusal)}
        onClose={() => {
          setIgnoreTarget(null);
          setIgnoreFragment("");
          setIgnoreRefusal(null);
        }}
        onConfirm={() => void runIgnore()}
      >
        <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          {ignoreTarget !== null && (
            <p className="break-words font-mono text-gray-500 dark:text-gray-400">
              {sourceCode(ignoreTarget.source, ignoreTarget.code)}
            </p>
          )}
          <Input
            label={S.usage.errorsIgnoreFragment}
            hint={S.usage.errorsIgnoreFragmentHint}
            value={ignoreFragment}
            onChange={(e) => setIgnoreFragment(e.target.value)}
            maxLength={200}
          />
        </div>
      </ConfirmModal>
    </div>
  );
}
