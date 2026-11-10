/**
 * A user plugin's "Export plugin" button on the library card (`plugins-page.tsx`), and the
 * sentence one refused export leaves behind — the third of this family, after the Skills tab's
 * rows (7.101, `agent/skill-export-refusal.ts`) and the Hooks tab's (7.103,
 * `agents/hook-export-refusal.ts`): all three export through the same shared archive download
 * (`agents/archive-download.ts`), so all three fail the same way.
 *
 * The export is a plain fetch of the plugin through `/api/plugins/:plugin/archive`: nothing is
 * written on the server, the directory stays where it is, and no client state moves while the
 * request is out — so when the request is refused the card that sent it is still on screen,
 * right under the button that retries it. The reason used to arrive only as a notification: it
 * dismissed itself after six seconds, sat above the list, and a reader who had looked away was
 * left with no zip file and nothing saying why (7.19's rule, app-wide — the sentence belongs
 * where the attempt was made).
 *
 * The card holds the sentence rather than the page (`installRefusal` above it has to live on the
 * page because an install moves the card between sections and remounts it), because nothing about
 * an export moves anything: the same card instance that asked is the one that has to show it.
 *
 * Which words: `refusalText`, the rule every refusal in the app follows — an answer the server
 * gave is read through its code's own localized sentence, and a value this codebase raised
 * itself is shown as it wrote it.
 */
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/** The sentence: which plugin was not exported, and why. */
export function pluginExportRefused(plugin: string, error: unknown): string {
  return S.plugins.exportRefused(plugin, refusalText(error));
}
