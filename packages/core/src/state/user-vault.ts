/**
 * User-level environment-variable vault (`<root>/users/<user_id>/.vault.toml`).
 *
 * The Agent-level vault's shape (state/agent-vault.ts: third-party credentials, key names
 * following shell variable rules, values capped so a child process can still be spawned), one
 * scope up: the secrets one USER owns, shared by every Project they can see, because the same
 * gateway key is usually wanted in several of them. Stored beside the Project directories
 * rather than inside one, so nothing here is owned by a Project or deleted with it.
 *
 * Nothing injects this file into a Session. A user-level entry only reaches an Agent by being
 * copied into that Agent's own vault (the "assign" step the API offers), which keeps the
 * runtime's single injection path — the Agent vault — unchanged: no reader of this file exists
 * outside the API layer.
 *
 * Carries the same trade-offs as a credential: plaintext on disk, masked at the API layer,
 * written 0600 and hidden (a hidden file blocks `ls`, not reads). A missing file is an empty
 * table; once emptied, the file is removed rather than left as a stray empty .vault.toml.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { atomicWriteFile } from "../internal/atomic-write.js";
import { userVaultPath } from "./paths.js";
import { assertValidId } from "./agent-state.js";
import { assertValidVaultKey, isValidVaultKey } from "./agent-vault.js";

/**
 * Reads the user vault: returns an empty table if the file doesn't exist.
 * A hand-edited file is filtered by the same rule as the write side — only string values with
 * shell-legal key names are read (see loadAgentVault for why an invalid key is ignored rather
 * than surfaced).
 */
export async function loadUserVault(root: string, userId: string): Promise<Record<string, string>> {
  assertValidId("user_id", userId);
  let raw: string;
  try {
    raw = await fs.readFile(userVaultPath(root, userId), "utf8");
  } catch {
    return {};
  }
  const parsed: unknown = parseToml(raw) ?? {};
  const vault: Record<string, string> = {};
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && isValidVaultKey(k)) vault[k] = v;
    }
  }
  return vault;
}

/**
 * Writes the full table to the user vault: validates all key names first; an empty table
 * deletes the file (idempotent if it doesn't exist). The `users/<id>/` directory is created
 * automatically if it doesn't exist, and is left behind when the table empties (removing it
 * would be a second, unrelated deletion).
 */
export async function saveUserVault(
  root: string,
  userId: string,
  vault: Record<string, string>,
): Promise<void> {
  assertValidId("user_id", userId);
  for (const key of Object.keys(vault)) assertValidVaultKey(key);
  const file = userVaultPath(root, userId);
  if (Object.keys(vault).length === 0) {
    await fs.rm(file, { force: true });
    return;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  // 0600 on every replacement (the atomic write applies the mode), like the Agent vault's.
  await atomicWriteFile(file, `${stringifyToml(vault)}\n`, { mode: 0o600, followSymlinks: true });
}
