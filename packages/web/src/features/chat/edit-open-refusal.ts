/**
 * The Files panel's Edit action: the sentence the panel draws when the editor cannot be opened,
 * and why it is drawn on the panel instead of arriving as a toast.
 *
 * Edit does not always open: an isolated HTML preview carries no text (the iframe serves the
 * page), so the source is read on that click — and a file over the preview ceiling cannot be
 * taken in whole, while a read can fail outright (the Agent rewrote or deleted it a moment ago).
 * Either way the panel looks exactly as it did before the click: same preview, same Edit button
 * in the same place. The reason used to live only in a notification that dismissed itself after
 * six seconds, leaving a button that looked as though it had simply not been pressed; it now
 * stays above the preview, next to the control that raised it, until the next attempt.
 *
 * Which words: over the ceiling is `editTooLarge`, which already says what to do instead
 * (download it) — the editor is not the retry, the download is. A failed read is
 * `editOpenFailed` over `refusalText` (7.19), the rule every refusal slot in the app follows.
 */
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/** The line for a file the editor cannot hold whole: it was read, found too long, and never opened. */
export function editOpenTooLargeRefusal(kb: number): string {
  return S.files.editTooLarge(kb);
}

/** The line for a source read that failed before the editor could open: `error` is what the read threw. */
export function editOpenFailedRefusal(error: unknown): string {
  return S.files.editOpenFailed(refusalText(error));
}
