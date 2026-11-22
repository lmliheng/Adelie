/**
 * Where a refused save or check of the real-time voice settings is drawn, and what it says.
 *
 * Four fields are written together by one PUT and checked together by one POST, and the server
 * names a bad one of them (`invalid_realtime_base_url` / `invalid_realtime_model` /
 * `invalid_realtime_voice` / `invalid_realtime_api_key`), so that sentence belongs under the input
 * it is about. Every other way either verb can fail (a lost session, a dead server, a 500) is about
 * the form as a whole: nothing was written, the fields are exactly as they were, and the same
 * button is the retry — so it goes to the section, where it stays on screen.
 *
 * The branch lives here rather than in the component for the same reason `asr-save-refusal.ts`
 * does: which slot a failure lands in is one sentence of code with a test, not a condition inside
 * a render.
 */
import { ApiError } from "../../api/client";
import { refusalText } from "../../lib/api-error";

/** The input a refusal belongs to, or `section` for the form as a whole. */
export type RealtimeRefusalSlot = "baseUrl" | "model" | "voice" | "apiKey" | "section";

export type RealtimeRefusal = {
  /** `section` draws above the Save row; the others draw under their own input. */
  slot: RealtimeRefusalSlot;
  text: string;
};

/** The codes the server rejects a single field with, and the input each one is about. */
const FIELD_CODES: Readonly<Record<string, RealtimeRefusalSlot>> = {
  invalid_realtime_base_url: "baseUrl",
  invalid_realtime_model: "model",
  invalid_realtime_voice: "voice",
  invalid_realtime_api_key: "apiKey",
};

/** Which slot the failed save or check's sentence goes to, already localized. */
export function realtimeRefusal(error: unknown): RealtimeRefusal {
  const text = refusalText(error);
  if (error instanceof ApiError) {
    return { slot: FIELD_CODES[error.code] ?? "section", text };
  }
  return { slot: "section", text };
}
