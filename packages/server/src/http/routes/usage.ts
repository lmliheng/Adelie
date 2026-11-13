/**
 * Usage statistics routes:
 * GET /api/projects/:p/usage?from&to&fromTs&toTs&groupBy&granularity&agentId&provider&modelId
 * (model filter is paired: provider and modelId are given together; granularity
 * sets the time-series precision, defaulting to day; fromTs/toTs bound a
 * trailing window down to instants — required for minute — and must be given
 * together);
 * GET /api/projects/:p/usage/errors?offset&limit&from&to&fromTs&toTs&agentId&kind&ignored — one page
 * of the error detail table, for paging back past the first page the dashboard already
 * returns (both reads also take `utcOffsetMinutes`, the viewer's offset from UTC, whose
 * calendar day the table folds a day's repeats by; `ignored` reads the other side of the
 * Project's ignore rules);
 * DELETE /api/projects/:p/usage/errors?from&to&fromTs&toTs&until&agentId&kind&ignored — empties that table
 * for the filter the panel is showing (owner only; `from`/`to` are required, unlike on the
 * reads; an admin's clear also takes the unattributed rows an admin's read shows; `until`
 * stops at the newest record the confirmation counted);
 * GET /api/projects/:p/usage/errors/ignores — the Project's ignore rules, each with what it
 * covers (owner only);
 * POST /api/projects/:p/usage/errors/ignores?from&to&fromTs&toTs&agentId — adds one rule, and
 * answers how many records it covers in that range (owner only; `source` and `code` required,
 * `messageLike` narrows it to messages containing that fragment; 409 when the class is already
 * ignored);
 * DELETE /api/projects/:p/usage/errors/ignores/:id — removes one rule (owner only; 404 when this
 * Project has none);
 * GET /api/projects/:p/usage/model-totals — lifetime Token total per Model, unfiltered.
 * GET /api/projects/:p/usage/session-days?days= — usage by calendar day, each day split by
 * Session (the account menu's run record; days 1..90, default 7).
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type {
  UsageErrorIgnoreAdded,
  UsageErrorIgnores,
  UsageErrorKind,
  UsageErrorsClearResponse,
  UsageGranularity,
  UsageGroupBy,
  UsageSessionDays,
} from "../../api/types.js";
import type { AppEnv } from "../../auth/middleware.js";
import {
  badRequest,
  optionalDateParam,
  paginationQuery,
  parseNonNegativeInt,
  requireValidId,
} from "../validate.js";
import { HttpError } from "../errors.js";
import type { UsageQueries } from "../../mechanisms/observability.js";
import type { SessionIndex } from "../../mechanisms/sessions.js";
import type { Access } from "../../mechanisms/projects.js";

/** What this route group reaches — bound by its module (src/modules). */
export interface UsageRouteDeps {
  access: Access;
  usageService: UsageQueries;
  /** The Session index, read only to name a Session's row in the day-by-Session breakdown (it holds no title of its own). */
  sessionsRepo: SessionIndex;
}

const GROUP_BYS: readonly UsageGroupBy[] = ["date", "agent", "model", "session"];

const GRANULARITIES: readonly UsageGranularity[] = ["minute", "hour", "day", "week", "month"];

/** The two categories `error_records.kind` is ever written with (ErrorRecorder's own vocabulary). */
const ERROR_KINDS: readonly UsageErrorKind[] = ["unexpected", "expected"];

/**
 * Parse an optional ISO-8601 timestamp parameter, normalized to the UTC ISO
 * form the rows record — string comparison against `usage_records.ts` and
 * `error_records.ts` only works with both sides in that one spelling.
 */
function optionalTsParam(value: string | undefined, label: string): string | undefined {
  if (value === undefined || value === "") return undefined;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw badRequest(`${label} must be an ISO-8601 timestamp.`);
  return new Date(ms).toISOString();
}

/** The widest offset from UTC a clock actually uses (UTC+14), which bounds `utcOffsetMinutes`. */
const UTC_OFFSET_MAX_MINUTES = 14 * 60;

/**
 * The optional viewer offset east of UTC, in minutes: whose calendar day the error table folds
 * a day's repeats by (see ErrorsRepo.recent). A signed whole number within the offsets clocks
 * use, and nothing else — a typo is a 400 rather than a quietly different day.
 */
function utcOffsetQuery(c: Context<AppEnv>): number | undefined {
  const raw = c.req.query("utcOffsetMinutes");
  if (raw === undefined || raw === "") return undefined;
  const minutes = /^-?\d{1,4}$/.test(raw) ? Number(raw) : Number.NaN;
  if (!(Math.abs(minutes) <= UTC_OFFSET_MAX_MINUTES)) {
    throw badRequest(
      `utcOffsetMinutes must be a whole number of minutes between -${UTC_OFFSET_MAX_MINUTES} and ${UTC_OFFSET_MAX_MINUTES}.`,
    );
  }
  return minutes;
}

/**
 * The optional trailing-window pair, normalized: both or neither, and in order. One parser
 * for the dashboard and the two error routes, so a window means the same thing to all three.
 */
function tsWindowQuery(c: Context<AppEnv>): { fromTs?: string; toTs?: string } {
  const fromTs = optionalTsParam(c.req.query("fromTs"), "fromTs");
  const toTs = optionalTsParam(c.req.query("toTs"), "toTs");
  if ((fromTs === undefined) !== (toTs === undefined)) {
    throw badRequest("fromTs and toTs must be given together.");
  }
  if (fromTs !== undefined && toTs !== undefined && fromTs > toTs) {
    throw badRequest("fromTs must not be after toTs.");
  }
  return { ...(fromTs !== undefined ? { fromTs } : {}), ...(toTs !== undefined ? { toTs } : {}) };
}

/**
 * The error panel's range: the dates, the trailing window and the Agent every error read and write
 * shares. One parser for all four, so "the range on screen" means the same thing to the reads, to a
 * clear, and to the count a new ignore rule reports having hidden.
 */
function errorRangeQuery(c: Context<AppEnv>): {
  from?: string;
  to?: string;
  fromTs?: string;
  toTs?: string;
  agentId?: string;
} {
  const from = optionalDateParam(c.req.query("from"), "from");
  const to = optionalDateParam(c.req.query("to"), "to");
  const agentId = c.req.query("agentId");
  return {
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
    ...tsWindowQuery(c),
    ...(agentId !== undefined && agentId !== "" ? { agentId } : {}),
  };
}

/**
 * Which side of the Project's ignore rules to read or clear: `1` the records a rule covers, `0`
 * (or nothing) the ones no rule covers. Validated like `kind` and for the same reason — a typo
 * that passed through would silently read the other side and report the wrong table as empty.
 */
function ignoredQuery(c: Context<AppEnv>): boolean | undefined {
  const raw = c.req.query("ignored");
  if (raw === undefined || raw === "" || raw === "0" || raw === "false") return undefined;
  if (raw === "1" || raw === "true") return true;
  throw badRequest("ignored must be 0 or 1.");
}

export function usageRoutes(deps: UsageRouteDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    // Defensive id validation.
    const projectId = requireValidId(c, "projectId");
    deps.access.requireProjectAccess(c.var.user.userId, projectId);
    const groupByRaw = c.req.query("groupBy") ?? "date";
    if (!(GROUP_BYS as readonly string[]).includes(groupByRaw)) {
      throw badRequest(`groupBy must be one of ${GROUP_BYS.join(" / ")}.`);
    }
    const granularityRaw = c.req.query("granularity") ?? "day";
    if (!(GRANULARITIES as readonly string[]).includes(granularityRaw)) {
      throw badRequest(`granularity must be one of ${GRANULARITIES.join(" / ")}.`);
    }
    const granularity = granularityRaw as UsageGranularity;
    const from = optionalDateParam(c.req.query("from"), "from");
    const to = optionalDateParam(c.req.query("to"), "to");
    const window = tsWindowQuery(c);
    const utcOffsetMinutes = utcOffsetQuery(c);
    const agentId = c.req.query("agentId");
    const provider = c.req.query("provider");
    const modelId = c.req.query("modelId");
    return c.json(
      await deps.usageService.query(projectId, {
        groupBy: groupByRaw as UsageGroupBy,
        granularity,
        ...window,
        ...(utcOffsetMinutes !== undefined ? { utcOffsetMinutes } : {}),
        // Unattributed errors (login failures, process crashes, etc. with no Project
        // context) are visible only to admins: requireProjectAccess only guarantees
        // "is a member of this Project" — a regular member seeing another tenant's errors
        // would be a cross-tenant information leak.
        includeGlobalErrors: c.var.user.isAdmin,
        ...(from !== undefined ? { from } : {}),
        ...(to !== undefined ? { to } : {}),
        ...(agentId !== undefined && agentId !== "" ? { agentId } : {}),
        ...(provider !== undefined && provider !== "" ? { provider } : {}),
        ...(modelId !== undefined && modelId !== "" ? { modelId } : {}),
      }),
    );
  });

  // Lifetime Token total per Model, for the models page's per-card figure. Takes no filters at
  // all: the number answers "how much has this model been used", which has no range, and the
  // page showing it offers none. One grouped scan, so it stays a cheap second request rather
  // than a reason to widen the models response with telemetry.
  app.get("/model-totals", (c) => {
    const projectId = requireValidId(c, "projectId");
    deps.access.requireProjectAccess(c.var.user.userId, projectId);
    return c.json(deps.usageService.modelTotals(projectId));
  });

  // Usage by calendar day, each day split by Session — the account menu's "会话运行记录": one
  // request answers "which conversations spent the Tokens these days, and how much". The
  // Sessions' titles are added here from the Session index (the usage rows carry only ids), so
  // a reader recognises a conversation instead of decoding a session id; a Session deleted
  // since keeps its id and no title.
  app.get("/session-days", (c) => {
    const projectId = requireValidId(c, "projectId");
    deps.access.requireProjectAccess(c.var.user.userId, projectId);
    const raw = c.req.query("days");
    const parsed = raw === undefined || raw === "" ? 7 : /^\d{1,3}$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 90) {
      throw badRequest("days must be a whole number between 1 and 90.");
    }
    const titles = new Map<string, string | undefined>();
    const days = deps.usageService.sessionDays(projectId, { days: parsed }).map((day) => ({
      ...day,
      sessions: day.sessions.map((row) => {
        if (!titles.has(row.sessionId)) {
          titles.set(row.sessionId, deps.sessionsRepo.findById(row.sessionId)?.title ?? undefined);
        }
        const title = titles.get(row.sessionId);
        return { ...row, ...(title !== undefined ? { title } : {}) };
      }),
    }));
    return c.json({ days } satisfies UsageSessionDays);
  });

  // One page of the error detail table, newest first. The dashboard response above already
  // carries the first page; this serves "show me earlier ones" without refetching the whole
  // aggregate. Takes the date/agent filter only — the model filter never applied to errors
  // (HTTP and process errors have no Model dimension), so accepting it here would imply a
  // narrowing the summary above does not do.
  app.get("/errors", (c) => {
    const projectId = requireValidId(c, "projectId");
    deps.access.requireProjectAccess(c.var.user.userId, projectId);
    const { offset, limit } = paginationQuery(c);
    const range = errorRangeQuery(c);
    const utcOffsetMinutes = utcOffsetQuery(c);
    const kindRaw = c.req.query("kind");
    // `kind` narrows to one of the two categories the panel's stats already separate. It is
    // validated against that closed set rather than passed through, so a typo asks for
    // nothing instead of silently matching no rows and reading as "no errors".
    if (
      kindRaw !== undefined &&
      kindRaw !== "" &&
      !(ERROR_KINDS as readonly string[]).includes(kindRaw)
    ) {
      throw badRequest(`kind must be one of ${ERROR_KINDS.join(" / ")}.`);
    }
    const ignored = ignoredQuery(c);
    return c.json(
      deps.usageService.queryErrors(projectId, {
        offset,
        limit,
        // Same admin-only rule as the dashboard: a regular member seeing another tenant's
        // unattributed errors would be a cross-tenant leak.
        includeGlobalErrors: c.var.user.isAdmin,
        ...range,
        ...(utcOffsetMinutes !== undefined ? { utcOffsetMinutes } : {}),
        ...(kindRaw !== undefined && kindRaw !== "" ? { kind: kindRaw } : {}),
        ...(ignored !== undefined ? { ignored } : {}),
      }),
    );
  });

  // Empties the error table for the filter the panel is showing. Takes the same date, window,
  // agent, category and ignore side as the two reads above and no other: a clear removes exactly
  // the rows the caller was looking at, never the Project's whole history behind a narrowed view —
  // the date range is required for that reason, where the reads leave it optional. `kind` and
  // `ignored` are accepted because the panel has those controls: its table and its button read the
  // same filter, so a reader narrowed to one category keeps the other one, and a reader standing
  // on the ignored view is the one person who may delete those rows.
  app.delete("/errors", (c) => {
    const projectId = requireValidId(c, "projectId");
    // Owner only, the rule Agent deletion applies to error rows already (it cascade-deletes
    // them): membership is enough to READ the panel, but these rows are the Project's shared
    // history and one member emptying them takes them from everyone.
    deps.access.requireProjectOwner(c.var.user.userId, projectId);
    const range = errorRangeQuery(c);
    // Both bounds are required here, unlike on the two reads: a missing bound reads as
    // unbounded on that side, and an unbounded clear is the Project's entire history — for an
    // admin, every unattributed row in the instance along with it, rows that sit in every
    // other Project's admin panel. The panel already withholds the action while either date
    // input is blank (see clearableFilter); this is that same rule where it can be enforced,
    // rather than a promise only the caller who uses the UI keeps.
    if (range.from === undefined || range.to === undefined) {
      throw badRequest("from and to are both required.");
    }
    // The boundary the confirmation counted, optional: without it the clear takes everything
    // the filter matches, which is what a caller that never showed a count is asking for. A
    // malformed instant is refused rather than dropped — a clear that quietly ignores its
    // boundary would remove rows the sentence said were kept.
    const until = optionalTsParam(c.req.query("until"), "until");
    const kindRaw = c.req.query("kind");
    // Validated against the same closed set the read uses: an unrecognized category would
    // otherwise match no rows, and a clear that silently matches nothing reads as "already
    // empty" while the rows are still there.
    if (
      kindRaw !== undefined &&
      kindRaw !== "" &&
      !(ERROR_KINDS as readonly string[]).includes(kindRaw)
    ) {
      throw badRequest(`kind must be one of ${ERROR_KINDS.join(" / ")}.`);
    }
    const ignored = ignoredQuery(c);
    // The same admin visibility the reads above carry, so a clear takes exactly the rows the
    // caller's panel showed. An admin's panel shows the unattributed rows (login failures,
    // process crashes) and so an admin's clear takes them; a member's never shows them, so a
    // clear can never become a way to remove a row its caller was not allowed to see.
    const deleted = deps.usageService.clearErrors(projectId, {
      includeGlobalErrors: c.var.user.isAdmin,
      ...range,
      ...(until !== undefined ? { until } : {}),
      ...(kindRaw !== undefined && kindRaw !== "" ? { kind: kindRaw } : {}),
      ...(ignored !== undefined ? { ignored } : {}),
    });
    return c.json({ deleted } satisfies UsageErrorsClearResponse);
  });

  // The Project's ignore rules: the error classes its owner has taken out of the panel's default
  // view. Owner only, the line the clear draws and for the same reason — a rule changes what
  // everyone reading this Project sees. The panel reports the count to members on its own (the
  // dashboard's `errors.ignored`), so reading the rules themselves is management, not disclosure.
  app.get("/errors/ignores", (c) => {
    const projectId = requireValidId(c, "projectId");
    deps.access.requireProjectOwner(c.var.user.userId, projectId);
    return c.json({ rules: deps.usageService.errorIgnores(projectId) } satisfies UsageErrorIgnores);
  });

  // Adds one rule. The records are not touched — the rule only decides which ones the reads select
  // — so this is undoable, and the answer carries how many records it covers in the range the
  // caller was looking at: what the caller says it just hid. The range is the same one the reads
  // and the clear take, so the number matches the table it came from.
  app.post("/errors/ignores", async (c) => {
    const projectId = requireValidId(c, "projectId");
    deps.access.requireProjectOwner(c.var.user.userId, projectId);
    const body = (await c.req.json().catch(() => null)) as {
      source?: unknown;
      code?: unknown;
      messageLike?: unknown;
      note?: unknown;
    } | null;
    // A rule with no source or no code covers nothing while reading as a rule, so both are
    // required rather than defaulted; the lengths are capped because they are matched against two
    // columns and the note is drawn in a list row.
    const source = typeof body?.source === "string" ? body.source.trim() : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (source === "" || code === "") throw badRequest("source and code are both required.");
    if (source.length > 64 || code.length > 200) {
      throw badRequest("source must be at most 64 characters and code at most 200.");
    }
    const messageLike = typeof body?.messageLike === "string" ? body.messageLike : null;
    const note = typeof body?.note === "string" ? body.note : null;
    if ((messageLike?.length ?? 0) > 200 || (note?.length ?? 0) > 200) {
      throw badRequest("messageLike and note must be at most 200 characters.");
    }
    const added = deps.usageService.addErrorIgnore(
      projectId,
      { source, code, messageLike, note, createdBy: c.var.user.userId },
      errorRangeQuery(c),
    );
    // Already ignored: the same (source, code, fragment) is one rule, and a second row covering the
    // same records would leave the list saying the same thing twice.
    if (added === null) {
      throw new HttpError(
        409,
        "ignore_rule_exists",
        `This Project already ignores [${source}] ${code}.`,
      );
    }
    return c.json(added satisfies UsageErrorIgnoreAdded, 201);
  });

  // Removes one rule, which re-exposes every record it covered — nothing was ever deleted, so this
  // is the whole of the undo.
  app.delete("/errors/ignores/:id", (c) => {
    const projectId = requireValidId(c, "projectId");
    deps.access.requireProjectOwner(c.var.user.userId, projectId);
    const id = parseNonNegativeInt(c.req.param("id") ?? "");
    if (id === null) throw badRequest("id must be a non-negative integer.");
    if (!deps.usageService.removeErrorIgnore(projectId, id)) {
      throw new HttpError(404, "ignore_rule_not_found", "No such ignore rule in this Project.");
    }
    return c.json({ removed: true });
  });

  return app;
}
