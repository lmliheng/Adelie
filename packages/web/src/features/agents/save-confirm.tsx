/**
 * Shared confirm-before-save flow for the agent settings forms: `requestSave(run)` opens a
 * standard "save these changes?" dialog and Confirm executes `run`. The caller decides beforehand
 * whether there is anything to save (no changes → an info toast, not a dialog). Render `element`
 * once per surface.
 *
 * The card waits for the write instead of closing on the click (see `awaitSave`): Confirm locks
 * both buttons for as long as the request is out, so a second click cannot fire a rival write
 * against the same sentence, and a refusal keeps the card — with the server's words under its
 * sentence — because that Confirm button is the retry. A toast alone used to be the only account
 * of a refused save, and it dismissed itself out of the card the user was still looking at.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { ConfirmModal } from "@adelie/ui";
import { S } from "../../lib/strings";
import { refusalOf } from "../models/write-outcome";
import { awaitSave, type SaveRun } from "./save-confirm-outcome";

export function useSaveConfirm(): {
  requestSave: (run: SaveRun) => void;
  element: ReactNode;
} {
  const [pending, setPending] = useState<SaveRun | null>(null);
  /** The confirmed write is on the wire: the card stays up with its buttons locked. */
  const [busy, setBusy] = useState(false);
  /**
   * The server's words for the last refused save, drawn in the card's `refusal` slot. It lives
   * with the card because that is what the user is looking at while they press Confirm again;
   * opening the card anew clears it — that sentence belonged to the write that was refused.
   */
  const [refusal, setRefusal] = useState<string | null>(null);

  const close = () => {
    setPending(null);
    setRefusal(null);
  };

  const element = (
    <ConfirmModal
      open={pending !== null}
      title={S.common.confirmSaveTitle}
      tone="primary"
      busy={busy}
      {...(refusal === null ? {} : { refusal: S.common.refused(refusal) })}
      confirmLabel={S.common.save}
      cancelLabel={S.common.cancel}
      onClose={close}
      onConfirm={() => {
        if (pending === null || busy) return;
        setBusy(true);
        setRefusal(null);
        void awaitSave(pending).then((outcome) => {
          setBusy(false);
          // A refusal leaves the card open on purpose: the reason is drawn beside the button that
          // retries the same write, and the sentence stays until that write lands.
          if (outcome.ok) close();
          else setRefusal(refusalOf(outcome));
        });
      }}
    >
      <p className="text-sm text-gray-600 dark:text-gray-300">{S.common.confirmSaveBody}</p>
    </ConfirmModal>
  );
  return {
    requestSave: (run: SaveRun) => {
      setRefusal(null);
      setPending(() => run);
    },
    element,
  };
}
