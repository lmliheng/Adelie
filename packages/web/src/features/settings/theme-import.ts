/**
 * The parts of importing a theme that are not the dialog, kept out of it so they can be tested: how
 * a failed import reads, and the two checks the browser can make before anything is sent.
 *
 * A failure's text is mostly the server's own codes turned into the reader's language
 * (`theme-import-dialog.tsx` explains why the dialog branches the same way). One code is special:
 * `theme_invalid` carries the reader's collected REASONS — what the file got wrong, in as many
 * lines as it takes — and those are the whole message for whoever wrote the file, so they are shown
 * as they came rather than replaced by a sentence of the app's own.
 */
import { ApiError } from "../../api/client";
import { apiErrorText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/**
 * The cap the server and core apply to a theme file. The browser refuses to read a picked file past
 * it, the way the plugin and skill imports do: reading 40MB into a base64 body to be told it is too
 * large is work nobody asked for. The number is core's `MAX_THEME_FILE_BYTES`, which the web does
 * not import (it is a data contract, and this is a screen) — a test holds the two equal.
 */
export const THEME_FILE_LIMIT_KB = 256;

/** Whether a picked file is past the cap, judged on the file itself rather than after reading it. */
export function themeFileTooLarge(sizeBytes: number): boolean {
  return sizeBytes > THEME_FILE_LIMIT_KB * 1024;
}

/**
 * The text of a failed theme import: the codes the two routes answer with get their own copy (the
 * server's message is English-only, and the UI language may not be), everything else goes through
 * the shared error mapping. A 409 `theme_exists` never arrives here — the caller turns it into the
 * overwrite confirmation, which is a question rather than a failure.
 */
export function themeImportErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case "theme_invalid":
        return S.settings.themeImportInvalid(err.message);
      case "theme_too_large":
        return S.settings.themeImportTooLarge;
      case "unsupported_url":
        return S.settings.themeImportBadUrl;
      case "blocked_url":
        return S.settings.themeImportBlockedUrl;
      case "download_failed":
        return S.settings.themeImportDownloadFailed;
      default:
        break;
    }
  }
  return apiErrorText(err);
}
