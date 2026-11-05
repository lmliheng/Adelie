/**
 * The plugin library's import dialogs: what one failed import leaves behind, and where.
 *
 * Both dialogs are a source plus an optional name, and a refused import writes nothing: the
 * dialog stays open with the archive picked or the URL typed exactly as it was, and the confirm
 * button is the retry. The reason used to arrive as a notification that dismissed itself after
 * six seconds, over the dialog — afterwards the surface looked precisely as it had before the
 * press, and the thing the reader has to fix (the address, the picked file, the name) sat there
 * with nothing said about it.
 *
 * So a refusal now stays under the source field of the dialog that asked. The one case that is
 * not a refusal keeps its own place: a 409 `plugin_exists` is a question, and the overwrite
 * confirmation is where it is asked (it carries the plugin name, which is what makes the
 * question answerable).
 *
 * Whose words: the plugin codes get their own copy (`pluginImportErrorText`, which falls back to
 * the shared code table), and a value this codebase raised itself — nothing the server answered —
 * is read through `refusalText`, the rule every refusal slot in the app follows (7.19).
 */
import { ApiError } from "../../api/client";
import { refusalText } from "../../lib/api-error";
import { pluginImportErrorText, pluginNameFromError } from "./plugin-import";

/** What one failed import should do next. */
export type ImportFailure =
  /** The name is taken: ask before overwriting, naming the plugin. */
  | { readonly kind: "ask"; readonly pluginName: string }
  /** Keep the sentence under the source field of the dialog that asked. */
  | { readonly kind: "field"; readonly text: string }
  /** Put it in a notification — there is no dialog on screen to keep it in. */
  | { readonly kind: "toast"; readonly text: string };

/**
 * The reason one refused import leaves, and where.
 *
 * `dialogOpen` is the state of the dialog that sent the request AT THE MOMENT THE ANSWER CAME
 * BACK, not when it was pressed: both dialog's Cancel stays live during a request (the request is
 * already on its way and still reports itself), so a failure can land after the dialog it belongs
 * to was closed — and a sentence drawn into a closed dialog is a sentence nobody reads. Those keep
 * the notification they always had.
 *
 * `fallbackName` is only read by the 409 branch, which needs a plugin name for its copy even when
 * the server's message does not carry one (see pluginNameFromError).
 */
export function importFailure(
  error: unknown,
  fallbackName: string,
  dialogOpen: boolean,
): ImportFailure {
  if (error instanceof ApiError && error.status === 409 && error.code === "plugin_exists") {
    return { kind: "ask", pluginName: pluginNameFromError(error, fallbackName) };
  }
  const text = error instanceof ApiError ? pluginImportErrorText(error) : refusalText(error);
  return { kind: dialogOpen ? "field" : "toast", text };
}
