/**
 * `penguin storage` — the data root's storage ledger, and the reviewed cleanup that reads it.
 *
 *   penguin storage [--top <n>] [--json] [--server <url>]
 *   penguin storage report [--top <n>] [--json] [--server <url>]
 *   penguin storage scan [--json] [--server <url>]
 *   penguin storage plan [<planId>] [--json] [--server <url>]
 *   penguin storage apply <planId> (--path <path> … | --all) [--json] [--server <url>]
 *   penguin storage trash [list] [--json] [--server <url>]
 *   penguin storage trash restore <id> [--json] [--server <url>]
 *   penguin storage trash purge [<id>] [--json] [--server <url>]
 *   penguin storage mode [on|off] [--json] [--server <url>]
 *
 * The bare command (an alias of `report`) reports what occupies `ADELIE_HOME`: one row per class (user data, temporary
 * Workspaces, Session drafts, Traces, tool environments, trash, the database, everything else),
 * the entries a person could clean up, the environments that look like the same toolchain
 * installed twice, and anything the scan could not read.
 *
 * Everything else is the design's second step, and every one of those commands is a deliberate
 * act: `scan` writes a bill and moves nothing; `plan` reads one back (or lists the recent ones);
 * `apply` needs a plan id **and** the paths to move, which is why there is no `--yes` anywhere
 * in this file; `trash` is where a move lands, and `purge` — the only deletion — is spelled out
 * separately. The cleanup mode (`mode`) is off until somebody turns it on, and with it off the
 * server refuses every write, so the bare report is all this command can do.
 *
 * The numbers come from the server (see routes/admin-storage.ts), not from walking the disk
 * here: which Sessions still exist — and therefore which temporary Workspaces and draft
 * directories are still referenced — is a database question, and only the server holds the
 * database. A report computed locally against a stale lock file could name a live Session's
 * Workspace as unreferenced, which is exactly the mistake the whole design is built to avoid;
 * and by the same rule the CLI never moves a file, it submits an approval (the server is the
 * single writer).
 *
 * Docs: /docs/cli § "penguin storage".
 */
import type { Command } from "commander";
import type {
  StorageApplyResponse,
  StorageCandidate,
  StoragePlanResponse,
  StoragePlanView,
  StoragePlansResponse,
  StoragePurgeResponse,
  StorageReport,
  StorageReportResponse,
  StorageRestoreResponse,
  StorageSettingsResponse,
  StorageTrashResponse,
} from "@lmliheng/penguin-server/api";
import { humanizeBytes } from "../render.js";
import { resolveConnection, ServerClient } from "../client.js";
import { renderTable } from "../table.js";
import type { Messages } from "../i18n.js";

/** Candidates printed before the list is folded; `--top 0` prints every one. */
const DEFAULT_TOP = 20;

/** Free-space share below which the header carries a warning. Report-only: nothing acts on it. */
const LOW_FREE_RATIO = 0.15;

function lastModified(iso: string | null, t: Messages): string {
  if (iso === null) return t.storage.unknownDate();
  return iso.slice(0, 16).replace("T", " ");
}

/** The candidate rows, largest first as the server already ordered them. */
function candidateRows(report: StorageReport, top: number, t: Messages): string[][] {
  const shown = top === 0 ? report.candidates : report.candidates.slice(0, top);
  return shown.map((candidate: StorageCandidate) => [
    t.storage.className(candidate.class),
    humanizeBytes(candidate.bytes),
    String(candidate.files),
    lastModified(candidate.lastModifiedAt, t),
    candidate.rules.map((rule) => t.storage.ruleLabel(rule)).join(", "),
    candidate.path,
  ]);
}

/** A plan's entries as a table: what it is, how big, when it last changed, and why it is on it. */
function billRows(plan: StoragePlanView, t: Messages): string[][] {
  return plan.entries.map((entry) => [
    t.storage.className(entry.class),
    humanizeBytes(entry.bytes),
    String(entry.files),
    lastModified(entry.lastModifiedAt, t),
    entry.rules.map((rule) => t.storage.ruleLabel(rule)).join(", "),
    entry.executable ? t.storage.moveMark() : t.storage.reportOnlyMark(),
    entry.path,
  ]);
}

/** The plan state a listing shows: open, applied, or past its day. */
function planState(plan: StoragePlanView, t: Messages): string {
  if (plan.appliedAt !== null) return t.storage.planStateApplied(lastModified(plan.appliedAt, t));
  if (plan.expired) return t.storage.planStateExpired(lastModified(plan.expiresAt, t));
  return t.storage.planStateOpen();
}

/** One bill, rendered the same way whether it was just written or read back. */
function renderPlan(plan: StoragePlanView, t: Messages): string {
  const out: string[] = [];
  out.push(
    t.storage.billHeading(
      plan.id,
      plan.entries.length,
      humanizeBytes(plan.totalBytes),
      lastModified(plan.expiresAt, t),
    ),
  );
  if (plan.entries.length === 0) {
    out.push(t.storage.billEmpty());
  } else {
    out.push(
      renderTable(
        [
          t.storage.colClass(),
          t.storage.colBytes(),
          t.storage.colFiles(),
          t.storage.colModified(),
          t.storage.colRules(),
          t.storage.colExecutable(),
          t.storage.colPath(),
        ],
        billRows(plan, t),
      ),
    );
  }
  if (plan.excluded.length > 0) out.push(t.storage.billExcluded(plan.excluded.length));
  out.push(t.storage.billReportOnly(plan.executableClasses.map((c) => t.storage.className(c))));
  out.push(plan.usable ? t.storage.billNotice(plan.id) : t.storage.billSpent(plan.id));
  return `${out.join("\n")}\n`;
}

/** Commander collector for a repeatable option; one value may also list several, comma-separated. */
function collect(value: string, previous: string[]): string[] {
  return [
    ...previous,
    ...value
      .split(",")
      .map((part) => part.trim())
      .filter((p) => p !== ""),
  ];
}

export function registerStorageCommand(program: Command, t: Messages): void {
  const storage = program.command("storage").description(t.storage.desc);

  // The bare command is the report, and it is a subcommand rather than the parent's own action
  // for a reason that is easy to get wrong: a parent that declares `--json` AND a subcommand
  // that declares it too makes commander hand the flag to the parent, so `storage scan --json`
  // would silently print the human table. With nothing on the parent, every command's options
  // are its own — `storage --json` and `storage scan --json` both mean what they say.
  storage
    .command("report", { isDefault: true })
    .description(t.storage.desc)
    .option("--top <n>", t.storage.top)
    .option("--json", t.common.json)
    .option("--server <url>", t.common.server)
    .action(async (opts) => {
      let top = DEFAULT_TOP;
      if (opts.top !== undefined) {
        const n = Number(opts.top);
        if (!Number.isInteger(n) || n < 0) {
          process.stderr.write(`${t.error(t.storage.topInvalid(String(opts.top)))}\n`);
          process.exitCode = 1;
          return;
        }
        top = n;
      }

      const client = new ServerClient(await resolveConnection({ server: opts.server }, t), t);
      const response = await client.request<StorageReportResponse>("GET", "/api/admin/storage");
      // The mode decides which sentence closes the report — "there is nothing else this command
      // does" or "here is the next step" — and an older server without the route simply keeps
      // the report-only wording.
      const mode = await client
        .request<StorageSettingsResponse>("GET", "/api/admin/storage/settings")
        .then((res) => res.settings.enabled)
        .catch(() => false);

      if (opts.json === true) {
        process.stdout.write(`${JSON.stringify(response)}\n`);
        return;
      }

      const { report } = response;
      const out = process.stdout;

      if (report.disk === null) {
        out.write(`${t.storage.heading(report.root, humanizeBytes(report.totalBytes), null)}\n`);
      } else {
        const used = report.disk.totalBytes - report.disk.freeBytes;
        const ratio =
          report.disk.totalBytes === 0 ? 0 : report.disk.freeBytes / report.disk.totalBytes;
        out.write(
          `${t.storage.heading(report.root, humanizeBytes(report.totalBytes), {
            free: humanizeBytes(report.disk.freeBytes),
            total: humanizeBytes(report.disk.totalBytes),
            usedPercent: String(
              report.disk.totalBytes === 0 ? 0 : Math.round((used / report.disk.totalBytes) * 100),
            ),
          })}\n`,
        );
        if (ratio < LOW_FREE_RATIO) {
          out.write(`${t.storage.lowFree(humanizeBytes(report.disk.freeBytes))}\n`);
        }
      }

      out.write(
        renderTable(
          [
            t.storage.colClass(),
            t.storage.colBytes(),
            t.storage.colFiles(),
            t.storage.colEntries(),
            t.storage.colCandidates(),
          ],
          report.classes
            .filter((c) => c.entries > 0 || c.class === "protected")
            .map((c) => [
              t.storage.className(c.class),
              humanizeBytes(c.bytes),
              String(c.files),
              String(c.entries),
              c.candidateEntries === 0
                ? "-"
                : t.storage.candidateCell(c.candidateEntries, humanizeBytes(c.candidateBytes)),
            ]),
        ),
      );

      out.write(`\n${t.storage.candidatesHeading()}\n`);
      if (report.candidates.length === 0) {
        out.write(`${t.storage.candidatesEmpty()}\n`);
      } else {
        out.write(
          renderTable(
            [
              t.storage.colClass(),
              t.storage.colBytes(),
              t.storage.colFiles(),
              t.storage.colModified(),
              t.storage.colRules(),
              t.storage.colPath(),
            ],
            candidateRows(report, top, t),
          ),
        );
        if (top !== 0 && report.candidates.length > top) {
          out.write(`${t.storage.moreCandidates(report.candidates.length - top)}\n`);
        }
        out.write(`${t.storage.candidateCosts()}\n`);
      }

      if (report.sharedEnvGroups.length > 0) {
        out.write(`\n${t.storage.groupsHeading()}\n`);
        for (const group of report.sharedEnvGroups) {
          out.write(
            `${t.storage.groupLine(
              t.storage.groupKind(group.kind),
              group.key,
              group.members.length,
              humanizeBytes(group.bytes),
            )}\n`,
          );
          out.write(`    ${group.members.join("\n    ")}\n`);
        }
      }

      if (report.unreadable.length > 0) {
        out.write(`\n${t.storage.unreadableHeading()}\n`);
        for (const path of report.unreadable) out.write(`    ${path}\n`);
      }

      out.write(`\n${mode ? t.storage.modeOnNotice() : t.storage.modeOffNotice()}\n`);
    });

  storage
    .command("scan")
    .description(t.storage.scanDesc)
    .option("--json", t.common.json)
    .option("--server <url>", t.common.server)
    .action(async (opts) => {
      const client = new ServerClient(await resolveConnection({ server: opts.server }, t), t);
      const response = await client.request<StoragePlanResponse>(
        "POST",
        "/api/admin/storage/plans",
      );
      if (opts.json === true) {
        process.stdout.write(`${JSON.stringify(response)}\n`);
        return;
      }
      process.stdout.write(renderPlan(response.plan, t));
    });

  storage
    .command("plan [planId]")
    .description(t.storage.planDesc)
    .option("--json", t.common.json)
    .option("--server <url>", t.common.server)
    .action(async (planId: string | undefined, opts) => {
      const client = new ServerClient(await resolveConnection({ server: opts.server }, t), t);
      if (planId !== undefined) {
        const response = await client.request<StoragePlanResponse>(
          "GET",
          `/api/admin/storage/plans/${encodeURIComponent(planId)}`,
        );
        if (opts.json === true) {
          process.stdout.write(`${JSON.stringify(response)}\n`);
          return;
        }
        process.stdout.write(renderPlan(response.plan, t));
        return;
      }
      const response = await client.request<StoragePlansResponse>(
        "GET",
        "/api/admin/storage/plans",
      );
      if (opts.json === true) {
        process.stdout.write(`${JSON.stringify(response)}\n`);
        return;
      }
      if (response.plans.length === 0) {
        process.stdout.write(`${t.storage.plansEmpty()}\n`);
        return;
      }
      process.stdout.write(
        renderTable(
          [
            t.storage.colPlanId(),
            t.storage.colCreated(),
            t.storage.colEntries(),
            t.storage.colBytes(),
            t.storage.colState(),
          ],
          response.plans.map((plan) => [
            plan.id,
            lastModified(plan.createdAt, t),
            String(plan.entries.length),
            humanizeBytes(plan.totalBytes),
            planState(plan, t),
          ]),
        ),
      );
    });

  storage
    .command("apply <planId>")
    .description(t.storage.applyDesc)
    .option("--path <path>", t.storage.applyPath, collect, [])
    .option("--all", t.storage.applyAll)
    .option("--json", t.common.json)
    .option("--server <url>", t.common.server)
    .action(async (planId: string, opts) => {
      const client = new ServerClient(await resolveConnection({ server: opts.server }, t), t);
      // A run with nothing named never reaches the server: "clean whatever you find" is exactly
      // the instruction this command does not accept.
      if (opts.all !== true && opts.path.length === 0) {
        process.stderr.write(`${t.error(t.storage.applyNoSelection())}\n`);
        process.exitCode = 1;
        return;
      }
      // The bill is read here rather than taken from an earlier print: the fingerprint that
      // authorizes the run has to be the one the server is holding now.
      const plan = (
        await client.request<StoragePlanResponse>(
          "GET",
          `/api/admin/storage/plans/${encodeURIComponent(planId)}`,
        )
      ).plan;
      const paths: string[] =
        opts.all === true
          ? plan.entries.filter((entry) => entry.executable).map((entry) => entry.path)
          : opts.path;
      if (paths.length === 0) {
        process.stderr.write(`${t.error(t.storage.applyNoSelection())}\n`);
        process.exitCode = 1;
        return;
      }
      const result = await client.request<StorageApplyResponse>(
        "POST",
        "/api/admin/storage/apply",
        {
          planId,
          fingerprint: plan.fingerprint,
          paths,
        },
      );
      if (opts.json === true) {
        process.stdout.write(`${JSON.stringify(result)}\n`);
        return;
      }
      const out = process.stdout;
      if (result.moved.length === 0) {
        out.write(`${t.storage.applyNothing()}\n`);
      } else {
        out.write(
          `${t.storage.applyMoved(
            result.moved.length,
            humanizeBytes(result.freedBytes),
            result.trashId ?? "",
          )}\n`,
        );
      }
      for (const failure of result.failed) {
        out.write(`${t.storage.applyFailedLine(failure.path, failure.reason)}\n`);
      }
    });

  const trash = storage.command("trash").description(t.storage.trashDesc);

  trash
    .command("list", { isDefault: true })
    .description(t.storage.trashListDesc)
    .option("--json", t.common.json)
    .option("--server <url>", t.common.server)
    .action(async (opts) => {
      const client = new ServerClient(await resolveConnection({ server: opts.server }, t), t);
      const response = await client.request<StorageTrashResponse>(
        "GET",
        "/api/admin/storage/trash",
      );
      if (opts.json === true) {
        process.stdout.write(`${JSON.stringify(response)}\n`);
        return;
      }
      if (response.entries.length === 0) {
        process.stdout.write(`${t.storage.trashEmpty()}\n`);
        return;
      }
      process.stdout.write(
        renderTable(
          [
            t.storage.colTrashId(),
            t.storage.colCreated(),
            t.storage.colItems(),
            t.storage.colBytes(),
            t.storage.colExpired(),
          ],
          response.entries.map((entry) => [
            entry.id,
            lastModified(entry.createdAt, t),
            String(entry.items.length),
            humanizeBytes(entry.bytes),
            entry.expired ? t.storage.expired(t.storage.trashTtlDays(response.ttlDays)) : "",
          ]),
        ),
      );
      for (const entry of response.entries) {
        for (const item of entry.items) {
          process.stdout.write(`  ${entry.id}  ${t.storage.className(item.class)}  ${item.path}\n`);
        }
      }
    });

  trash
    .command("restore <id>")
    .description(t.storage.trashRestoreDesc)
    .option("--json", t.common.json)
    .option("--server <url>", t.common.server)
    .action(async (id: string, opts) => {
      const client = new ServerClient(await resolveConnection({ server: opts.server }, t), t);
      const result = await client.request<StorageRestoreResponse>(
        "POST",
        "/api/admin/storage/trash/restore",
        { id },
      );
      if (opts.json === true) {
        process.stdout.write(`${JSON.stringify(result)}\n`);
        return;
      }
      process.stdout.write(
        `${t.storage.trashRestored(result.id, result.restored.length, result.remaining)}\n`,
      );
      for (const skip of result.skipped) {
        process.stdout.write(`${t.storage.trashSkippedLine(skip.path, skip.reason)}\n`);
      }
    });

  trash
    .command("purge [id]")
    .description(t.storage.trashPurgeDesc)
    .option("--json", t.common.json)
    .option("--server <url>", t.common.server)
    .action(async (id: string | undefined, opts) => {
      const client = new ServerClient(await resolveConnection({ server: opts.server }, t), t);
      const result = await client.request<StoragePurgeResponse>(
        "POST",
        "/api/admin/storage/trash/purge",
        id === undefined ? {} : { id },
      );
      if (opts.json === true) {
        process.stdout.write(`${JSON.stringify(result)}\n`);
        return;
      }
      if (result.purged.length === 0) {
        process.stdout.write(`${t.storage.trashPurgeNothing()}\n`);
        return;
      }
      for (const entry of result.purged) {
        process.stdout.write(
          `${t.storage.trashPurgedLine(entry.id, humanizeBytes(entry.bytes))}\n`,
        );
      }
    });

  storage
    .command("mode [state]")
    .description(t.storage.modeDesc)
    .option("--json", t.common.json)
    .option("--server <url>", t.common.server)
    .action(async (state: string | undefined, opts) => {
      if (state !== undefined && state !== "on" && state !== "off") {
        process.stderr.write(`${t.error(t.storage.modeUsage())}\n`);
        process.exitCode = 1;
        return;
      }
      const client = new ServerClient(await resolveConnection({ server: opts.server }, t), t);
      const response =
        state === undefined
          ? await client.request<StorageSettingsResponse>("GET", "/api/admin/storage/settings")
          : await client.request<StorageSettingsResponse>("PUT", "/api/admin/storage/settings", {
              enabled: state === "on",
            });
      if (opts.json === true) {
        process.stdout.write(`${JSON.stringify(response)}\n`);
        return;
      }
      const free = response.settings.trashTtlDays;
      process.stdout.write(
        `${
          state === undefined
            ? t.storage.modeIs(response.settings.enabled, free, response.settings.pins.length)
            : t.storage.modeSet(response.settings.enabled, free, response.settings.pins.length)
        }\n`,
      );
    });
}
