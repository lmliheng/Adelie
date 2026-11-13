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
 * and a row whose Session reports itself idle is dropped immediately rather than at the next
 * fetch. Closed menu, no requests and no work.
 */
import { useEffect, useMemo, useState } from "react";
import type { SessionInfo, SessionStatus } from "@adelie/server/api";
import * as api from "../../api/endpoints";
import { useProject } from "../../state/project";
import { useSessions } from "../../state/sessions";

/**
 * The fetched rows with the live status applied: a Session the channel has moved to `idle` is
 * gone (the fetch is older than that news), and one it reports running/compacting says so even
 * if the fetch predates the change. Pure, so the merge is testable without a React tree.
 */
export function mergeRunningSessions(
  fetched: readonly SessionInfo[],
  live: ReadonlyMap<string, SessionStatus>,
): SessionInfo[] {
  return fetched
    .map((session) => {
      const status = live.get(session.sessionId);
      return status === undefined ? session : { ...session, status };
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

/** The Project's live Sessions while `open`; the last answer is kept across refetches. */
export function useRunningSessions(open: boolean): {
  sessions: SessionInfo[];
  loading: boolean;
} {
  const { currentProject } = useProject();
  const projectId = currentProject?.projectId ?? null;
  const { liveStatuses } = useSessions();
  const [fetched, setFetched] = useState<SessionInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const key = useMemo(() => liveRunningKey(liveStatuses), [liveStatuses]);

  useEffect(() => {
    if (!open || projectId === null) return;
    let cancelled = false;
    setLoading(true);
    api
      .getRunningSessions(projectId)
      .then((res) => {
        if (!cancelled) setFetched(res.sessions);
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
    () => mergeRunningSessions(fetched ?? [], liveStatuses),
    [fetched, liveStatuses],
  );
  return { sessions, loading };
}
