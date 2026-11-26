/**
 * The assistant reply's inline request line: how many requests this turn made, how many model
 * calls, and how long they took — one small line beside the task stats row, red once anything
 * failed. Clicking it opens the "网络" tab on this turn's group (see net-focus.ts).
 *
 * Shown by default (it is one line of small text) and turned off in the Network panel's "⋯"
 * menu, which writes the preference the store here reads. Nothing is drawn while the turn has
 * no recorded requests — a page opened mid-conversation has none for its older turns, and an
 * empty line would say nothing.
 */
import { useMemo, useSyncExternalStore } from "react";
import { GlyphIcon, ICON_SIZE, ICONS } from "@adelie/ui";
import { netLogEntries, netLogPrefs, netLogVersion, subscribeNetLog } from "../../api/net-log";
import type { NetRequest } from "../../api/net-log";
import { humanizeDuration } from "../../lib/format";
import { S } from "../../lib/strings";
import { toneInk } from "../../lib/tone";
import { openPanel } from "../dock/dock-state";
import { useChatDock } from "../chat/chat-dock-context";
import { isNetFailure } from "./net-rows";
import { requestNetworkFocus } from "./net-focus";

export function NetInlineRow({ turn }: { turn: number }) {
  const { selected } = useChatDock();
  const sessionId = selected?.sessionId ?? null;
  // The store's change signal: entries mutate in place, so the version is what re-renders.
  const version = useSyncExternalStore(subscribeNetLog, netLogVersion);
  const show = netLogPrefs().inlineRow;

  const rows = useMemo(
    () =>
      sessionId === null || !show
        ? []
        : netLogEntries().filter((e: NetRequest) => e.sessionId === sessionId && e.turn === turn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, turn, version, show],
  );

  if (!show || rows.length === 0) return null;

  let durationMs = 0;
  let modelCalls = 0;
  let failed = false;
  for (const row of rows) {
    durationMs += row.durationMs ?? 0;
    if (row.kind === "model") modelCalls += 1;
    if (isNetFailure(row)) failed = true;
  }

  const open = () => {
    requestNetworkFocus(turn);
    openPanel("network", "right");
  };

  return (
    <button
      type="button"
      onClick={open}
      data-tooltip={S.chat.netRequestsTooltip}
      data-net-turn={turn}
      className={`inline-flex items-center gap-1 rounded px-1 text-xs transition-colors duration-150 hover:bg-fill-neutral ${
        failed ? toneInk.danger : "text-fg-muted hover:text-fg"
      }`}
    >
      <GlyphIcon d={ICONS.pulse} size={ICON_SIZE.inlineGlyph} />
      {S.chat.netRequestsLine(rows.length, modelCalls, humanizeDuration(durationMs))}
    </button>
  );
}
