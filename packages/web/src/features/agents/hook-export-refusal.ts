/**
 * A hook package's "Export" button on the Agent's Hooks tab (`hooks-tab.tsx`), and the sentence
 * one refused export leaves behind — the twin of `skill-export-refusal.ts` (the Skills tab's row,
 * 7.101), because both rows call the same shared archive download and have the same shape.
 *
 * The export is a plain fetch of the installed directory through `archive-download.ts`: nothing is
 * written on the server, the package stays installed either way, and no client state moves while
 * the request is out — so when the request is refused the row that sent it is still on screen, a
 * line above, with the very button that retries it. The reason used to arrive only as a
 * notification: it dismissed itself after six seconds, sat above the list, and a reader who had
 * looked away was left with no zip file and nothing saying why (7.19's rule, app-wide — the
 * sentence belongs where the attempt was made).
 *
 * Which words: `refusalText`, the rule every refusal in the app follows — an answer the server
 * gave is read through its code's own localized sentence, and a value this codebase raised itself
 * is shown as it wrote it. The sentence says the package was not exported *and* that it is still
 * installed, because a failed export is the one moment a reader wonders whether the installed copy
 * was touched.
 */
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/** The sentence one refused export left, and the hook package it was for. */
export interface HookExportRefusal {
  readonly hook: string;
  readonly text: string;
}

/** The sentence: which hook package was not exported, and why. */
export function hookExportRefused(hook: string, error: unknown): string {
  return S.hooks.exportRefused(hook, refusalText(error));
}

/**
 * What this row draws for a refusal, if anything.
 *
 * The tab keeps one refusal at a time — the page's actions are serialized by `busy`, and an
 * attempt supersedes the reason of the attempt before it — so a refusal belongs to the row whose
 * name it carries and no other row may read it. Rows for other packages in the same list must
 * stay exactly as they were.
 */
export function hookExportRefusalFor(
  refusal: HookExportRefusal | null,
  hook: string,
): string | undefined {
  if (refusal === null || refusal.hook !== hook) return undefined;
  return refusal.text;
}
