/**
 * The Security-policy page of the Project settings dialog
 * (`components/layout/project-dialogs.tsx`) and the sentence one refused Save leaves above its
 * Save button.
 *
 * That page buffers the whole `[command_policy]` block — the master switch and every rule — and
 * one Save PUTs it as a unit, so a refusal lands on a form whose controls show a state the engine
 * is NOT running. Two readers get it wrong in the same way: the one who just switched blocking
 * off believes the next command runs unblocked, and the one who just added a deny rule believes it
 * is enforced. The notification that used to carry the reason repeated the error's own words and
 * dismissed itself after six seconds, over a list that looked saved (7.19's rule, app-wide: the
 * sentence belongs where the attempt was made).
 *
 * The sentence therefore says what the Project is still enforcing: the master switch as the last
 * read reported it when this Save would have flipped it, or that the stored rule list is
 * untouched. `refusalText` decides the words for the reason — an answer the server gave is spoken
 * through its code's own localized sentence.
 */
import { refusalText } from "./api-error";
import { S } from "./strings";

/** The master switch as this Save would have stored it, and the one still in force. */
export interface CommandPolicySaveAttempt {
  /** `enabled` as the buffered draft would save it. */
  readonly enabled: boolean;
  /** `enabled` the Project still enforces — the value the last read returned. */
  readonly savedEnabled: boolean;
}

/** The sentence one refused Save left, and the attempt it was for. */
export interface CommandPolicySaveRefusal {
  readonly attempt: CommandPolicySaveAttempt;
  readonly text: string;
}

/** The sentence: what the Project is still enforcing, and why this Save was refused. */
export function commandPolicySaveRefused(
  attempt: CommandPolicySaveAttempt,
  error: unknown,
): CommandPolicySaveRefusal {
  const reason = refusalText(error);
  return {
    attempt,
    text:
      attempt.enabled === attempt.savedEnabled
        ? S.project.commandPolicyRefused(reason)
        : attempt.savedEnabled
          ? S.project.commandPolicyRefusedStillOn(reason)
          : S.project.commandPolicyRefusedStillOff(reason),
  };
}
