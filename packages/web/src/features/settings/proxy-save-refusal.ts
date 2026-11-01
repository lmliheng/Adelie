/**
 * Where a refused save of the proxy options is drawn, and what it says.
 *
 * The form has exactly one validated field — the address — and the server names that rejection
 * (`invalid_proxy_url`), so that sentence belongs under the input it is about. Every other way a
 * save can fail (a lost session, a dead server, a 500) is about the form as a whole: nothing was
 * written, both switches and the address are exactly as they were, and Save is the retry. Those
 * go to the section, which is what keeps them on screen at all — a toast dismisses itself after
 * six seconds and leaves a form that looks untouched (7.19's rule, app-wide).
 *
 * The branch lives here rather than in the component so that which slot a failure lands in is one
 * sentence of code with a test, not a condition inside a render.
 */
import { ApiError } from "../../api/client";
import { refusalText } from "../../lib/api-error";

export type ProxySaveRefusal = {
  /** `address` draws under the address input; `section` draws under the form it was about. */
  field: "address" | "section";
  text: string;
};

/** Which slot the failed save's sentence goes to, already localized. */
export function proxySaveRefusal(error: unknown): ProxySaveRefusal {
  const text = refusalText(error);
  if (error instanceof ApiError && error.code === "invalid_proxy_url") {
    return { field: "address", text };
  }
  return { field: "section", text };
}
