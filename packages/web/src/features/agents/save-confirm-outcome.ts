/**
 * What the save confirmation's Confirm button got back (`useSaveConfirm`, save-confirm.tsx).
 *
 * Only a written change dismisses the card that asked for it — the rule the model library settled
 * on (features/models/write-outcome.ts, whose verdict this reuses). The card used to close on the
 * click and leave a refusal to a toast alone: the same sentence, in a box that dismisses itself
 * after six seconds and sits above the card rather than in it, so the one thing the user needs
 * while retrying was also the first thing to leave. Every settings form behind this card had that
 * shape — the Overview's name/description, the System Prompt, Runtime and Tools forms, and the two
 * prompt writers (Memory's, and the sections' enable prompts).
 *
 * The write is awaited, not fired and forgotten. A caller that still catches for itself (each one
 * keeps its own failure toast) therefore has to rethrow, or the card would close on a write the
 * server never took.
 */
import { refusalText } from "../../lib/api-error";
import type { WriteOutcome } from "../models/write-outcome";

/** One confirmed save: the caller's write, synchronous or not. */
export type SaveRun = () => void | Promise<unknown>;

/**
 * Await a confirmed save. `ok` only when the write landed; otherwise the reason the card draws,
 * read the way every other refusal slot reads one (`refusalText`: a server answer, else a
 * codebase-raised sentence meant for the user, else the generic failure).
 */
export async function awaitSave(run: SaveRun): Promise<WriteOutcome> {
  try {
    await run();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: refusalText(e) };
  }
}
