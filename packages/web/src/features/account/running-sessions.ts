/**
 * "What is running right now" for the account menu: the Project's live Sessions, fetched as a
 * whole when the menu opens and kept in step with the user channel while it stays open.
 *
 * The sidebar's own lists cannot answer this. They are paged per Agent and category, so a
 * conversation running inside a group nobody expanded — or an archived one — has no row on
 * screen, and asking every Agent's list would be a fan-out per render. One project-level read
 * (`GET /sessions/running`) walks the runtime's table instead.
 *
 * No timer runs here. The page already follows every `session_state` on the user channel
 * (`liveStatuses` in state/sessions.tsx), which is what reports a run starting, compacting and
 * ENDING; the fetch is re-issued only when that live set stops agreeing with what was fetched,
 * and a row whose Session reports itself idle SINCE that fetch is dropped immediately rather than
 * at the next one. Closed menu, no requests and no work.
 */
import { useEffect, useMemo, useState } from "react";
import type { SessionInfo, SessionStatus } from "@adelie/server/api";
import * as api from "../../api/endpoints";
import { useProject } from "../../state/project";
import { useSessions } from "../../state/sessions";

/**
 * The fetched rows with the live status applied: a Session the channel has moved since the fetch
 * went out says the newer status — `idle` means the row is gone, running/compacting means it stays
 * and says so. Pure, so the merge is testable without a React tree.
 *
 * `baseline` is that live map as it stood when the request was SENT, and it is what keeps the
 * merge from being a plain override. A status the channel already held back then cannot be news
 * the answer missed: the server read its own table at or after that moment, so the fetched row is
 * the later word and stands. Without this, one stale entry poisons the whole list — the channel
 * remembers `idle` for a Session whose run ended earlier (the only source that reports a run
 * ending, so it must), and a relay or proxy that later swallows the response body means the next
 * run's `running` never arrives: the fetch says running and the menu still says nothing is
 * running, which is exactly the report this fixes.
 *
 * Only a status that MOVED since the request can be newer than the answer, so only it relabels or
 * drops a row. One case slips through: a status that flips and flips back inside the round trip
 * leaves the map looking untouched, and the row keeps the fetched status.
 */
export function mergeRunningSessions(
  fetched: readonly SessionInfo[],
  live: ReadonlyMap<string, SessionStatus>,
  baseline: ReadonlyMap<string, SessionStatus>,
): SessionInfo[] {
  return fetched
    .map((session) => {
      const status = live.get(session.sessionId);
      if (status === undefined || status === baseline.get(session.sessionId)) return session;
      return { ...session, status };
    })
    .filter((session) => session.status !== "idle");
}

/**
 * The key that says "the live set moved": every Session the channel reports as running or
 * compacting, with its status. A run ending is deliberately not in it — that only removes a
 * row, which the merge does by itself; a new run or a compaction starting needs the row's
 * title, which only a fetch can bring.
 */
function liveRunningKey(live: ReadonlyMap<string, SessionStatus>): string {
  const parts: string[] = [];
  for (const [sessionId, status] of live) {
    if (status !== "idle") parts.push(`${sessionId}:${status}`);
  }
  return parts.sort().join("|");
}

/** Nothing fetched yet, so no live status can be "newer" than an answer. */
const NO_STATUSES: ReadonlyMap<string, SessionStatus> = new Map();

/** The Project's live Sessions while `open`; the last answer is kept across refetches. */
export function useRunningSessions(open: boolean): {
  sessions: SessionInfo[];
  loading: boolean;
} {
  const { currentProject } = useProject();
  const projectId = currentProject?.projectId ?? null;
  const { liveStatuses } = useSessions();
  /**
   * The answer AND the live map it was asked against (see `mergeRunningSessions`): the two travel
   * together because the baseline is only meaningful next to the rows it was meant to explain.
   */
  const [fetched, setFetched] = useState<{
    sessions: SessionInfo[];
    baseline: ReadonlyMap<string, SessionStatus>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const key = useMemo(() => liveRunningKey(liveStatuses), [liveStatuses]);

  useEffect(() => {
    if (!open || projectId === null) return;
    let cancelled = false;
    // Read here, before the request: everything the channel holds at this instant is older than
    // the server's own read, so none of it may overrule the answer.
    const baseline = liveStatuses;
    setLoading(true);
    api
      .getRunningSessions(projectId)
      .then((res) => {
        if (!cancelled) setFetched({ sessions: res.sessions, baseline });
      })
      // A failed read leaves the last list on screen: the menu is a glance, not a report, and
      // the next event (or the next open) asks again.
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, key]);

  // A Project switch answers nothing about the new one until its fetch lands: the old rows
  // would name Sessions the menu is no longer about.
  useEffect(() => {
    setFetched(null);
  }, [projectId]);

  const sessions = useMemo(
    () =>
      mergeRunningSessions(fetched?.sessions ?? [], liveStatuses, fetched?.baseline ?? NO_STATUSES),
    [fetched, liveStatuses],
  );
  return { sessions, loading };
}
