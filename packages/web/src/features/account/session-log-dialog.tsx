/**
 * The account menu's run record: usage by day, each day split by Session — "which
 * conversations spent the Tokens this week".
 *
 * One request answers the whole dialog (`GET /sessions/usage/session-days`): the days arrive
 * newest first with each day's Sessions already named (title and Agent), so a day opens with no
 * second round trip and a conversation the sidebar never loaded is still recognisable. The
 * cost center answers the same question by Agent and Model; this is the per-conversation view
 * the account menu needs, in the one place the user looks before asking "what did I spend
 * today".
 *
 * Today's total is read off the head of the list rather than computed separately: the server
 * always answers today (at zero when nothing ran), so the figure is the same sum the day's row
 * shows.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { UsageSessionDay, UsageSessionDays } from "@adelie/server/api";
import { Button, Modal, SettingsEmpty, SkeletonList } from "@adelie/ui";
import * as api from "../../api/endpoints";
import { Truncated } from "../../components/ui/truncated";
import { apiErrorText } from "../../lib/api-error";
import { formatMoney, formatMonthDay, humanizeTokens, localYmd } from "../../lib/format";
import { S } from "../../lib/strings";
import { useLocale } from "../../state/locale";
import { agentDisplayName, useProject } from "../../state/project";
import { useTheme } from "../../state/theme";

/** The two windows the dialog offers; the server takes 1..90. */
const RANGES = [7, 30] as const;

export function SessionLogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentProject, agents } = useProject();
  const { currency } = useTheme();
  const { locale } = useLocale();
  const [days, setDays] = useState<number>(RANGES[0]);
  const [data, setData] = useState<UsageSessionDays | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** The day whose Sessions are open under it; one at a time keeps the dialog short. */
  const [expanded, setExpanded] = useState<string | null>(null);

  const projectId = currentProject?.projectId ?? null;

  const load = useCallback(async () => {
    if (projectId === null) return;
    setLoading(true);
    setError(null);
    try {
      setData(await api.getUsageSessionDays(projectId, days));
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, days]);

  // Read on every open and whenever the window changes: the numbers move while the dialog is
  // closed, and the request is one grouped scan.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Opening lands on today with nothing unfolded, whatever the previous visit left open.
  useEffect(() => {
    if (open) setExpanded(null);
  }, [open]);

  const agentNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents) map.set(a.agentId, agentDisplayName(a));
    return map;
  }, [agents]);

  const today = localYmd(new Date());
  const todayRow = data?.days.find((d) => d.date === today) ?? null;

  const dayLabel = (date: string): string => {
    if (date === today) return S.account.sessionLog.today;
    return formatMonthDay(date, locale);
  };

  return (
    <Modal
      open={open}
      title={S.account.sessionLog.title}
      onClose={onClose}
      widthClass="sm:max-w-2xl"
      footer={
        <Button size="sm" onClick={onClose}>
          {S.common.close}
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-fg-muted">{S.account.sessionLog.desc}</p>

        {/* Today's total, before the days: the one figure the dialog is opened for. */}
        <div className="flex items-baseline justify-between rounded-lg border border-line bg-surface px-3 py-2">
          <span className="text-sm font-medium">{S.account.sessionLog.today}</span>
          <span className="flex items-baseline gap-3 font-mono text-sm">
            <span>
              {humanizeTokens(todayRow?.total ?? 0)}{" "}
              <span className="text-xs text-fg-muted">{S.account.sessionLog.tokens}</span>
            </span>
            <span>{formatMoney(todayRow?.cost ?? null, currency)}</span>
            <span>
              {todayRow?.requests ?? 0}{" "}
              <span className="text-xs text-fg-muted">{S.account.sessionLog.requests}</span>
            </span>
          </span>
        </div>

        {/* Window switch: two windows are enough to answer "today / this week" and "this month". */}
        <div className="flex items-center gap-1.5">
          {RANGES.map((r) => (
            <Button
              key={r}
              size="sm"
              variant={days === r ? "primary" : "secondary"}
              onClick={() => setDays(r)}
            >
              {S.account.sessionLog.range(r)}
            </Button>
          ))}
        </div>

        {error !== null && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {S.account.sessionLog.loadFailed(error)}
          </p>
        )}

        {data === null && loading && <SkeletonList rows={4} />}

        {data !== null && data.days.length === 0 && (
          <SettingsEmpty>{S.account.sessionLog.empty}</SettingsEmpty>
        )}

        {data !== null && data.days.length > 0 && (
          <ul className="space-y-2">
            {data.days.map((day) => (
              <li key={day.date} className="rounded-lg border border-line">
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === day.date ? null : day.date)}
                  aria-expanded={expanded === day.date}
                  className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-gray-800/40"
                >
                  <span className="text-sm font-medium">{dayLabel(day.date)}</span>
                  <span className="flex items-baseline gap-3 font-mono text-xs text-fg-muted">
                    <span>
                      {humanizeTokens(day.total)} {S.account.sessionLog.tokens}
                    </span>
                    <span>{formatMoney(day.cost, currency)}</span>
                    <span>
                      {day.requests} {S.account.sessionLog.requests}
                    </span>
                    <span>{S.account.sessionLog.sessions(day.sessions.length)}</span>
                  </span>
                </button>
                {expanded === day.date && (
                  <div className="border-t border-line px-3 py-1">
                    {day.sessions.length === 0 ? (
                      <p className="py-2 text-xs text-fg-muted">{S.account.sessionLog.emptyDay}</p>
                    ) : (
                      <ul>
                        {day.sessions.map((session) => (
                          <SessionRow
                            key={session.sessionId}
                            session={session}
                            agentName={agentNames.get(session.agentId) ?? session.agentId}
                            currency={currency}
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/** One conversation inside an unfolded day: its title, its Agent, and what it spent. */
function SessionRow({
  session,
  agentName,
  currency,
}: {
  session: UsageSessionDay["sessions"][number];
  agentName: string;
  currency: "USD" | "CNY";
}) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-b-0">
      <span className="min-w-0">
        <Truncated
          text={session.title ?? `${S.account.sessionLog.unknownSession} ${session.sessionId}`}
          className="block text-sm"
        />
        <span className="block truncate text-xs text-fg-muted">{agentName}</span>
      </span>
      <span className="flex shrink-0 items-baseline gap-3 font-mono text-xs text-fg-muted">
        <span>
          {humanizeTokens(session.total)} {S.account.sessionLog.tokens}
        </span>
        <span>
          {formatMoney(session.cost, currency)}
          {session.hasUncosted ? ` · ${S.account.sessionLog.unpriced}` : ""}
        </span>
        <span>
          {session.requests} {S.account.sessionLog.requests}
        </span>
      </span>
    </li>
  );
}

/** A day's heading: "今天" for today, else the localized month and day of that calendar date. */
