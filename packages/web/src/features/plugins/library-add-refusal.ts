/**
 * The sentence a published plugin's row keeps after its one verb — "add to the library" — was
 * refused, and why it stays in that row instead of in a notification.
 *
 * That verb fetches the package into the plugin library (the same npm import the header dialog
 * performs, `POST /api/plugins/download`) and writes nothing else: a refusal leaves the plugin
 * exactly as it was — not in the library, not on any Agent — and leaves the row standing in the
 * shelf with the same button, which is the retry. Nothing was typed into this row either, so
 * there is no field to look at: the reason is about the row itself. It used to arrive as a
 * notification, which floated over the list, dismissed itself after six seconds, and left a row
 * that read exactly as it did before the press; it is drawn in the row now, under its tags
 * (`ModuleRow`'s refusal slot), because that is where the retry is.
 *
 * The one answer that is not a refusal keeps its own place: a 409 `plugin_exists` is a question
 * (overwriting replaces every file of the user plugin, local edits included), and the row raises
 * the same overwrite confirmation the import dialog does. The page decides that before asking
 * this function, so it never sees that 409.
 *
 * Whose words: the plugin routes get their own copy (`pluginImportErrorText`, which falls back to
 * the shared code table), and a value this codebase raised itself — nothing the server answered —
 * is read through `refusalText`, the rule every refusal slot in the app follows (7.19).
 */
import { ApiError } from "../../api/client";
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";
import { pluginImportErrorText } from "./plugin-import";

/** The line the published row keeps: the reason, wrapped in the row's own sentence. */
export function libraryAddRefused(error: unknown): string {
  const reason = error instanceof ApiError ? pluginImportErrorText(error) : refusalText(error);
  return S.plugins.libraryAddRefused(reason);
}
