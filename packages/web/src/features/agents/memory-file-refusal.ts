/**
 * A memory row on the Agent's Memory tab (`memory-tab.tsx`) and the sentence one refused **read**
 * leaves behind: the view panel a memory's eye button asks for never opened (7.112).
 *
 * The host is the row, not the group: the eye is that row's own action, the row is still there with
 * the same button, and the panel simply never came up — so the group's slot (7.109 / 7.110, the
 * whole-group transfers) has nothing to do with this one. The row draws the sentence inside itself,
 * under its text and above its rule (`ListRow`'s `notice`), which is why the tab needs no new
 * surface for it.
 *
 * It writes nothing, which is what the sentence says: opening a memory fetches one file. A reader
 * who sees a panel fail to appear can wonder whether the memory is still intact, and this answer is
 * the whole account of it.
 *
 * The sentence hangs off the scope's **key** and the memory's **file name**, never their titles: a
 * title is a label (two Workspaces whose folders share a last segment read the same, and a memory's
 * title may repeat across groups), while the key and the name are what the request was for and what
 * the server's route took.
 *
 * Which words: an answer the server gave is read through `refusalText`, the rule every refusal in
 * the app follows, so the same failure reads the same here as beside any other write.
 */
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";

/** The sentence one refused read left, and which memory it was for. */
export interface MemoryFileRefusal {
  readonly scopeKey: string;
  readonly fileName: string;
  readonly text: string;
}

/** The sentence: which memory did not open, and why. */
export function memoryViewRefused(title: string, error: unknown): string {
  return S.memory.viewRefused(title, refusalText(error));
}

/**
 * What this row draws for a refusal, if anything.
 *
 * The tab keeps one refusal at a time — an attempt supersedes the reason of the attempt before it —
 * so the sentence belongs to the one memory it was made for: every other row in the list, in this
 * group or another, must stay exactly as it was.
 */
export function memoryFileRefusalFor(
  refusal: MemoryFileRefusal | null,
  scopeKey: string,
  fileName: string,
): string | undefined {
  if (refusal === null) return undefined;
  if (refusal.scopeKey !== scopeKey || refusal.fileName !== fileName) return undefined;
  return refusal.text;
}
