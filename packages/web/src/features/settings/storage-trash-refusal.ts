/**
 * The trash's three writes, and the line a refusal leaves under the button that asked.
 *
 * "Restore", "delete for good" and "delete what is past retention" each end in a `catch` that used
 * to be a toast only: six seconds later the entry was still listed, the trash looked untouched, and
 * nothing on screen said why — the shape 7.19 bans app-wide (a refusal lives where the thing it is
 * about lives). One of the three is the only deletion in the whole app, which is what makes the
 * missing account worse here than elsewhere: a person who pressed "delete for good" has to be told,
 * where they pressed it, that nothing was deleted and in the server's own words why.
 *
 * The refusal is keyed the same way as the button that asked, rather than kept as a sentence for
 * the block: an entry's row and the batch button are two different places on the page, and the
 * batch button names no entry at all.
 */
import { S } from "../../lib/strings";

/** The three writes the trash offers; the page names them by the same word in its own state. */
export type StorageTrashAction = "restore" | "purge" | "purgeExpired";

/**
 * The key one trash write is known by: while it is in flight (the row's `aria-busy`) and, if it is
 * refused, the row its line is drawn under.
 *
 * The batch that takes no entry has a word of its own (`purge:expired`); an entry's id is the
 * compact local timestamp a run was moved at (`20261103120000`, `…-2` for the second one in that
 * second — see `storageTrashId` in core), so the two can never collide.
 */
export function storageTrashKey(action: StorageTrashAction, id: string | null): string {
  return action === "purgeExpired" ? "purge:expired" : `${action}:${id ?? ""}`;
}

/** What a refused trash write leaves: the place to draw it (the key above) and the sentence. */
export interface StorageTrashRefusal {
  key: string;
  text: string;
}

/**
 * The line a refused trash write leaves, in the words of the button that was pressed: which action
 * it was (so the sentence still reads right under the batch button, which names no entry), the
 * entry it was for where there is one, and the reason the server gave, as it gave it.
 */
export function storageTrashRefused(key: string, reason: string): StorageTrashRefusal {
  if (key === storageTrashKey("purgeExpired", null)) {
    return { key, text: S.settings.storageTrashRefusedExpired(reason) };
  }
  // The two per-entry writes split on their first colon only: an id travels as it was recorded.
  const split = key.indexOf(":");
  const action = split < 0 ? key : key.slice(0, split);
  const id = split < 0 ? "" : key.slice(split + 1);
  return {
    key,
    text:
      action === "restore"
        ? S.settings.storageTrashRefusedRestore(id, reason)
        : S.settings.storageTrashRefusedPurge(id, reason),
  };
}
