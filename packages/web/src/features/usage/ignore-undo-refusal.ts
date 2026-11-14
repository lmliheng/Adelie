/**
 * Undoing an ignore rule (`features/usage/errors-panel.tsx`) and the line a refusal leaves under
 * the button that asked for it.
 *
 * Two buttons ask for the same write: the `撤销` on the notice that follows an ignore, and the
 * `取消忽略` on the rule's own row in the ignored view. Both keep their place on screen when the
 * DELETE is refused — the notice still says how many records it hid and still offers the undo, the
 * row still lists the rule — so the retry is the same control; what was missing was the reason,
 * which arrived as a notification that dismissed itself after six seconds while the page looked as
 * if the press had never happened (7.19's rule, app-wide: the sentence belongs where the attempt
 * was made).
 *
 * The refusal is keyed by the place that asked as well as by the rule: while a notice is still on
 * screen it names the very same rule id the ignored view lists, so the id alone cannot tell the two
 * hosts apart — and the sentence belongs under the button that was pressed, not under both.
 *
 * Which words: `refusalText`, the rule every refusal in the app follows — an answer the server gave
 * is read through its code's own localized sentence, and a value this codebase raised itself is
 * shown as it wrote it.
 */
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/** The two places on the page that offer the undo; the refusal goes back to the one that asked. */
export type IgnoreUndoHost = "notice" | "rule";

/** What a refused undo is about (the rule, and which host asked) and what to draw there. */
export interface IgnoreUndoRefusal {
  readonly host: IgnoreUndoHost;
  /** The rule the refused DELETE named — the same id the notice and the rules list carry. */
  readonly id: number;
  readonly text: string;
}

/**
 * The sentence: which class is still silenced, and why the undo did not take. It says the rule is
 * still in place outright, because the whole point of pressing undo is that those records stay
 * hidden until it is gone.
 */
export function ignoreUndoRefused(
  host: IgnoreUndoHost,
  id: number,
  label: string,
  error: unknown,
): IgnoreUndoRefusal {
  return { host, id, text: S.usage.errorsUnignoreRefused(label, refusalText(error)) };
}
