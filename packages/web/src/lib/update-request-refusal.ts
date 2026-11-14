/**
 * The update modal's two asks, and the sentence each leaves inside the modal when the ask itself is
 * refused.
 *
 * Both were a toast: "could not run the update action: …", floating over the modal that holds the
 * button which was pressed, gone in six seconds while the modal went on showing the release on
 * offer (or the restart it was waiting for) exactly as before the press. That is 7.19's family —
 * a refused write says why where it was asked — and this modal is the one place these two requests
 * can be made from, so the modal itself is the host: the sentence sits above the footer whose
 * button retries it.
 *
 * The step is named in the sentence rather than in the caller: "could not start the download" and
 * "could not restart" leave the modal on two different steps, with two different consequences (no
 * update was fetched at all / the new version is installed but not running yet), and the reader
 * has to be able to tell which one they are looking at.
 *
 * The reason is whatever `apiErrorText` decided — the server's localized message for anything it
 * answered, the network's own text otherwise — and it travels verbatim.
 */
import { S } from "./strings";

/** Which of the modal's two requests a sentence is about. */
export type UpdateRequestStep = "download" | "restart";

/** The sentence for one refused request, with the reason inside it. */
export function updateRequestRefused(step: UpdateRequestStep, reason: string): string {
  return step === "download" ? S.update.downloadRefused(reason) : S.update.restartRefused(reason);
}
