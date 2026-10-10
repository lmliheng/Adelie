/**
 * `penguin storage` — the data root's storage ledger.
 *
 *   penguin storage [--top <n>] [--json] [--server <url>]
 *
 * Reports what occupies `ADELIE_HOME`: one row per class (user data, temporary Workspaces,
 * Session drafts, Traces, tool environments, trash, the database, everything else), then the
 * entries a person could clean up, then the environments that look like the same toolchain
 * installed twice, then anything the scan could not read.
 *
 * **This command deletes nothing and has no flag that would.** Producing the ledger only
 * reads, and the design's rule is that a destructive step needs a human review of a specific
 * candidate list — a later subcommand, never something a report can trigger. The header, the
 * candidate section and the trailing notice all say so, because a table of "candidates" with
 * no sentence about who acts on it would read as a to-do list the tool already did.
 *
 * The numbers come from the server (see routes/admin-storage.ts), not from walking the disk
 * here: which Sessions still exist — and therefore which temporary Workspaces and draft
 * directories are still referenced — is a database question, and only the server holds the
 * database. A report computed locally against a stale lock file could name a live Session's
 * Workspace as unreferenced, which is exactly the mistake the whole design is built to avoid.
 *
 * Docs: /docs/cli § "penguin storage".
 */
import type { Command } from "commander";
import type {
  StorageCandidate,
  StorageReport,
  StorageReportResponse,
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

export function registerStorageCommand(program: Command, t: Messages): void {
  program
    .command("storage")
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

      out.write(`\n${t.storage.readOnlyNotice()}\n`);
    });
}
