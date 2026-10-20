/**
 * What a confirmed write in the model library answered (`persist` in models-page.tsx).
 *
 * Only a written change (`ok`) dismisses the confirmation that asked for it; a refusal carries the
 * server's own words back to that confirmation, which draws them beside its retry button. The
 * reason used to be raised as a toast alone — the same sentence, in a box that dismisses itself
 * after six seconds and sits over the dialog rather than in it, so the one thing the user needs
 * while retrying was also the first thing to leave.
 *
 * The words are the caller's to place: a call site with a card still on screen hands them to that
 * card, and the two that have none (a group key written from a dialog that closes on submit, the
 * presets sync started from the toolbar) keep the toast.
 */
export type WriteOutcome = { ok: true } | { ok: false; reason: string };

/** The refusal's words, or `null` for a written change: the single branch every call site reads. */
export function refusalOf(outcome: WriteOutcome): string | null {
  return outcome.ok ? null : outcome.reason;
}
