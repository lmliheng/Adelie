/**
 * The storage ledger (admin only, server-global): what the data root holds, what a person could
 * clean up, and the reviewed cleanup that reads it.
 *
 * Two halves, and the mode switch between them. The **ledger** measures — one walk of the whole
 * data root, class by class, with the entries that matched a cleanup rule — and the app keeps its
 * promise that it deletes nothing by itself: no scan and no move happens on a timer, and a page
 * left open measures once and then waits. The **cleanup** is the design's second step, and it can
 * only happen because somebody read a bill and ticked rows on it: a scan writes that bill, an
 * apply moves exactly the ticked entries into the trash, and the trash is where the one deletion
 * in the whole app lives. With the mode off — which is the default, and what an untouched install
 * has — none of that exists on screen, and the page is the read-only ledger it was.
 *
 * The report is one measurement of one instant (`scannedAt`), so the page replaces it wholesale
 * rather than merging: a figure from an older walk beside a newer one cannot be told apart. It is
 * an admin route (`GET /api/admin/storage`), hence the page-level 403 a non-admin would get — the
 * rail already keeps them from opening it (settings-sections.ts), and this page adds no guard of
 * its own beyond the failure it reports.
 *
 * A measurement walks the whole data root, so it is not free and not instant: the buttons say they
 * are running and stay disabled while they do, and the first mount fires exactly one measurement
 * and one read of the mode. A scan, an apply and every trash write are the reviewer's own clicks.
 *
 * What the page will NOT do is round the report off. A class the scan could not read, a path it
 * could not enter, a candidate whose mtime is unknown — each is shown as such (see `unreadable`
 * and `StorageCandidate.lastModifiedAt`), because a report that hides its own gaps is the one
 * thing a cleanup decision must not be based on. The same rule governs the bill: a row this
 * version cannot move is drawn rather than dropped, a refusal is reported with the server's own
 * reason instead of a summary, and the fingerprint an approval sends is the one the displayed bill
 * carries (storage-review.ts) — never one re-read from somewhere else.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  StorageApplyResponse,
  StorageClass,
  StoragePlanEntryView,
  StoragePlanView,
  StoragePurgeResponse,
  StorageReport,
  StorageRestoreResponse,
  StorageSettings,
  StorageTrashEntry,
} from "@lmliheng/penguin-server/api";
import {
  Button,
  Checkbox,
  EmptyState,
  NoticeStrip,
  SettingsSection,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  toastError,
  toastSuccess,
} from "@lmliheng/penguin-ui";
import * as api from "../../api/endpoints";
import { S } from "../../lib/strings";
import { apiErrorText } from "../../lib/api-error";
import { formatBytes, formatDateTime } from "../../lib/format";
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
} from "./storage-labels";
import {
  NO_SELECTION,
  storageApplyBody,
  storageBillGroups,
  storageClassFullySelected,
  storageMovableEntries,
  storageOpenPlan,
  storageSelectClass,
  storageSelectionTotals,
  storageTogglePath,
  storageUnselectClass,
} from "./storage-review";
import type { StorageBillGroup } from "./storage-review";

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
                {/* The recorded path is what a plan and a pin name, so it is shown as
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

/**
 * The mode switch, and the one sentence that says what its position means. Everything else on the
 * page that writes hangs off it, so it is drawn first and its sentence names what the other
 * position cannot do — that difference is the whole page, and a reader who scrolls past it should
 * still be told which page they are on.
 */
function ModeRow({
  settings,
  busy,
  failed,
  onChange,
}: {
  settings: StorageSettings | null;
  busy: boolean;
  /** The settings could not be read: the switch then shows the position the page acts on (off). */
  failed: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const enabled = settings?.enabled === true;
  return (
    <Block title={S.settings.storageModeTitle}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {S.settings.storageModeLabel}
        </span>
        <Switch
          aria-label={S.settings.storageModeLabel}
          checked={enabled}
          // Deliberately not disabled when the read failed: a switch that cannot be pressed leaves
          // no way back from a failed read, while a PUT that succeeds both turns the mode on and
          // replaces the guess with the answer the server holds.
          disabled={busy}
          onChange={onChange}
        />
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {failed
          ? S.settings.storageModeFailed
          : enabled
            ? S.settings.storageModeOn
            : S.settings.storageModeOff}
      </p>
    </Block>
  );
}

/** The bill's own header: which scan it is, and until when it can still be approved. */
function BillHeader({ plan }: { plan: StoragePlanView }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      <dt className="text-gray-500 dark:text-gray-400">{S.settings.storageBillId}</dt>
      <dd className="min-w-0 font-mono break-all">{plan.id}</dd>
      <dt className="text-gray-500 dark:text-gray-400">{S.settings.storageBillCreatedAt}</dt>
      <dd className="tabular-nums">{formatDateTime(plan.createdAt)}</dd>
      <dt className="text-gray-500 dark:text-gray-400">{S.settings.storageBillExpiresAt}</dt>
      <dd className="tabular-nums">{formatDateTime(plan.expiresAt)}</dd>
      <dt className="text-gray-500 dark:text-gray-400">{S.settings.storageBillTotal}</dt>
      <dd className="tabular-nums">
        {formatBytes(plan.totalBytes)} · {S.settings.storageBillEntries(plan.entries.length)}
      </dd>
    </dl>
  );
}

/**
 * One class of a bill: its name with what clearing one of its entries costs, the way to take or
 * drop its whole class at once, and its rows.
 *
 * The class's own button touches only the rows this page may move, so a report-only class offers
 * words instead of a button — a control that cannot do anything is worse than a sentence saying
 * so.
 */
function BillGroup({
  plan,
  group,
  pins,
  movable,
  selection,
  approvable,
  enabled,
  pinning,
  onToggleRow,
  onSelectClass,
  onUnselectClass,
  onPin,
}: {
  plan: StoragePlanView;
  group: StorageBillGroup;
  pins: ReadonlySet<string>;
  /** The paths this page may move right now, mode and bill state included. */
  movable: ReadonlySet<string>;
  selection: ReadonlySet<string>;
  /** Whether the bill may still be applied at all; with it false nothing here is operable. */
  approvable: boolean;
  /** Whether the cleanup mode is on — pins are refused while it is off, like every other write. */
  enabled: boolean;
  /** The path whose pin request is in flight, so one row's button is busy and no others are. */
  pinning: string | null;
  onToggleRow: (path: string) => void;
  onSelectClass: (classKey: StorageClass) => void;
  onUnselectClass: (classKey: StorageClass) => void;
  onPin: (path: string, pinned: boolean) => void;
}) {
  const selectable = group.entries.filter((entry) => movable.has(entry.path));
  const fullySelected = storageClassFullySelected(plan, selection, group.class, pins);
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm font-medium">{storageClassLabel(group.class)}</span>
          {/* The class's price tag, the same line the ledger's class table shows: the reviewer is
              told what clearing one of these costs at the moment they can decide to. */}
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {storageClassCost(group.class)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
            {S.settings.storageBillGroupTotals(group.entries.length, formatBytes(group.bytes))}
          </span>
          {selectable.length === 0 ? (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {S.settings.storageSelectClassNothing}
            </span>
          ) : (
            <Button
              size="sm"
              disabled={!approvable}
              title={approvable ? undefined : S.settings.storageModeRequired}
              onClick={() =>
                fullySelected ? onUnselectClass(group.class) : onSelectClass(group.class)
              }
            >
              {fullySelected ? S.settings.storageUnselectClass : S.settings.storageSelectClass}
            </Button>
          )}
        </div>
      </div>
      <Table size="sm" tableClassName="min-w-[880px]">
        <TableHead>
          <TableHeaderCell>{S.settings.storageColSelect}</TableHeaderCell>
          <TableHeaderCell>{S.settings.storageColPath}</TableHeaderCell>
          <TableHeaderCell align="right">{S.settings.storageColBytes}</TableHeaderCell>
          <TableHeaderCell align="right">{S.settings.storageColFiles}</TableHeaderCell>
          <TableHeaderCell>{S.settings.storageColLastModified}</TableHeaderCell>
          <TableHeaderCell>{S.settings.storageColRules}</TableHeaderCell>
          <TableHeaderCell>{S.settings.storageColExecutable}</TableHeaderCell>
          <TableHeaderCell>{S.settings.storageColPin}</TableHeaderCell>
        </TableHead>
        <TableBody>
          {group.entries.map((entry) => (
            <BillRow
              key={entry.path}
              entry={entry}
              pinned={pins.has(entry.path)}
              ticked={selection.has(entry.path)}
              movable={movable.has(entry.path)}
              enabled={enabled}
              pinning={pinning}
              onToggleRow={onToggleRow}
              onPin={onPin}
            />
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

/** One row of a bill: the box, what the entry is, and the two things that can be done with it. */
function BillRow({
  entry,
  pinned,
  ticked,
  movable,
  enabled,
  pinning,
  onToggleRow,
  onPin,
}: {
  entry: StoragePlanEntryView;
  pinned: boolean;
  ticked: boolean;
  /** The box is inert for a row this page may not move — a report-only class, or a pinned path. */
  movable: boolean;
  enabled: boolean;
  pinning: string | null;
  onToggleRow: (path: string) => void;
  onPin: (path: string, pinned: boolean) => void;
}) {
  return (
    <TableRow>
      <TableCell>
        {/* Named by its path: the row's own words are in the cells beside it, and a bare box
            carries no name of its own. */}
        <Checkbox
          checked={ticked && movable}
          disabled={!movable}
          aria-label={entry.path}
          onChange={() => onToggleRow(entry.path)}
        />
      </TableCell>
      <TableCell className="max-w-[280px] font-mono text-xs break-all">{entry.path}</TableCell>
      <TableCell numeric>{formatBytes(entry.bytes)}</TableCell>
      <TableCell numeric>{entry.files}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {entry.lastModifiedAt === null
          ? S.settings.storageNeverModified
          : formatDateTime(entry.lastModifiedAt)}
      </TableCell>
      <TableCell className="whitespace-nowrap">{storageRulesLabel(entry.rules)}</TableCell>
      <TableCell className="whitespace-nowrap">
        {storageExecutableLabel(entry.executable)}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <Button
          size="sm"
          variant="ghost"
          disabled={!enabled || pinning !== null}
          aria-busy={pinning === entry.path}
          title={enabled ? undefined : S.settings.storageModeRequired}
          onClick={() => onPin(entry.path, !pinned)}
        >
          {pinned ? S.settings.storageUnpin : S.settings.storagePin}
        </Button>
      </TableCell>
    </TableRow>
  );
}

/** What an approval did: how much moved, where it went, and what refused to move. */
function ApplyResult({ result }: { result: StorageApplyResponse }) {
  return (
    <div className="mt-4 text-xs">
      <p className="font-medium">
        {result.moved.length === 0
          ? S.settings.storageApplyNothingMoved
          : S.settings.storageApplyResult(result.moved.length, formatBytes(result.freedBytes))}
      </p>
      {result.trashId !== null && (
        <p className="mt-1 font-mono break-all text-gray-500 dark:text-gray-400">
          {S.settings.storageApplyTrashId(result.trashId)}
        </p>
      )}
      {result.failed.length > 0 && (
        <>
          <p className="mt-2 font-medium">{S.settings.storageApplyFailedTitle}</p>
          {/* The server's own reason, as it sent it: two failures with the same path can differ
              (a rename refused, a target that came back), and a summarized reason would erase
              exactly the distinction the person has to act on. */}
          <ul className="mt-1 space-y-1">
            {result.failed.map((item) => (
              <li key={item.path} className="font-mono break-all text-gray-500 dark:text-gray-400">
                {S.settings.storageApplyFailedLine(item.path, item.reason)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** The trash: what a move put aside, entry by entry, with the two things a person may do with it. */
function TrashBlock({
  entries,
  ttlDays,
  enabled,
  busy,
  restored,
  purged,
  onRestore,
  onPurge,
}: {
  entries: StorageTrashEntry[];
  ttlDays: number | null;
  enabled: boolean;
  busy: string | null;
  restored: StorageRestoreResponse | null;
  purged: StoragePurgeResponse | null;
  onRestore: (id: string) => void;
  /** Without an id: only the entries past the retention. */
  onPurge: (id?: string) => void;
}) {
  return (
    <Block
      title={S.settings.storageTrashTitle}
      // The retention is the server's number, so the sentence is built from the answer to the
      // listing request rather than from a constant here; without it the line stays generic
      // instead of quoting a default that may not be the stored one.
      hint={ttlDays === null ? undefined : S.settings.storageTrashHint(ttlDays)}
    >
      {/* The one deletion there is, said once and in the danger tone, above the buttons that do it. */}
      <NoticeStrip tone="danger" as="p" className="rounded-md px-3 py-2 text-xs">
        {S.settings.storageTrashPurgeWarning}
      </NoticeStrip>
      {entries.length === 0 ? (
        <div className="mt-4">
          <EmptyState dashed title={S.settings.storageTrashEmpty} />
        </div>
      ) : (
        <Table size="sm" tableClassName="min-w-[720px]">
          <TableHead>
            <TableHeaderCell>{S.settings.storageColTrashId}</TableHeaderCell>
            <TableHeaderCell>{S.settings.storageColTrashCreated}</TableHeaderCell>
            <TableHeaderCell align="right">{S.settings.storageColTrashItems}</TableHeaderCell>
            <TableHeaderCell align="right">{S.settings.storageColBytes}</TableHeaderCell>
            <TableHeaderCell>{S.settings.storageColTrashState}</TableHeaderCell>
            <TableHeaderCell>{S.settings.storageColTrashActions}</TableHeaderCell>
          </TableHead>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-mono break-all">{entry.id}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatDateTime(entry.createdAt)}
                </TableCell>
                <TableCell numeric>{entry.items.length}</TableCell>
                <TableCell numeric>{formatBytes(entry.bytes)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {storageTrashStateLabel(storageTrashState(entry))}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Button
                    size="sm"
                    disabled={!enabled || busy !== null}
                    aria-busy={busy === `restore:${entry.id}`}
                    title={enabled ? undefined : S.settings.storageModeRequired}
                    onClick={() => onRestore(entry.id)}
                  >
                    {busy === `restore:${entry.id}`
                      ? S.settings.storageTrashRestoring
                      : S.settings.storageTrashRestore}
                  </Button>
                  {/* Labelled "delete for good" rather than "clean up": this button removes what
                      the entry holds, and the word is the whole warning. */}
                  <Button
                    size="sm"
                    variant="danger"
                    className="ml-2"
                    disabled={!enabled || busy !== null}
                    aria-busy={busy === `purge:${entry.id}`}
                    title={enabled ? undefined : S.settings.storageModeRequired}
                    onClick={() => onPurge(entry.id)}
                  >
                    {S.settings.storageTrashPurge}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {entries.some((entry) => entry.expired) && (
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            variant="danger"
            disabled={!enabled || busy !== null}
            aria-busy={busy === "purge:expired"}
            title={enabled ? undefined : S.settings.storageModeRequired}
            onClick={() => onPurge()}
          >
            {S.settings.storageTrashPurgeExpired}
          </Button>
        </div>
      )}
      {restored !== null && (
        <div className="mt-3 text-xs">
          <p className="font-medium">
            {S.settings.storageTrashRestored(restored.restored.length, restored.skipped.length)}
          </p>
          <p className="mt-1 text-gray-500 dark:text-gray-400">
            {restored.remaining
              ? S.settings.storageTrashRestoreRemaining.yes
              : S.settings.storageTrashRestoreRemaining.no}
          </p>
          {restored.skipped.length > 0 && (
            <ul className="mt-1 space-y-1">
              {restored.skipped.map((item) => (
                <li
                  key={item.path}
                  className="font-mono break-all text-gray-500 dark:text-gray-400"
                >
                  {S.settings.storageTrashSkippedLine(item.path, item.reason)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {purged !== null && (
        <p className="mt-3 text-xs font-medium">
          {purged.purged.length === 0
            ? S.settings.storageTrashPurgedNothing
            : S.settings.storageTrashPurged(
                purged.purged.length,
                formatBytes(purged.purged.reduce((sum, item) => sum + item.bytes, 0)),
              )}
        </p>
      )}
    </Block>
  );
}

export function StorageSection() {
  /** The last measurement (null until one lands) — replaced, never patched, by the next. */
  const [report, setReport] = useState<StorageReport | null>(null);
  const [busy, setBusy] = useState(false);
  /** A measurement that failed: the page says so and offers to try again. */
  const [failed, setFailed] = useState(false);

  /** The cleanup mode, and with it the pins; null until the server has answered. */
  const [settings, setSettings] = useState<StorageSettings | null>(null);
  const [modeBusy, setModeBusy] = useState(false);
  /** The mode's settings could not be read, so the page behaves as if it were off. */
  const [modeFailed, setModeFailed] = useState(false);

  /** The bill under review, or null when there is none. */
  const [plan, setPlan] = useState<StoragePlanView | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanFailed, setScanFailed] = useState(false);

  /** The ticked paths — empty is the default a page and a fresh bill both open in. */
  const [selection, setSelection] = useState<ReadonlySet<string>>(NO_SELECTION);
  const [applying, setApplying] = useState(false);
  const [applyFailed, setApplyFailed] = useState<string | null>(null);
  const [applied, setApplied] = useState<StorageApplyResponse | null>(null);

  const [trash, setTrash] = useState<StorageTrashEntry[]>([]);
  const [ttlDays, setTtlDays] = useState<number | null>(null);
  /** Which trash action is in flight (`restore:<id>` / `purge:<id>` / `purge:expired`), or none. */
  const [trashBusy, setTrashBusy] = useState<string | null>(null);
  const [restored, setRestored] = useState<StorageRestoreResponse | null>(null);
  const [purged, setPurged] = useState<StoragePurgeResponse | null>(null);
  /** The path whose pin request is in flight, so one row's button is busy and no others are. */
  const [pinning, setPinning] = useState<string | null>(null);

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

  /**
   * The mode, the pins and the trash — the three reads that are not a walk of the root. A bill
   * the page is already showing is left alone: it is the one being reviewed, and a reload only
   * adopts the server's newest approvable bill so a page that is opened later is not empty.
   *
   * All three arrive together or the page says it could not read them: a mode known while the
   * trash is not (or the reverse) would draw a half-true page, and the one thing worse than a
   * disabled control is a control enabled by a stale answer.
   */
  const loadState = useCallback(async () => {
    try {
      const [settingsRes, trashRes, plansRes] = await Promise.all([
        api.adminGetStorageSettings(),
        api.adminGetStorageTrash(),
        api.adminListStoragePlans(),
      ]);
      setSettings(settingsRes.settings);
      setTrash(trashRes.entries);
      setTtlDays(trashRes.ttlDays);
      setPlan((current) => current ?? storageOpenPlan(plansRes.plans));
      setModeFailed(false);
    } catch (e) {
      setModeFailed(true);
      toastError(apiErrorText(e));
    }
  }, []);

  useEffect(() => {
    void measure();
    void loadState();
  }, [measure, loadState]);

  const enabled = settings?.enabled === true;
  const pins = useMemo(() => new Set(settings?.pins ?? []), [settings]);

  /**
   * The rows this page may move right now: the bill's own movable entries, and only while the
   * mode is on and the bill may still be applied. One set, computed once, so every box on the
   * page and the apply button agree about what a click would do.
   */
  const movable = useMemo(() => {
    if (plan === null || !enabled || !plan.usable) return NO_SELECTION;
    return new Set(storageMovableEntries(plan, pins).map((entry) => entry.path));
  }, [plan, enabled, pins]);

  const saveMode = async (next: boolean) => {
    if (modeBusy) return;
    setModeBusy(true);
    try {
      setSettings((await api.adminUpdateStorageSettings({ enabled: next })).settings);
      toastSuccess(S.common.saved);
    } catch (e) {
      toastError(apiErrorText(e));
    } finally {
      setModeBusy(false);
    }
  };

  const scan = async () => {
    if (scanning) return;
    setScanning(true);
    setScanFailed(false);
    setApplied(null);
    setApplyFailed(null);
    try {
      const fresh = await api.adminScanStorage();
      setPlan(fresh.plan);
      // A new bill replaces the old one wholesale, and a selection belongs to the bill that
      // offered it: keeping ticks across two bills would be approving rows nobody read.
      setSelection(NO_SELECTION);
    } catch (e) {
      // With the mode off the server refuses this with `storage_mode_off`; the page disables the
      // button instead, so reaching here means the mode changed elsewhere since it was read.
      setScanFailed(true);
      toastError(apiErrorText(e));
    } finally {
      setScanning(false);
    }
  };

  const apply = async () => {
    if (plan === null || applying) return;
    const body = storageApplyBody(plan, selection, pins);
    if (body === null) return;
    setApplying(true);
    setApplyFailed(null);
    try {
      const result = await api.adminApplyStoragePlan(body);
      setApplied(result);
      // The bill is spent by that run whatever moved, so the page drops it and goes back to
      // "scan again" rather than leaving boxes a second apply would be refused for; the ledger
      // and the trash are re-read because both just changed.
      setPlan(null);
      setSelection(NO_SELECTION);
      await Promise.all([measure(), loadState()]);
    } catch (e) {
      // A refusal here is the interesting case (a stale bill, an entry that came alive, the mode
      // turned off elsewhere): it is kept on the page, where the selection it refused still is.
      setApplyFailed(apiErrorText(e));
      toastError(apiErrorText(e));
    } finally {
      setApplying(false);
    }
  };

  const pin = async (path: string, pinned: boolean) => {
    if (plan === null || pinning !== null) return;
    setPinning(path);
    try {
      setSettings((await api.adminPinStoragePath(plan.id, { path, pinned })).settings);
      // A pinned path is refused by an apply, so it must not stay ticked: the refusal is
      // all-or-nothing, and it would name a row the page still drew as selected.
      if (pinned) {
        setSelection((current) => {
          const next = new Set(current);
          next.delete(path);
          return next;
        });
      }
    } catch (e) {
      toastError(apiErrorText(e));
    } finally {
      setPinning(null);
    }
  };

  const restore = async (id: string) => {
    if (trashBusy !== null) return;
    setTrashBusy(`restore:${id}`);
    setRestored(null);
    setPurged(null);
    try {
      setRestored(await api.adminRestoreStorageTrash(id));
      // Trees came back into the data root, so the ledger is a measurement of a moment that has
      // just passed; re-measuring is what keeps the two halves of the page telling one story.
      await Promise.all([measure(), loadState()]);
    } catch (e) {
      toastError(apiErrorText(e));
    } finally {
      setTrashBusy(null);
    }
  };

  const purge = async (id?: string) => {
    if (trashBusy !== null) return;
    setTrashBusy(id === undefined ? "purge:expired" : `purge:${id}`);
    setRestored(null);
    setPurged(null);
    try {
      setPurged(await api.adminPurgeStorageTrash(id));
      // The trash is part of the ledger's own figures, so the report is re-read rather than left
      // showing the size of what has just been deleted.
      await Promise.all([measure(), loadState()]);
    } catch (e) {
      toastError(apiErrorText(e));
    } finally {
      setTrashBusy(null);
    }
  };

  const approvable = plan !== null && plan.usable && enabled && !applying;
  const totals = plan === null ? null : storageSelectionTotals(plan, selection, pins);

  return (
    <SettingsSection
      actions={
        <>
          <Button size="sm" disabled={busy} aria-busy={busy} onClick={() => void measure()}>
            {busy ? S.settings.storageRescanning : S.settings.storageRescan}
          </Button>
          {/* Disabled rather than offered-and-refused while the mode is off: the scan is a write
              (it creates a bill), and the sentence under the switch says so. */}
          <Button
            size="sm"
            variant="primary"
            disabled={!enabled || scanning}
            aria-busy={scanning}
            title={enabled ? undefined : S.settings.storageModeRequired}
            onClick={() => void scan()}
          >
            {scanning ? S.settings.storageScanning : S.settings.storageScan}
          </Button>
        </>
      }
    >
      {/* The page's first sentence is what it promises, mode and all: everything below it is
          either a figure or an action a person has to take. */}
      <p className="text-xs text-gray-500 dark:text-gray-400">{S.settings.storageReportOnly}</p>
      <ModeRow
        settings={settings}
        busy={modeBusy}
        failed={modeFailed}
        onChange={(next) => void saveMode(next)}
      />
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
      {enabled && (
        <Block title={S.settings.storageBillTitle}>
          {scanFailed && (
            <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
              {S.settings.storageScanFailed}
            </p>
          )}
          {plan === null ? (
            <EmptyState
              dashed
              title={S.settings.storageBillNone}
              description={S.settings.storageScanHint}
            />
          ) : (
            <>
              <BillHeader plan={plan} />
              {/* The bill's state in its own sentence, and what its stamps mean: a reviewer has to
                  know whether the boxes below still mean anything before ticking one. */}
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {storagePlanStateText(storagePlanState(plan))} {S.settings.storageBillHint}
              </p>
              <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                <p className="font-medium text-gray-600 dark:text-gray-300">
                  {plan.excluded.length === 0
                    ? S.settings.storagePinsEmpty
                    : S.settings.storageExcludedTitle(plan.excluded.length)}
                </p>
                <p className="mt-0.5">{S.settings.storagePinsHint}</p>
                <ul className="mt-1 space-y-1">
                  {plan.excluded.map((path) => (
                    <li key={path} className="font-mono break-all">
                      {path}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 font-medium text-gray-600 dark:text-gray-300">
                  {S.settings.storagePinsTitle(settings?.pins.length ?? 0)}
                </p>
                <ul className="mt-1 space-y-1">
                  {(settings?.pins ?? []).map((path) => (
                    <li key={path} className="font-mono break-all">
                      {path}
                    </li>
                  ))}
                </ul>
              </div>
              <section className="mt-6">
                <div className="mb-2 text-sm font-medium">{S.settings.storageBillClassesTitle}</div>
                {plan.entries.length === 0 ? (
                  <EmptyState dashed title={S.settings.storageScanEmpty} />
                ) : (
                  storageBillGroups(plan).map((group) => (
                    <BillGroup
                      key={group.class}
                      plan={plan}
                      group={group}
                      pins={pins}
                      movable={movable}
                      selection={selection}
                      approvable={approvable}
                      enabled={enabled}
                      pinning={pinning}
                      onToggleRow={(path) =>
                        setSelection((current) => storageTogglePath(plan, current, path, pins))
                      }
                      onSelectClass={(classKey) =>
                        setSelection((current) => storageSelectClass(plan, current, classKey, pins))
                      }
                      onUnselectClass={(classKey) =>
                        setSelection((current) =>
                          storageUnselectClass(plan, current, classKey, pins),
                        )
                      }
                      onPin={(path, next) => void pin(path, next)}
                    />
                  ))
                )}
              </section>
              <div className="mt-4 flex items-center justify-end gap-3">
                {/* The default is nothing selected, and the line says so rather than leaving the
                    button's disabled state unexplained. */}
                <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                  {totals === null || totals.entries === 0
                    ? S.settings.storageSelectionNone
                    : S.settings.storageSelectionSummary(totals.entries, formatBytes(totals.bytes))}
                </span>
                <Button
                  variant="primary"
                  disabled={!approvable || (totals?.entries ?? 0) === 0}
                  loading={applying}
                  title={enabled ? undefined : S.settings.storageModeRequired}
                  onClick={() => void apply()}
                >
                  {applying ? S.settings.storageApplying : S.settings.storageApply}
                </Button>
              </div>
              <p className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">
                {S.settings.storageApplyHint}
              </p>
              {applied !== null && <ApplyResult result={applied} />}
            </>
          )}
          {applyFailed !== null && (
            // Where the refusal is kept: the selection it refused to move is still below it, and a
            // toast would be gone by the time the person has read which rows were ticked.
            <NoticeStrip tone="danger" as="p" className="mt-3 rounded-md px-3 py-2 text-xs">
              {applyFailed}
            </NoticeStrip>
          )}
        </Block>
      )}
      <TrashBlock
        entries={trash}
        ttlDays={ttlDays}
        enabled={enabled}
        busy={trashBusy}
        restored={restored}
        purged={purged}
        onRestore={(id) => void restore(id)}
        onPurge={(id) => void purge(id)}
      />
    </SettingsSection>
  );
}
