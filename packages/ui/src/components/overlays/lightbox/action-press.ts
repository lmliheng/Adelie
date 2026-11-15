/**
 * One press on the lightbox's action bar, apart from the markup so the order can be read and
 * tested on its own.
 *
 * An action's `onSelect` is the caller's own work, and it answers in one of two ways (see
 * `LightboxAction`):
 *
 * - a plain action has already done everything it means to do, or has started something that
 *   reports for itself (a prompt in the composer, a turn posted through the conversation's own
 *   slot). The press is finished the moment it returns, and the overlay closes with it;
 * - an action that answers with a promise is still working, so the overlay stays up — the picture
 *   is where the gesture started, and a press whose answer has not arrived yet must not look like
 *   one that did nothing. The sentence a promise resolves to is that press's refusal, drawn under
 *   the bar with the button still there to press again; an empty answer, or none at all, means the
 *   work landed and the overlay closes.
 *
 * A rejected promise is the caller's to turn into words — it is the only one that knows what the
 * press meant — and one that arrives without any leaves the press as finished, like a plain action:
 * keeping the overlay up over a silence would only leave the reader pressing a button again.
 */

/** What a press leaves for the overlay to do next. */
export type ActionPress =
  /** An action that answers with a promise is running: the overlay stays, its button is busy. */
  | { kind: "pending" }
  /** Finished: nothing to say about it, and the overlay closes. */
  | { kind: "done" }
  /** Finished, and refused: the sentence belongs under the bar, and the overlay stays up. */
  | { kind: "refused"; text: string };

/** Whether `onSelect`'s return value is something to wait for rather than a finished press. */
function answersLater(
  value: void | Promise<string | null | undefined>,
): value is Promise<string | null | undefined> {
  return typeof (value as { then?: unknown } | undefined)?.then === "function";
}

/**
 * Run one press and report what the overlay should do, in order: `pending` at most once (only for
 * an action that answers with a promise), then exactly one of `done` / `refused`.
 */
export function pressLightboxAction(
  onSelect: () => void | Promise<string | null | undefined>,
  report: (press: ActionPress) => void,
): void {
  const answer = onSelect();
  if (!answersLater(answer)) {
    report({ kind: "done" });
    return;
  }
  report({ kind: "pending" });
  void Promise.resolve(answer).then(
    (sentence) =>
      report(
        typeof sentence === "string" && sentence !== ""
          ? { kind: "refused", text: sentence }
          : { kind: "done" },
      ),
    () => report({ kind: "done" }),
  );
}
