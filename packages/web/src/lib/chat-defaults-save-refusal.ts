/**
 * The "New chat defaults" page of the Project settings dialog
 * (`components/layout/project-dialogs.tsx`) and the sentence one refused Save leaves under its
 * controls.
 *
 * One Save is up to TWO writes: the `[default_chat]` block (agent / working directory /
 * approval mode / thinking level) through the declarative whole-block PUT, and — when the model
 * pick changed — the Project's default model through the narrow route. They go out in that
 * order, so a refusal can arrive after the first one has already landed. The notification that
 * used to carry the reason could not say so: it read the error's own words and nothing else, so
 * a Save whose Agent / workspace / approval / thinking change HAD been stored looked exactly
 * like one that never got anywhere — and the reader had to guess which half of the form the
 * Project now holds (7.19's rule, app-wide: the sentence belongs where the attempt was made).
 *
 * The sentence therefore says what the Project stores now: which write was refused, and
 * whether the block before it landed. `refusalText` decides the words for the reason — an answer
 * the server gave is spoken through its code's own localized sentence.
 */
import { refusalText } from "./api-error";
import { S } from "./strings";

/** The write of a Save that was refused: the `[default_chat]` block, or the default model. */
export type ChatDefaultsWrite = "defaults" | "model";

/** Which write was refused, and whether the block write ahead of it had already landed. */
export interface ChatDefaultsSaveAttempt {
  readonly write: ChatDefaultsWrite;
  /** The `[default_chat]` block is stored — only a refused model write can leave this true. */
  readonly defaultsLanded: boolean;
}

/** The sentence one refused Save left, and the attempt it was for. */
export interface ChatDefaultsSaveRefusal {
  readonly attempt: ChatDefaultsSaveAttempt;
  readonly text: string;
}

/** The sentence: which write of the Save was refused, and what the Project holds now. */
export function chatDefaultsSaveRefused(
  attempt: ChatDefaultsSaveAttempt,
  error: unknown,
): ChatDefaultsSaveRefusal {
  const reason = refusalText(error);
  return {
    attempt,
    text:
      attempt.write === "defaults"
        ? S.project.chatDefaultsRefused(reason)
        : attempt.defaultsLanded
          ? S.project.chatDefaultsModelRefusedAfterSave(reason)
          : S.project.chatDefaultsModelRefused(reason),
  };
}
