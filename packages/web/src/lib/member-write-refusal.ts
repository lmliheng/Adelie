/**
 * The Members page of the Project settings dialog (`components/layout/project-dialogs.tsx`) and
 * the sentence a refused member write leaves above its table.
 *
 * Granting and revoking a member are ordinary writes on a list that stays on screen: the add row
 * keeps what was typed, the member's own row keeps its 「移除」 button, so the retry is the same
 * control. What was missing was the reason — it arrived as a notification that dismissed itself
 * after six seconds, over a table that looked untouched, and a reader who had looked away was left
 * with a member still listed (or still absent) and nothing saying why (7.19's rule, app-wide: the
 * sentence belongs where the attempt was made).
 *
 * Which words: `refusalText`, the rule every refusal in the app follows — an answer the server
 * gave is read through its code's own localized sentence, and a value this codebase raised itself
 * is shown as it wrote it. The sentence names the account it was about (the table is a list, and
 * two attempts in a row name two different people) and says the list did not change, because a
 * refused write is the one moment a reader wonders whether the row moved anyway.
 */
import { refusalText } from "./api-error";
import { S } from "./strings";

/** Which write was refused, and about whom — enough to name it and to retry it. */
export interface MemberWrite {
  readonly kind: "add" | "remove";
  readonly userId: string;
}

/** The sentence one refused member write left, and the write it was for. */
export interface MemberRefusal {
  readonly write: MemberWrite;
  readonly text: string;
}

/** The sentence: which account was not added or removed, and why. */
export function memberWriteRefused(write: MemberWrite, error: unknown): MemberRefusal {
  const reason = refusalText(error);
  return {
    write,
    text:
      write.kind === "add"
        ? S.project.memberAddRefused(write.userId, reason)
        : S.project.memberRemoveRefused(write.userId, reason),
  };
}
