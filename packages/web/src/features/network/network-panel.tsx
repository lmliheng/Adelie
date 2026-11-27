/**
 * The conversation's "网络" dock panel: the requests THIS page sent for this Session — one row
 * per HTTP call, upload, stream connection or model call — grouped by turn, newest turn first.
 * The data is api/net-log.ts's (recorded at the API layer's own doors); this file is the panel.
 *
 * No switch turns it on: recording is always on and the tab is one of the conversation's like
 * Trace and Files. What the toolbar offers is the same reading controls those panels have —
 * pause a live feed for one investigation, clear it, export it — plus the scope (this reply /
 * five turns / all), a type filter and a search. The detail opens in the panel itself (← back),
 * never in a floating layer, and its tabs are the four questions a request raises: what it was,
 * what was sent, what came back, and what the stream delivered.
 *
 * The list is grouped by the turn the request belongs to (net-rows.ts), so the row a reader is
 * looking for is under the reply they typed. A request made before the page opened a turn — a
 * listing fetch, the Session's stream — sits in its own group at the end.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  Button,
  ConfirmModal,
  Dropdown,
  EmptyState,
  GlyphIcon,
  Dot,
  ICON_SIZE,
  ICONS,
  Menu,
  MenuItem,
  ProgressBar,
  Segmented,
} from "@adelie/ui";
import {
  attachModelExchange,
  clearNetLog,
  maskBody,
  maskHeaders,
  maskUrlQuery,
  NET_VERY_SLOW_MS,
  netLogEntries,
  netLogPaused,
  netLogPrefs,
  netLogVersion,
  sessionTurn,
  setNetLogPaused,
  setNetLogPrefs,
  subscribeNetLog,
  toCurl,
} from "../../api/net-log";
import type { NetRequest } from "../../api/net-log";
import { formatBytes, formatTime, humanizeDuration } from "../../lib/format";
import { writeClipboard } from "../../lib/clipboard";
import { listModelExchanges } from "../../api/endpoints";
import { apiErrorText } from "../../lib/api-error";
import { S } from "../../lib/strings";
import { toneDot, toneInk } from "../../lib/tone";
import type { DockSurface } from "../dock/panel-context";
import type { DockPanelBodyProps } from "../dock/panel-registry";
import { useChatDock } from "../chat/chat-dock-context";
import { SseFrameList } from "../traces/sse-frame-list";
import { pickModelExchange } from "./model-exchange-pick";
import {
  filterNetEntries,
  groupByTurn,
  isNetFailure,
  isNetPending,
  isNetSlow,
  netStatusLabel,
  summarizeNet,
} from "./net-rows";
import type { NetScope, NetTypeFilter } from "./net-rows";
import { exportNetLogJson, netLogJson } from "./net-export";
import { markNetworkFocusApplied, networkFocus, subscribeNetworkFocus } from "./net-focus";
import { recallNetworkPlace, rememberNetworkPlace } from "./network-place";
import type { NetDetailTab } from "./network-place";

const DETAIL_TABS: readonly { key: NetDetailTab; label: () => string }[] = [
  { key: "overview", label: () => S.network.tabOverview },
  { key: "request", label: () => S.network.tabRequest },
  { key: "response", label: () => S.network.tabResponse },
  { key: "events", label: () => S.network.tabEvents },
  { key: "related", label: () => S.network.tabRelated },
];

const PILL =
  "rounded-md border border-line px-2 py-0.5 text-xs text-fg-muted transition-colors duration-150 hover:bg-fill-neutral hover:text-fg";
const PILL_ON =
  "rounded-md border border-line-emphasis bg-fill-neutral px-2 py-0.5 text-xs font-medium text-fg";
const MONO = "font-mono text-xs";

/** One `label · value` line in the detail's overview. */
function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="w-16 shrink-0 text-xs text-fg-subtle">{label}</span>
      <span className="min-w-0 flex-1 break-words font-mono text-xs tabular-nums text-fg">
        {children}
      </span>
    </div>
  );
}

/** The detail's headers table (values masked unless the reader revealed this request). */
function HeaderTable({
  rows,
  revealed,
  empty = S.network.noBody,
}: {
  rows: ReadonlyArray<readonly [string, string]>;
  revealed: boolean;
  /** What an empty table means here: nothing was sent, or this page never saw it (a model call). */
  empty?: string;
}) {
  if (rows.length === 0) return <p className="text-xs text-fg-subtle">{empty}</p>;
  const shown = revealed ? rows : maskHeaders(rows);
  return (
    <dl className="space-y-1">
      {shown.map(([name, value]) => (
        <div key={name} className="flex gap-2">
          <dt className="w-40 shrink-0 break-all font-mono text-xs text-fg-muted">{name}</dt>
          <dd className="min-w-0 flex-1 break-all font-mono text-xs text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A JSON body, masked unless revealed, with the truncation note when it was cut. */
function BodyBlock({
  text,
  truncated,
  revealed,
  empty = S.network.noBody,
}: {
  text: string | null;
  truncated: boolean;
  revealed: boolean;
  /** What "no text" means here — "（空）" for a body that was empty, a reason when it was not. */
  empty?: string;
}) {
  if (text === null || text === "") {
    return <p className="text-xs text-fg-subtle">{empty}</p>;
  }
  return (
    <div className="space-y-1">
      <pre className="max-h-72 overflow-auto rounded-md border border-line-muted bg-surface-muted p-2 font-mono text-xs whitespace-pre-wrap text-fg">
        {revealed ? text : (maskBody(text) ?? "")}
      </pre>
      {truncated && <p className="text-xs text-fg-subtle">{S.network.truncated}</p>}
    </div>
  );
}

/** The detail's timing waterfall: the total, and the phases the client can see (a bar + value). */
function Waterfall({ entry }: { entry: NetRequest }) {
  const total = entry.durationMs ?? 0;
  const inflight = isNetPending(entry);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 text-xs text-fg-muted">{S.network.waterfallTotal}</span>
        <ProgressBar
          className="min-w-0 flex-1"
          size="md"
          label={S.network.waterfallTotal}
          {...(inflight
            ? { indeterminate: true }
            : { value: total > 0 ? 1 : 0, max: 1, tone: "neutral" as const })}
        />
        <span
          className={`shrink-0 font-mono text-xs text-fg ${
            total >= NET_VERY_SLOW_MS ? "font-semibold" : ""
          }`}
        >
          {inflight ? S.network.inflight : humanizeDuration(total)}
        </span>
      </div>
      <p className="text-xs text-fg-subtle">{S.network.waterfallHint}</p>
    </div>
  );
}

export function NetworkPanel({
  active,
  surface,
}: DockPanelBodyProps & {
  /** The dock surface this body is drawn on — what a layout move changes (see network-place.ts). */
  surface: DockSurface;
}) {
  const { selected } = useChatDock();
  const sessionId = selected?.sessionId ?? null;
  const version = useSyncExternalStore(subscribeNetLog, netLogVersion);
  useSyncExternalStore(subscribeNetworkFocus, networkFocus);

  // ---- the place comes back (network-place.ts) ----
  // The place this body arrived into: a layout move mounts the body on the other surface, and the
  // record written there hands back the search word, the filters, the open record and its tab. Any
  // other mount (a tab reopened, a conversation switched back to) arrives on the surface the place
  // was left on, so recall answers null and the panel starts over. Read once: the record is written
  // on every change below, never on the way in.
  const [arrived] = useState(() =>
    sessionId === null ? null : recallNetworkPlace(sessionId, surface),
  );

  const [scope, setScope] = useState<NetScope>(arrived?.scope ?? "turn");
  const [type, setType] = useState<NetTypeFilter>(arrived?.type ?? "all");
  const [query, setQuery] = useState(arrived?.query ?? "");
  const [pinnedTurn, setPinnedTurn] = useState<number | null>(arrived?.pinnedTurn ?? null);
  const [openId, setOpenId] = useState<number | null>(arrived?.openId ?? null);
  const [tab, setTab] = useState<NetDetailTab>(arrived?.tab ?? "overview");
  const [revealed, setRevealed] = useState(false);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Stamped on every change and on arrival — arrival included, so the next crossing (back the other
  // way) finds the record pointing at the surface this body is on now (see network-place.ts).
  useLayoutEffect(() => {
    if (sessionId === null) return;
    rememberNetworkPlace(sessionId, { surface, scope, type, query, pinnedTurn, openId, tab });
  }, [sessionId, surface, scope, type, query, pinnedTurn, openId, tab]);

  // A jump from the transcript's inline request line: show that turn and open the tab. Applying it
  // marks it applied in the store, so a body mounted later (a layout move, a reopened tab) does not
  // replay it over the place that body is restoring (net-focus.ts, network-place.ts).
  const focus = networkFocus();
  const lastFocusAt = useRef(0);
  useEffect(() => {
    if (!focus || focus.at === lastFocusAt.current) return;
    lastFocusAt.current = focus.at;
    setScope("turn");
    setPinnedTurn(focus.turn);
    setOpenId(null);
    setRevealed(false);
    setTab("overview");
    markNetworkFocusApplied(focus.at);
  }, [focus]);

  // A conversation switch starts the panel over (the pin belonged to the other Session).
  const lastSession = useRef(sessionId);
  useEffect(() => {
    if (lastSession.current === sessionId) return;
    lastSession.current = sessionId;
    setPinnedTurn(null);
    setOpenId(null);
    setRevealed(false);
  }, [sessionId]);

  const paused = netLogPaused();
  const prefs = netLogPrefs();
  const currentTurn = sessionTurn(sessionId);
  // "本次回复" follows the newest turn, or the one a jump pinned; picking the scope itself drops
  // the pin (the segmented control's value is what the reader chose).
  const anchorTurn = pinnedTurn ?? currentTurn;

  const entries = netLogEntries();
  const rows = useMemo(
    () => filterNetEntries(entries, { sessionId, scope, currentTurn: anchorTurn, type, query }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, sessionId, scope, anchorTurn, type, query],
  );
  const groups = useMemo(() => groupByTurn(rows), [rows]);
  const summary = useMemo(() => summarizeNet(rows), [rows]);

  const open = openId === null ? null : (entries.find((e) => e.id === openId) ?? null);
  const openRow = (id: number) => {
    setOpenId(id);
    setTab("overview");
    setRevealed(false);
  };

  const scopeOptions = [
    { value: "turn" as const, label: S.network.scopeTurn },
    { value: "recent" as const, label: S.network.scopeRecent },
    { value: "all" as const, label: S.network.scopeAll },
  ];
  const typeOptions = [
    { value: "all" as const, label: S.network.filterAll },
    { value: "http" as const, label: S.network.filterHttp },
    { value: "model" as const, label: S.network.filterModel },
    { value: "stream" as const, label: S.network.filterStream },
    { value: "upload" as const, label: S.network.filterUpload },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ---------------------------------------------------------------- detail (replaces list) */}
      {open !== null ? (
        <NetDetail
          key={open.id}
          entry={open}
          sessionId={sessionId}
          active={active}
          tab={tab}
          onTab={setTab}
          revealed={revealed}
          onBack={() => setOpenId(null)}
          onAskReveal={() => setConfirmReveal(true)}
          onCopyCurl={() => void writeClipboard(toCurl(open))}
          onCopyJson={() => void writeClipboard(netLogJson([open]))}
          siblings={rows.filter((r) => r.turn === open.turn && r.id !== open.id)}
          onOpenRow={openRow}
        />
      ) : (
        <>
          {/* --------------------------------------------------------------- toolbar */}
          <div className="space-y-2 border-b border-line-muted px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                <span
                  aria-hidden
                  className={`inline-block size-1.5 rounded-full ${
                    paused ? toneDot.muted : toneDot.busy
                  }`}
                />
                {paused ? S.network.statusPaused : S.network.statusRecording}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-fg-subtle">
                {S.network.summary(
                  summary.requests,
                  summary.modelCalls,
                  humanizeDuration(summary.durationMs),
                  summary.failures,
                )}
              </span>
              <button type="button" className={PILL} onClick={() => setNetLogPaused(!paused)}>
                {paused ? S.network.resume : S.network.pause}
              </button>
              <button type="button" className={PILL} onClick={() => clearNetLog()}>
                {S.network.clear}
              </button>
              <button
                type="button"
                className={PILL}
                onClick={() => exportNetLogJson(rows.length > 0 ? rows : entries)}
              >
                {S.network.export}
              </button>
              <Dropdown
                open={menuOpen}
                setOpen={setMenuOpen}
                portal={{ direction: "down", align: "right" }}
                menuClass="w-64"
                button={
                  <button
                    type="button"
                    aria-label={S.network.menu}
                    className="flex h-5 w-5 items-center justify-center rounded text-fg-muted transition-colors duration-150 hover:bg-fill-neutral hover:text-fg"
                    onClick={() => setMenuOpen(!menuOpen)}
                  >
                    <GlyphIcon d={ICONS.ellipsis} size={ICON_SIZE.rowLead} />
                  </button>
                }
              >
                <Menu>
                  <MenuItem
                    label={S.network.menuInlineRow}
                    onSelect={() => setNetLogPrefs({ inlineRow: !prefs.inlineRow })}
                  />
                </Menu>
              </Dropdown>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                options={scopeOptions}
                value={scope}
                onChange={(v) => {
                  setPinnedTurn(null);
                  setScope(v);
                }}
              />
              <Segmented options={typeOptions} value={type} onChange={setType} cols={5} />
            </div>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={S.network.searchPlaceholder}
              aria-label={S.network.search}
              className="w-full rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg outline-none placeholder:text-fg-subtle focus:border-line-emphasis"
            />
          </div>

          {/* -------------------------------------------------------------------- list */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {groups.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title={S.network.emptyTitle}
                  description={`${S.network.emptyHint} · ${S.network.emptyPrivacy}`}
                />
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.turn} className="border-b border-line-muted last:border-b-0">
                  <div className="sticky top-0 z-10 flex items-baseline gap-2 bg-surface-muted px-3 py-1 text-xs">
                    <span className="font-medium text-fg">
                      {group.turn === 0 ? S.network.turnBefore : S.network.turnHeading(group.turn)}
                    </span>
                    <span className="text-fg-subtle">{formatTime(group.items[0]!.startedAt)}</span>
                    <span className="ml-auto text-fg-subtle">
                      {S.network.turnSummary(
                        group.items.length,
                        humanizeDuration(
                          group.items.reduce((sum, e) => sum + (e.durationMs ?? 0), 0),
                        ),
                        group.items.filter(isNetFailure).length,
                      )}
                    </span>
                  </div>
                  {group.items.map((entry) => (
                    <RequestRow key={entry.id} entry={entry} onOpen={() => openRow(entry.id)} />
                  ))}
                </div>
              ))
            )}
          </div>

          <p className="border-t border-line-muted px-3 py-1.5 text-center text-xs text-fg-subtle">
            {S.network.privacyNote}
          </p>
        </>
      )}

      <ConfirmModal
        open={confirmReveal}
        title={S.network.revealConfirmTitle}
        tone="danger"
        confirmLabel={S.network.revealConfirmAction}
        cancelLabel={S.common.cancel}
        onClose={() => setConfirmReveal(false)}
        onConfirm={() => {
          setRevealed(true);
          setConfirmReveal(false);
        }}
      >
        <p className="text-sm text-fg-muted">{S.network.revealConfirmBody}</p>
      </ConfirmModal>
    </div>
  );
}

/** One request row in the list. */
function RequestRow({ entry, onOpen }: { entry: NetRequest; onOpen: () => void }) {
  const pending = isNetPending(entry);
  const failed = isNetFailure(entry);
  const slow = isNetSlow(entry) && netLogPrefs().slowHighlight;
  const verySlow = (entry.durationMs ?? 0) >= NET_VERY_SLOW_MS;
  const retried = entry.attempts > 1;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 px-3 py-1 text-left transition-colors duration-150 hover:bg-fill-neutral"
    >
      <span className="w-20 shrink-0 font-mono text-xs text-fg-subtle">
        {formatTime(entry.startedAt)}
      </span>
      {pending ? <Dot tone="info" size="xs" pulse /> : <span className="w-1.5 shrink-0" />}
      <span
        className={`w-12 shrink-0 font-mono text-xs font-medium ${
          entry.kind === "model" ? "text-fg-muted" : "text-fg"
        }`}
      >
        {entry.method}
      </span>
      <span
        className={`w-9 shrink-0 text-right font-mono text-xs ${
          failed ? toneInk.danger : "text-fg-muted"
        }`}
      >
        {netStatusLabel(entry)}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">{entry.path}</span>
      {entry.frameCount !== null && (
        <span className="shrink-0 text-xs text-fg-subtle">
          {S.network.frames(entry.frameCount)}
        </span>
      )}
      {retried && (
        <span className={`shrink-0 text-xs ${toneInk.attention}`}>
          {S.network.retry(entry.attempts)}
        </span>
      )}
      {slow && <span className="shrink-0 text-xs text-fg-subtle">{S.network.slow}</span>}
      <span
        className={`w-16 shrink-0 text-right font-mono text-xs text-fg-muted ${
          verySlow ? "font-semibold text-fg" : ""
        }`}
      >
        {pending ? S.network.inflight : humanizeDuration(entry.durationMs ?? 0)}
      </span>
    </button>
  );
}

/** What the detail knows about a model row's bodies before they are in `entry`. */
type ModelBodyNote =
  { kind: "loading" } | { kind: "missing" } | { kind: "failed"; reason: string } | null;

/** The in-panel detail view (opened by a row; ← returns to the list). */
function NetDetail({
  entry,
  sessionId,
  active,
  tab,
  onTab,
  revealed,
  onBack,
  onAskReveal,
  onCopyCurl,
  onCopyJson,
  siblings,
  onOpenRow,
}: {
  entry: NetRequest;
  sessionId: string | null;
  active: boolean;
  tab: NetDetailTab;
  onTab: (t: NetDetailTab) => void;
  revealed: boolean;
  onBack: () => void;
  onAskReveal: () => void;
  onCopyCurl: () => void;
  onCopyJson: () => void;
  siblings: NetRequest[];
  onOpenRow: (id: number) => void;
}) {
  const failed = isNetFailure(entry);
  // A model row's content is not on this page: the stream gave the row its boundaries, and the
  // server keeps the request/response in a ring (services/model-exchange-log.ts). Fetch it when
  // the row is opened — matched by the server-clock timestamp `request_end` carried — so only a
  // row someone is actually reading costs a request.
  //
  // The three answers this fetch can give read differently and are kept apart: still coming, the
  // ring no longer holds it (it keeps the newest MODEL_EXCHANGE_CAP calls process-wide), and the
  // request itself was refused. Drawing all three as "（空）" told the reader the provider was
  // sent an empty request.
  const [modelBodies, setModelBodies] = useState<ModelBodyNote>(null);
  const needsModelBodies =
    entry.kind === "model" &&
    entry.requestBody === null &&
    entry.serverEndedAt !== null &&
    sessionId !== null;
  useEffect(() => {
    if (!needsModelBodies) return;
    const endedAt = entry.serverEndedAt as number;
    const sid = sessionId as string;
    let cancelled = false;
    setModelBodies({ kind: "loading" });
    void listModelExchanges(sid, { after: endedAt - 60_000, limit: 20 })
      .then(({ exchanges }) => {
        if (cancelled) return;
        const best = pickModelExchange(exchanges, endedAt);
        if (best === null) {
          setModelBodies({ kind: "missing" });
          return;
        }
        attachModelExchange(entry, {
          requestBody: best.requestJson,
          responseBody: best.responseJson,
          requestTruncated: best.requestTruncated,
          responseTruncated: best.responseTruncated,
        });
        setModelBodies(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setModelBodies({ kind: "failed", reason: apiErrorText(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [needsModelBodies, entry, sessionId]);

  const bodyEmpty =
    modelBodies === null
      ? S.network.noBody
      : modelBodies.kind === "loading"
        ? S.network.modelBodyLoading
        : modelBodies.kind === "missing"
          ? S.network.modelBodyMissing
          : S.network.modelBodyFailed(modelBodies.reason);
  // A model call is made by the server, so this page never sees its headers — an empty table here
  // is "not captured", not "none were sent".
  const headerEmpty = entry.kind === "model" ? S.network.notCaptured : S.network.noBody;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-1.5 border-b border-line-muted px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={S.network.back}
            onClick={onBack}
            className="-ml-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-muted transition-colors duration-150 hover:bg-fill-neutral hover:text-fg"
          >
            <GlyphIcon d={ICONS.chevronLeft} size={ICON_SIZE.rowLead} />
          </button>
          <span className="shrink-0 font-mono text-xs font-medium text-fg">{entry.method}</span>
          <span
            className={`shrink-0 font-mono text-xs ${failed ? toneInk.danger : "text-fg-muted"}`}
          >
            {netStatusLabel(entry)}
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">
            {maskUrlQuery(entry.url)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
          <span>
            {isNetPending(entry) ? S.network.inflight : humanizeDuration(entry.durationMs ?? 0)}
          </span>
          {entry.frameCount !== null && <span>{S.network.frames(entry.frameCount)}</span>}
          {entry.responseBytes > 0 && <span>{formatBytes(entry.responseBytes)}</span>}
          <span className="ml-auto font-mono">{formatTime(entry.startedAt)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={PILL} onClick={onCopyCurl}>
            {S.network.copyCurl}
          </button>
          <button type="button" className={PILL} onClick={onCopyJson}>
            {S.network.copyJson}
          </button>
          <button type="button" className={revealed ? PILL_ON : PILL} onClick={onAskReveal}>
            {revealed ? S.network.hide : S.network.reveal}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {DETAIL_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onTab(t.key)}
              className={`rounded px-2 py-0.5 text-xs transition-colors duration-150 ${
                tab === t.key
                  ? "bg-fill-neutral font-medium text-fg"
                  : "text-fg-muted hover:text-fg"
              }`}
            >
              {t.label()}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2">
        {tab === "overview" && (
          <>
            <p className="text-xs font-medium text-fg-muted">{S.network.waterfall}</p>
            <Waterfall entry={entry} />
            <div className="pt-1">
              <KeyValue label={S.network.fieldRequestId}>{entry.requestId}</KeyValue>
              <KeyValue label={S.network.fieldTurn}>
                {entry.turn === 0 ? S.network.turnBefore : String(entry.turn)}
              </KeyValue>
              <KeyValue label={S.network.fieldMethod}>{entry.method}</KeyValue>
              <KeyValue label={S.network.fieldUrl}>{maskUrlQuery(entry.url)}</KeyValue>
              <KeyValue label={S.network.fieldStatus}>{netStatusLabel(entry)}</KeyValue>
              <KeyValue label={S.network.fieldDuration}>
                {isNetPending(entry) ? S.network.inflight : humanizeDuration(entry.durationMs ?? 0)}
              </KeyValue>
              <KeyValue label={S.network.fieldSize}>{formatBytes(entry.responseBytes)}</KeyValue>
              {entry.frameCount !== null && (
                <KeyValue label={S.network.fieldFrames}>{String(entry.frameCount)}</KeyValue>
              )}
              <KeyValue label={S.network.fieldAttempts}>{String(entry.attempts)}</KeyValue>
              {entry.error !== null && (
                <KeyValue label={S.network.fieldStatus}>
                  <span className={toneInk.danger}>{entry.error}</span>
                </KeyValue>
              )}
            </div>
          </>
        )}

        {tab === "request" && (
          <>
            <p className="text-xs font-medium text-fg-muted">{S.network.headers}</p>
            <HeaderTable rows={entry.headers} revealed={revealed} empty={headerEmpty} />
            <p className="pt-1 text-xs font-medium text-fg-muted">{S.network.requestBody}</p>
            <BodyBlock
              text={entry.requestBody}
              truncated={entry.requestTruncated}
              revealed={revealed}
              empty={bodyEmpty}
            />
          </>
        )}

        {tab === "response" && (
          <>
            <p className="text-xs font-medium text-fg-muted">{S.network.responseHeaders}</p>
            <HeaderTable rows={entry.responseHeaders} revealed={revealed} empty={headerEmpty} />
            <p className="pt-1 text-xs font-medium text-fg-muted">{S.network.responseBody}</p>
            <BodyBlock
              text={entry.responseBody}
              truncated={entry.responseTruncated}
              revealed={revealed}
              empty={bodyEmpty}
            />
          </>
        )}

        {tab === "events" && (
          <>
            <div className="rounded-md border border-line-muted">
              <div className="flex items-center justify-between px-2.5 py-1 text-xs">
                <span className="text-fg-muted">{S.network.serverWrote}</span>
                <span className="text-fg-subtle">{S.network.notCaptured}</span>
              </div>
              <div className="flex items-center justify-between border-t border-line-muted px-2.5 py-1 text-xs">
                <span className="text-fg-muted">{S.network.browserGot}</span>
                <span className="text-fg-subtle">
                  {entry.frameCount === null
                    ? S.network.notCaptured
                    : S.network.frames(entry.frameCount)}
                </span>
              </div>
            </div>
            <p className="text-xs text-fg-subtle">{S.network.eventsHint}</p>
            {entry.kind === "stream" && sessionId !== null && (
              <SseFrameList sessionId={sessionId} active={active} />
            )}
          </>
        )}

        {tab === "related" && (
          <div className="space-y-1">
            {siblings.length === 0 ? (
              <p className="text-xs text-fg-subtle">{S.network.relatedEmpty}</p>
            ) : (
              siblings.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onOpenRow(s.id)}
                  className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors duration-150 hover:bg-fill-neutral"
                >
                  <span className="w-12 shrink-0 font-mono text-xs text-fg-muted">{s.method}</span>
                  <span
                    className={`w-9 shrink-0 text-right font-mono text-xs ${
                      isNetFailure(s) ? toneInk.danger : "text-fg-muted"
                    }`}
                  >
                    {netStatusLabel(s)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">
                    {s.path}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
