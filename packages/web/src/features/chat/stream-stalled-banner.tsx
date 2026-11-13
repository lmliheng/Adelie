/**
 * The stalled-stream strip above the composer: the live stream has stopped delivering — several
 * connections in a row received nothing at all, which is what a proxy or NAT swallowing the
 * response body looks like from here (api/sse.ts owns the verdict) — so this page keeps the
 * conversation current by refetching it on a timer.
 *
 * Without the strip that failure is invisible AND misleading: the Task is running on the server,
 * the reply is being written, and the page simply never shows any of it, which reads as a hung
 * agent rather than a broken connection.
 *
 * It says what the page is doing rather than what broke. The connection comes back on its own —
 * the stream is probed once a minute — and the strip clears itself the moment a probe gets an
 * event through; reloading is the reader's way out before that.
 */
import { GlyphIcon, ICONS, NoticeStrip } from "@adelie/ui";
import { S } from "../../lib/strings";

export function StreamStalledBanner() {
  return (
    <NoticeStrip
      tone="attention"
      className="anim-fade mb-2 flex items-center gap-2 rounded-md border px-3 py-2 text-xs"
    >
      <span data-slot="icon" className="shrink-0">
        <GlyphIcon d={ICONS.rotateCw} size={14} />
      </span>
      <span className="min-w-0 flex-1 truncate">{S.chat.streamStalled}</span>
    </NoticeStrip>
  );
}
