/**
 * The Chromium partitions the built-in browser runs its pages in.
 *
 * The browser is per-conversation: each conversation's pages live in their own partition, so
 * their cookies and site storage are its own and no other conversation's — two conversations
 * logged into the same site are two independent logins. The default scope (`""`, no
 * conversation: the CLI outside a session, a window showing no conversation) keeps the original
 * partition every installation already has, so nothing a person did before this existed is
 * orphaned.
 *
 * The shell allows the prefix below and hosts a guest in whatever partition its `<webview>`
 * names; this is the one place a scope becomes a partition, and the one place a partition the
 * shell reports becomes a scope again (the server reads it back after a restart, when the shell
 * hands it the full tab list).
 */

/** The partition every guest used before the browser was per-conversation; the default scope's. */
export const BROWSER_PARTITION_PREFIX = "persist:penguin-browser";

/** The partition a conversation's pages run in. `""` keeps the original one. */
export function partitionForScope(scope: string): string {
  return scope === "" ? BROWSER_PARTITION_PREFIX : `${BROWSER_PARTITION_PREFIX}:${scope}`;
}

/**
 * The conversation a partition belongs to, or null when it is not one of ours. The prefix alone
 * is the default scope; `<prefix>:<id>` is that conversation's. A Session id is `[a-z0-9-]` (its
 * own alphabet, never a separator), so the id is the tail unchanged; anything else is refused
 * rather than trusted into a partition name.
 */
export function scopeForPartition(partition: string): string | null {
  if (partition === BROWSER_PARTITION_PREFIX) return "";
  const prefix = `${BROWSER_PARTITION_PREFIX}:`;
  if (!partition.startsWith(prefix)) return null;
  const scope = partition.slice(prefix.length);
  return /^[A-Za-z0-9._-]{1,160}$/.test(scope) ? scope : null;
}
