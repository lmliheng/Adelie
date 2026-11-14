/**
 * The update modal's three asks, and the sentence each leaves inside the modal when the ask itself is
 * refused.
 *
 * All three were a toast: "could not run the update action: …", floating over the modal that holds
 * the button which was pressed, gone in six seconds while the modal went on showing the release on
 * offer (or the restart it was waiting for) exactly as before the press. That is 7.19's family —
 * a refused write says why where it was asked — and this modal is the one place these requests can
 * be made from, so the modal itself is the host: the sentence sits above the footer whose button
 * retries it.
 *
 * The step is named in the sentence rather than in the caller, because the three leave the modal in
 * three different places with three different consequences: a refused check learned nothing at all
 * (whatever the body still shows is the previous answer), a refused download fetched no byte, and a
 * refused restart leaves the new version installed but not running. The reader has to be able to
 * tell which one they are looking at.
 *
 * A refused check is deliberately not the flow's `error` state (`update-flow.ts`): that one means the
 * server answered — it ran the lookup and the lookup failed — and its body says so with its own
 * retry. Here our own server said nothing about the lookup, so "the check failed" would be claiming
 * an answer nobody gave.
 *
 * The reason is whatever `apiErrorText` decided — the server's localized message for anything it
 * answered, the network's own text otherwise — and it travels verbatim.
 */
import { S } from "./strings";

/** Which of the modal's three requests a sentence is about. */
export type UpdateRequestStep = "check" | "download" | "restart";

/** The sentence for one refused request, with the reason inside it. */
export function updateRequestRefused(step: UpdateRequestStep, reason: string): string {
  switch (step) {
    case "check":
      return S.update.checkRefused(reason);
    case "download":
      return S.update.downloadRefused(reason);
    case "restart":
      return S.update.restartRefused(reason);
  }
}
