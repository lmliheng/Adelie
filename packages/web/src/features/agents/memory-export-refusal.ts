/**
 * A memory group's "Export" button on the Agent's Memory tab (`memory-tab.tsx`), and the
 * sentence one refused export leaves behind — the fourth of this family, after the Skills tab's
 * rows (7.101, `agents/skill-export-refusal.ts`), the Hooks tab's (7.103,
 * `agents/hook-export-refusal.ts`) and the plugin card's (7.107,
 * `features/plugins/plugin-export-refusal.ts`).
 *
 * The export is a plain fetch of one scope's transfer document through
 * `/api/projects/:p/agents/:a/memory/scopes/:scope/export`: nothing is written on the server, no
 * memory moves and no client state changes while the request is out — so when the request is
 * refused the group that sent it is still on screen, right under the button that retries it. The
 * reason used to arrive only as a notification: it dismissed itself after six seconds, sat above
 * the list, and a reader who had looked away was left with no file and nothing saying why (7.19's
 * rule, app-wide — the sentence belongs where the attempt was made).
 *
 * The sentence hangs off the scope's **key**, not its title: a title is a label (two Workspaces
 * whose folders share a last segment read the same), while the key is what the attempt was about
 * and what the server's route took.
 *
 * Which words: `refusalText`, the rule every refusal in the app follows — an answer the server
 * gave is read through its code's own localized sentence, and a value this codebase raised itself
 * is shown as it wrote it. The sentence says the memories were not touched, because a failed
 * export is the one moment a reader wonders whether the attempt went through the files.
 */
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/** The sentence one refused export left, and the scope it was for. */
export interface MemoryExportRefusal {
  readonly scopeKey: string;
  readonly text: string;
}

/** The sentence: which group was not exported, and why. */
export function memoryExportRefused(scope: string, error: unknown): string {
  return S.memory.exportRefused(scope, refusalText(error));
}

/**
 * What this group draws for a refusal, if anything.
 *
 * The tab keeps one refusal at a time — an attempt supersedes the reason of the attempt before it
 * — so a refusal belongs to the group it was made for and no other group may read it. Groups for
 * other scopes in the same list must stay exactly as they were.
 */
export function memoryExportRefusalFor(
  refusal: MemoryExportRefusal | null,
  scopeKey: string,
): string | undefined {
  if (refusal === null || refusal.scopeKey !== scopeKey) return undefined;
  return refusal.text;
}
