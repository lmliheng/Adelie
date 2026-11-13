/**
 * The Trace panel's Transport view: the SSE frames this browser actually received, newest first,
 * behind a toggle that is OFF by default (see api/sse-frames.ts — it stores payload prefixes, so
 * it is the reader's call, and the state is remembered in localStorage).
 *
 * Its question is the one nothing else on screen can answer: the live stream went quiet — did
 * data ever arrive, and what was in it? A row is one frame off the wire (its SSE event name, its
 * id, its byte length, the opening of its payload), one connection marker (`open`, `reopen`,
 * `stalled`, `live`, `probe`, `error`, `closed`), or one `silence` marker for a stretch longer
 * than the server's heartbeat. Reading down it separates the two failures a quiet conversation
 * has: nothing arriving (frames are missing) from nothing being written (frames are there).
 *
 * It shows the receiving side only. What the server wrote is not visible from here — a page can
 * prove that a frame arrived, never that one was never sent.
 *
 * Live while it shows: frames land as the run streams, so the list re-renders on the recorder's
 * own notifications. A hidden dock tab (or a turned-off toggle) records nothing to the screen and
 * subscribes to nothing.
 */
import { useEffect, useReducer, useState } from "react";
import { formatBytes, humanizeDuration } from "../../lib/format";
import { S } from "../../lib/strings";
import {
  clearSseFrames,
  setSseFramesEnabled,
  sseFrames,
  sseFramesEnabled,
  subscribeSseFrames,
} from "../../api/sse-frames";
import { formatFrameTime, transportRows } from "./transport-rows";

/** The pill both the file row and this toggle wear. */
const PILL_CLASS = "rounded-md border px-2 py-0.5 font-mono text-xs transition-colors duration-150";

export function SseFrameList({ sessionId, active }: { sessionId: string; active: boolean }) {
  const [enabled, setEnabled] = useState(sseFramesEnabled);
  const [, bump] = useReducer((v: number) => v + 1, 0);

  // The recorder reports every change; only a showing panel listens, so a hidden tab pays
  // nothing per frame.
  useEffect(() => {
    if (!enabled || !active) return;
    return subscribeSseFrames(bump);
  }, [enabled, active]);

  const rows = enabled ? transportRows(sseFrames(), sessionId) : [];

  const toggle = () => {
    const next = !enabled;
    setSseFramesEnabled(next);
    setEnabled(next);
  };

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-800">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="shrink-0 text-xs text-gray-400">{S.tracePanel.transport}</span>
        <button
          type="button"
          aria-pressed={enabled}
          onClick={toggle}
          className={`${PILL_CLASS} ${
            enabled
              ? "border-gray-400 bg-gray-200/70 font-semibold text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              : "border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800/60"
          }`}
        >
          {enabled ? S.tracePanel.transportOn : S.tracePanel.transportOff}
        </button>
        {enabled && (
          <span className="min-w-0 flex-1 truncate text-xs text-gray-400">
            {S.tracePanel.transportCount(rows.length)}
          </span>
        )}
        {enabled && rows.length > 0 && (
          <button
            type="button"
            onClick={() => clearSseFrames()}
            className={`${PILL_CLASS} border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800/60`}
          >
            {S.tracePanel.transportClear}
          </button>
        )}
      </div>
      {!enabled && (
        <p className="px-2.5 pb-1.5 text-xs text-gray-400">{S.tracePanel.transportHint}</p>
      )}
      {enabled && rows.length === 0 && (
        <p className="px-2.5 pb-1.5 text-xs text-gray-400">{S.tracePanel.transportEmpty}</p>
      )}
      {enabled && rows.length > 0 && (
        <ul className="max-h-64 overflow-y-auto border-t border-gray-100 dark:border-gray-800/60">
          {rows.map((f, i) => (
            <li
              key={`${f.at}-${i}`}
              className="flex items-baseline gap-2 px-2.5 py-1 font-mono text-xs"
            >
              <span className="shrink-0 text-gray-400">{formatFrameTime(f.at)}</span>
              {/* Which of the two streams this row came off: the Session's own (unmarked) or the
                  page's user-level one, which carries no Session (see transport-rows.ts). */}
              {f.sessionId === null && (
                <span className="shrink-0 text-gray-400">{S.tracePanel.transportChannel}</span>
              )}
              <span
                className={`shrink-0 ${
                  f.kind === "frame" ? "text-gray-700 dark:text-gray-300" : "text-gray-400"
                }`}
              >
                {f.kind === "gap"
                  ? S.tracePanel.transportSilence(humanizeDuration(f.gapMs ?? 0))
                  : f.event}
              </span>
              {/* The channel's own id (`<epoch>-<seq>`): what a reconnect resumes from, and
                  what a gap in the sequence shows up as. */}
              {f.id !== null && <span className="shrink-0 text-gray-400">{f.id}</span>}
              {f.kind === "frame" && (
                <span className="shrink-0 text-gray-400">{formatBytes(f.bytes)}</span>
              )}
              <span className="min-w-0 flex-1 truncate text-gray-500 dark:text-gray-400">
                {f.preview}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
