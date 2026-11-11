/**
 * A memory group on the Agent's Memory tab (`memory-tab.tsx`) and the sentence one refused
 * whole-group attempt leaves behind: a download the server would not serve (7.109), and a picked
 * file that never became a document (7.110).
 *
 * Both hang off the same host, so they live in one module. Each group's head strip carries
 * "Export" and — for the owner — "Import", and the import control is a file input wrapped in that
 * strip's label: the file picker **is** this group's control, which is why the reason belongs to
 * the group rather than to a picker of its own. The card's `notice` slot sits between the head
 * strip and the fold, so the sentence stays on screen with the control that retries it even when
 * the group is folded.
 *
 * Neither attempt writes anything. An export only reads, and a file that fails to parse stops
 * before a single request leaves the page — so both sentences may say no memory was changed, which
 * is exactly the doubt a reader has at that moment.
 *
 * The sentence hangs off the scope's **key**, not its title: a title is a label (two Workspaces
 * whose folders share a last segment read the same), while the key is what the attempt was about
 * and what the server's route took.
 *
 * Which words: an answer the server gave is read through `refusalText`, the rule every refusal in
 * the app follows. A document error already carries the interface's own sentence for what is wrong
 * with the file, so it is kept as written; anything else raised while reading the file is the File
 * API handing over no bytes, whose message is the browser's own and never localized — the sentence
 * says instead that the file is not a memory export, which is what the reader is holding.
 */
import { refusalText } from "../../lib/api-error";
import { S } from "../../lib/strings";
import { MemoryDocumentError } from "./memory-transfer";

/** The sentence one refused attempt left, and the scope it was for. */
export interface MemoryGroupRefusal {
  readonly scopeKey: string;
  readonly text: string;
}

/** The sentence: which group was not exported, and why. */
export function memoryExportRefused(scope: string, error: unknown): string {
  return S.memory.exportRefused(scope, refusalText(error));
}

/**
 * The sentence for a picked file that never reached the import modal. The reason is the document
 * error's own words when it has them (an empty document says so), and the plain "this is not a
 * memory export" otherwise.
 */
export function memoryImportRefused(scope: string, error: unknown): string {
  const reason = error instanceof MemoryDocumentError ? error.message : S.memory.importInvalidFile;
  return S.memory.importRefused(scope, reason);
}

/**
 * What this group draws for a refusal, if anything.
 *
 * The tab keeps one refusal at a time — an attempt supersedes the reason of the attempt before it,
 * whichever direction it went — so a refusal belongs to the group it was made for and no other
 * group may read it. Groups for other scopes in the same list must stay exactly as they were.
 */
export function memoryGroupRefusalFor(
  refusal: MemoryGroupRefusal | null,
  scopeKey: string,
): string | undefined {
  if (refusal === null || refusal.scopeKey !== scopeKey) return undefined;
  return refusal.text;
}
