/**
 * What a refused platform sync leaves, and where.
 *
 * The Sync action sits on a group header (Penguin Go's): it refreshes that group's rows from the
 * vendor's catalog, so a refusal writes nothing — the rows, the default pointer and the vision
 * pointer are exactly as they were, and the button is the retry. It used to arrive as a
 * notification that dismissed itself after six seconds over a header showing no sign anything had
 * been pressed (7.19's rule, app-wide); the sentence now stays under the header that asked.
 *
 * One code is not a refusal: `platform_reauthorization_required` means the stored key was revoked,
 * and the page answers it by opening the authorization flow, which is the fix. That branch keeps
 * its own handling and leaves no sentence behind.
 *
 * The branch lives here rather than in the component so that which outcome a failure has is one
 * sentence of code with a test, not a condition inside a render.
 */
import { ApiError } from "../../api/client";
import { refusalText } from "../../lib/api-error";

export type PlatformSyncFailure =
  /** The key was revoked: the page opens the authorization flow instead of keeping a sentence. */
  | { kind: "authorize" }
  /** Keep the sentence under the group header that asked (the retry is its Sync button). */
  | { kind: "refused"; text: string };

/** Which outcome a failed platform sync has, already localized. */
export function platformSyncFailure(error: unknown): PlatformSyncFailure {
  if (error instanceof ApiError && error.code === "platform_reauthorization_required") {
    return { kind: "authorize" };
  }
  return { kind: "refused", text: refusalText(error) };
}
