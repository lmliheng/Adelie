/**
 * Where a refused save of one plugin card's settings is drawn, and what it says.
 *
 * A value the server's schema turned down is named in its answer (`plugin_config_invalid`, the
 * message opening with `"<field>"`), and that sentence belongs under that field — a cell's
 * refusal is named `<field>.<row>.<column>` and the table lists them under itself.
 *
 * Every other way a save can fail is about the card as a whole: the group went away under the page
 * (404 `plugin_config_unknown` — a plugin or a backend was removed in the meantime), the session
 * expired, the server errored, the machine is unreachable. Nothing was written, every draft is
 * exactly as it was, and the card's own Save is the retry. Those used to go to a toast, which
 * dismisses itself after six seconds and leaves a card that looks untouched (7.19's rule,
 * app-wide: a refusal lives where the thing it is about lives).
 *
 * The branch lives here rather than in the component so that which slot a failure lands in is one
 * sentence of code with a test, not a condition inside a render.
 */
import { ApiError } from "../../api/client";
import { refusalText } from "../../lib/api-error";

export type PluginSaveRefusal = {
  /** The field the server named, drawn under it; `null` when the failure is the card's own. */
  field: string | null;
  text: string;
};

/** Which slot a failed card save's sentence goes to, already localized. */
export function pluginSaveRefusal(error: unknown): PluginSaveRefusal {
  const text = refusalText(error);
  const named =
    error instanceof ApiError && error.code === "plugin_config_invalid"
      ? /^"([^"]+)"/.exec(error.message)?.[1]
      : undefined;
  return { field: named ?? null, text };
}
