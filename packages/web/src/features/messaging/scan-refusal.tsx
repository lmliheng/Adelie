/**
 * The scan-to-connect block's one refusal line: which answers get drawn on the card instead of
 * arriving as a toast, and what the sentence says when the request never got through.
 *
 * Both cards (`qq-scan-connect.tsx`, `wechat-scan-connect.tsx`) look the same after a failure —
 * the QR comes down, or for WeChat's pairing code it stays up with the input still showing — and
 * the control that asks again is still on screen. A toast is the only place the reason used to
 * appear, and after six seconds the card was exactly what it had been before the press, with the
 * same button and no word about what happened. So a fault stays under the control that caused it,
 * until the next attempt: the button itself is the retry.
 *
 * Three answers are faults. A scan that could not even start (the request failed), a poll loop
 * that gave up after repeated failures, and WeChat's pairing code being refused. `already_bound`
 * is not one of them: nothing failed, there is nothing to retry, and a QR that came down because
 * the bot was already connected is news — it keeps its toast, the way every connecting answer in
 * this app does.
 */
import { refusalText } from "../../lib/api-error";
import { toneInk } from "../../lib/tone";

/**
 * The line for a scan that never started, built from the request's own error.
 *
 * `refusalText` rather than `apiErrorText`: that is the rule every refusal slot in the app
 * follows (7.19) — a request that never reached the server is answered with its code's own
 * localized sentence, and a value this codebase raised itself is shown as it wrote it. The scan
 * can stop before a request is sent (a channel already gated, a task minted elsewhere), so the
 * sentence has to survive an error that is not the server's.
 */
export function scanStartRefusal(failed: (detail: string) => string, error: unknown): string {
  return failed(refusalText(error));
}

/** What a stop step carries, as far as this decision is concerned — either card's shape fits. */
export interface ScanStopNotice {
  readonly notice: string;
  /** Absent on QQ, whose every stop is a fault; only WeChat's `already_bound` is news. */
  readonly tone?: "error" | "info";
}

/**
 * The line to keep on the card for a stop step, or `null` when the step is news and the caller
 * should still hand it to a toast. The tone is optional because QQ's stops have no other kind.
 */
export function scanStopRefusal(step: ScanStopNotice): string | null {
  return (step.tone ?? "error") === "error" ? step.notice : null;
}

/**
 * The line itself, under whichever control asked: `role="alert"` so it is announced when it
 * arrives (a toast was announced once and then left), `line-clamp-2` so a long platform sentence
 * cannot push the fields around, and the whole text on hover — the shape every other refusal slot
 * in the app has. Both cards draw it, and sharing it keeps the two from drifting apart.
 */
export function ScanRefusalLine({ text }: { text: string }) {
  return (
    <p
      role="alert"
      data-tooltip={text}
      data-tooltip-content="text"
      className={`line-clamp-2 text-xs break-words ${toneInk.danger}`}
    >
      {text}
    </p>
  );
}
