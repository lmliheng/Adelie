/**
 * The storage ledger (admin only, server-global): what the data root holds, and what a person
 * could clean up. **Read-only, and the page has to look it.** The app's default is that it keeps
 * every byte, and there is no automatic cleanup anywhere: a future destructive step is a separate,
 * human-reviewed one, so this page draws no delete button, no checkbox and no "clean now" — the
 * sentences at the top say what the page is and that nothing here removes data, and the only
 * control is measuring again.
 *
 * The report is one measurement of one instant (`scannedAt`), so the page replaces it wholesale
 * rather than merging: a figure from an older walk beside a newer one cannot be told apart. It is
 * an admin route (`GET /api/admin/storage`), hence the page-level 403 a non-admin would get — the
 * rail already keeps them from opening it (settings-sections.ts), and this page adds no guard of
 * its own beyond the failure it reports.
 *
 * A measurement walks the whole data root, so it is not free and not instant: the button says it
 * is running and stays disabled while it does, and the first mount fires it exactly once.
 *
 * What the page will NOT do is round the report off. A class the scan could not read, a path it
 * could not enter, a candidate whose mtime is unknown — each is shown as such (see `unreadable`
 * and `StorageCandidate.lastModifiedAt`), because a report that hides its own gaps is the one
 * thing a cleanup decision must not be based on.
 */
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { StorageReport } from "@lmliheng/penguin-server/api";
import {
  Button,
  EmptyState,
  SettingsSection,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  toastError,
} from "@lmliheng/penguin-ui";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { apiErrorText } from "../../lib/api-error";
import { formatBytes, formatDateTime } from "../../lib/format";
import {
  storageClassCost,
  storageClassLabel,
  storageEnvGroupKindLabel,
  storageRulesLabel,
} from "./storage-labels";

/** A section of the page: its heading, an optional line saying what the heading's rows mean. */
function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 text-sm font-medium">{title}</div>
      {hint !== undefined && (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      )}
      {children}
    </section>
  );
}

/** The report's own header: the root, the instant it describes, the total, and the volume's numbers. */
function ReportHeader({ report }: { report: StorageReport }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      <dt className="text-gray-500 dark:text-gray-400">{S.settings.storageRoot}</dt>
      <dd className="min-w-0 font-mono break-all">{report.root}</dd>
      <dt className="text-gray-500 dark:text-gray-400">{S.settings.storageMeasuredAt}</dt>
      <dd className="tabular-nums">{formatDateTime(report.scannedAt)}</dd>
      <dt className="text-gray-500 dark:text-gray-400">{S.settings.storageTotal}</dt>
      <dd className="tabular-nums">{formatBytes(report.totalBytes)}</dd>
      <dt className="text-gray-500 dark:text-gray-400">{S.settings.storageDiskFree}</dt>
      {/* The volume's own numbers are beside the ledger, not in it: a scan can read the root and
          still fail to learn how much room the disk has, and saying so beats leaving the row out
          (a missing row reads as "not asked"). */}
      <dd className="tabular-nums">
        {report.disk === null
          ? S.settings.storageDiskUnknown
          : `${formatBytes(report.disk.freeBytes)} / ${formatBytes(report.disk.totalBytes)}`}
      </dd>
    </dl>
  );
}

/** One row per class: what it holds, and what clearing an entry of it would cost. */
function ClassTable({ report }: { report: StorageReport }) {
  return (
    <Table size="sm" tableClassName="min-w-[560px]">
      <TableHead>
        <TableHeaderCell>{S.settings.storageColClass}</TableHeaderCell>
        <TableHeaderCell align="right">{S.settings.storageColBytes}</TableHeaderCell>
        <TableHeaderCell align="right">{S.settings.storageColFiles}</TableHeaderCell>
        <TableHeaderCell align="right">{S.settings.storageColEntries}</TableHeaderCell>
        <TableHeaderCell align="right">{S.settings.storageColCandidateEntries}</TableHeaderCell>
        <TableHeaderCell align="right">{S.settings.storageColCandidateBytes}</TableHeaderCell>
      </TableHead>
      <TableBody>
        {report.classes.map((row) => (
          <TableRow key={row.class}>
            <TableCell>
              <span className="font-medium">{storageClassLabel(row.class)}</span>
              {/* The cost line rides with the class name rather than in the candidates table: it is
                  a property of the class, and it stays on screen for a class that has no candidate
                  right now — which is when a threshold is off and the number above is zero. */}
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {storageClassCost(row.class)}
              </p>
            </TableCell>
            <TableCell numeric>{formatBytes(row.bytes)}</TableCell>
            <TableCell numeric>{row.files}</TableCell>
            <TableCell numeric>{row.entries}</TableCell>
            <TableCell numeric>{row.candidateEntries}</TableCell>
            <TableCell numeric>{formatBytes(row.candidateBytes)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** The candidate entries: what they are, how big, and what each one matched. */
function CandidateTable({ report }: { report: StorageReport }) {
  const columns = (
    <TableHead>
      <TableHeaderCell>{S.settings.storageColPath}</TableHeaderCell>
      <TableHeaderCell>{S.settings.storageColClass}</TableHeaderCell>
      <TableHeaderCell align="right">{S.settings.storageColBytes}</TableHeaderCell>
      <TableHeaderCell align="right">{S.settings.storageColFiles}</TableHeaderCell>
      <TableHeaderCell>{S.settings.storageColLastModified}</TableHeaderCell>
      <TableHeaderCell>{S.settings.storageColReferenced}</TableHeaderCell>
      <TableHeaderCell>{S.settings.storageColRules}</TableHeaderCell>
    </TableHead>
  );
  return (
    <Block title={S.settings.storageCandidatesTitle}>
      {report.candidates.length === 0 ? (
        // Both halves matter: "nothing found" alone would read as "nothing to find", and the
        // second line says why a clean list is not a clean disk (most rules are off by default).
        <EmptyState
          dashed
          title={S.settings.storageCandidatesEmpty}
          description={S.settings.storageCandidatesEmptyHint}
        />
      ) : (
        <Table size="sm" tableClassName="min-w-[720px]">
          {columns}
          <TableBody>
            {report.candidates.map((candidate) => (
              <TableRow key={candidate.path}>
                {/* The recorded path is what a future plan and a pin name, so it is shown as
                    recorded, monospaced and allowed to break. */}
                <TableCell className="max-w-[280px] font-mono text-xs break-all">
                  {candidate.path}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {storageClassLabel(candidate.class)}
                </TableCell>
                <TableCell numeric>{formatBytes(candidate.bytes)}</TableCell>
                <TableCell numeric>{candidate.files}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {candidate.lastModifiedAt === null
                    ? S.settings.storageNeverModified
                    : formatDateTime(candidate.lastModifiedAt)}
                </TableCell>
                {/* Recomputed when a cleanup actually runs, never trusted from here — so the
                    column is a statement about the moment of the scan and says which. */}
                <TableCell className="whitespace-nowrap">
                  {candidate.referenced
                    ? S.settings.storageReferencedYes
                    : S.settings.storageReferencedNo}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {storageRulesLabel(candidate.rules)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Block>
  );
}

/**
 * The environments that look like the same toolchain installed more than once. Listed with what
 * they hold and how big the group is, and labelled report-only in the hint: two look-alike
 * environments may be at different versions, so the remedy is a merge a person triggers.
 */
function EnvGroups({ report }: { report: StorageReport }) {
  return (
    <Block title={S.settings.storageEnvGroupsTitle} hint={S.settings.storageEnvGroupsHint}>
      <ul className="divide-y divide-gray-100 text-xs dark:divide-gray-800/60">
        {report.sharedEnvGroups.map((group) => (
          <li key={`${group.kind}:${group.key}`} className="py-2.5 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">
                {group.key} · {storageEnvGroupKindLabel(group.kind)}
              </span>
              <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                {S.settings.storageEnvGroupMembers(group.members.length)} ·{" "}
                {formatBytes(group.bytes)}
              </span>
            </div>
            <ul className="mt-1 space-y-1">
              {group.members.map((member) => (
                <li key={member} className="font-mono break-all text-gray-500 dark:text-gray-400">
                  {member}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Block>
  );
}

/**
 * Paths the scan could not read. Rendered only when there are any, and then always: these are the
 * report's own admission that its figures are a lower bound, which is the one thing a reader must
 * not have to go looking for.
 */
function Unreadable({ report }: { report: StorageReport }) {
  return (
    <Block title={S.settings.storageUnreadableTitle} hint={S.settings.storageUnreadableHint}>
      <ul className="space-y-1 text-xs">
        {report.unreadable.map((path) => (
          <li key={path} className="font-mono break-all text-gray-500 dark:text-gray-400">
            {path}
          </li>
        ))}
      </ul>
    </Block>
  );
}

export function StorageSection() {
  /** The last measurement (null until one lands) — replaced, never patched, by the next. */
  const [report, setReport] = useState<StorageReport | null>(null);
  const [busy, setBusy] = useState(false);
  /** A measurement that failed: the page says so and offers to try again. */
  const [failed, setFailed] = useState(false);

  const measure = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      setReport((await api.adminGetStorageReport()).report);
    } catch (e) {
      // The reason is worth a toast (403, a lost session, a dead server), but the page also has
      // to change: a spinner that never stops claims the walk is still running.
      setFailed(true);
      toastError(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void measure();
  }, [measure]);

  return (
    <SettingsSection
      actions={
        <Button size="sm" disabled={busy} aria-busy={busy} onClick={() => void measure()}>
          {busy ? S.settings.storageRescanning : S.settings.storageRescan}
        </Button>
      }
    >
      {/* The page's first sentence is what it is not: a report. Everything below is a figure a
          reader could otherwise mistake for an offer to free space. */}
      <p className="text-xs text-gray-500 dark:text-gray-400">{S.settings.storageReportOnly}</p>
      {report === null && (
        <p className="text-sm text-gray-400">
          {failed ? S.settings.storageFailed : S.settings.storageLoading}
        </p>
      )}
      {report !== null && (
        <>
          {failed && (
            // A re-measure that failed leaves the previous report on screen — it is still the last
            // truth about the disk — so the page has to say which one is being read.
            <p className="text-xs text-gray-500 dark:text-gray-400">{S.settings.storageFailed}</p>
          )}
          <ReportHeader report={report} />
          <Block title={S.settings.storageClassesTitle}>
            <ClassTable report={report} />
          </Block>
          <CandidateTable report={report} />
          {report.sharedEnvGroups.length > 0 && <EnvGroups report={report} />}
          {report.unreadable.length > 0 && <Unreadable report={report} />}
        </>
      )}
    </SettingsSection>
  );
}
