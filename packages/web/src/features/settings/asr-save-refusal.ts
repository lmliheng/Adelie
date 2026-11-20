/**
 * Where a refused save or check of the speech input is drawn, and what it says.
 *
 * Three fields are written together by one PUT and checked together by one POST, and the server
 * names a bad one of them (`invalid_asr_base_url` / `invalid_asr_model` / `invalid_asr_api_key`),
 * so that sentence belongs under the input it is about. Every other way either verb can fail (a
 * lost session, a dead server, a 500) is about the form as a whole: nothing was written, the
 * fields are exactly as they were, and the same button is the retry. Those go to the section,
 * which is what keeps them on screen at all — a toast raised beside it said the same words a
 * second time and left after six seconds (7.19's rule, app-wide: the sentence belongs where the
 * attempt was made).
 *
 * The branch lives here rather than in the component so that which slot a failure lands in is one
 * sentence of code with a test, not a condition inside a render — the same shape
 * `proxy-save-refusal.ts` gives the section beside it.
 */
import { ApiError } from "../../api/client";
import { refusalText } from "../../lib/api-error";

/** The input a refusal belongs to, or `section` for the form as a whole. */
export type AsrRefusalSlot = "baseUrl" | "model" | "apiKey" | "section";

export type AsrRefusal = {
  /** `section` draws above the Save row; the other three draw under their own input. */
  slot: AsrRefusalSlot;
  text: string;
};

/** The codes the server rejects a single field with, and the input each one is about. */
const FIELD_CODES: Readonly<Record<string, AsrRefusalSlot>> = {
  invalid_asr_base_url: "baseUrl",
  invalid_asr_model: "model",
  invalid_asr_api_key: "apiKey",
};

/** Which slot the failed save or check's sentence goes to, already localized. */
export function asrRefusal(error: unknown): AsrRefusal {
  const text = refusalText(error);
  if (error instanceof ApiError) {
    return { slot: FIELD_CODES[error.code] ?? "section", text };
  }
  return { slot: "section", text };
}
