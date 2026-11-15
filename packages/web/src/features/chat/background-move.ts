/**
 * "Send to background" on an executing tool call (`features/chat/tool-call-card.tsx`, the text
 * action at the row's right end) and the sentence a refusal leaves under that row.
 *
 * The route has three answers, and only one of them leaves anything for the reader to do:
 * 204 moved the call (the row itself reports it — the marker `[Background]` and the process
 * list), 404 means it stopped in the click's race window and 409 that the tool has no
 * background form (the card settles on its own either way, so neither is worth a word), and
 * anything else is a real failure the user should see. That last one used to arrive as a
 * notification that dismissed itself after six seconds while the row looked as if the press had
 * never registered — 7.19's rule, app-wide: the sentence belongs where the attempt was made.
 * The action is still there (the call it names is still executing), so it is the retry.
 *
 * Which words: `refusalText`, the rule every refusal slot in the app follows — an answer the
 * server gave is read through its code's own localized sentence, and a value this codebase
 * raised itself is shown as it wrote it. The sentence claims nothing about the call's state:
 * the route answers nothing but "not running" / "not detachable" for the two shapes that are
 * worth knowing about, so a 5xx is a failure this end cannot read further into.
 */
import { ApiError } from "../../api/client";
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/**
 * What one press answered — the shape `onSendToBackground` hands back to the card that pressed.
 *
 * It used to be `Promise<void>` with the parent toasting the reason, so the card could not tell
 * "moved" from "there was nothing to move" and the reason never reached the row that asked. The
 * refusal now travels with the answer, still as the raw error: the card composes the sentence,
 * because it is the one that knows which row was pressed (see `backgroundMoveRefused`).
 */
export type BackgroundMoveAnswer =
  | { readonly kind: "moved" }
  /** 404 / 409: the call stopped, or its tool has no background form — the row settles by itself. */
  | { readonly kind: "settled" }
  | { readonly kind: "refused"; readonly error: unknown };

/** The answer one settle of the request becomes: which shapes the card is expected to stay quiet about. */
export function backgroundMoveAnswer(error: unknown): BackgroundMoveAnswer {
  if (error instanceof ApiError && (error.status === 404 || error.status === 409)) {
    return { kind: "settled" };
  }
  return { kind: "refused", error };
}

/** The sentence to draw under a row whose press was refused; null for the two shapes that settle it. */
export function backgroundMoveRefused(answer: BackgroundMoveAnswer): string | null {
  return answer.kind === "refused" ? S.chat.backgroundMoveRefused(refusalText(answer.error)) : null;
}
