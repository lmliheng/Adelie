/**
 * The user-level vault: the secrets one account owns
 * (`<root>/users/<userId>/.vault.toml`, read/written through core's loadUserVault/saveUserVault),
 * one scope above the Agent vault this same package already serves.
 *
 * Same rules and same display discipline as the Agent vault: key names follow shell variable
 * naming, values are capped at what a child process can still be spawned with, and every
 * response carries masked values only — plaintext never leaves the server, the responses of a
 * write included.
 *
 * "Assign to an Agent" is the one cross-scope operation here, and it is a COPY: the named entries
 * are written into that Agent's own `.vault.toml` by the Agent config service — this service never
 * touches that file, and the Agent vault keeps its single writer. Same key overwrites, the Agent's
 * other entries stay. Nothing reads the user vault at Session time, so a later change to a
 * user-level entry does not reach an Agent that was assigned before it: the Agent keeps what it
 * was given until the user assigns again.
 *
 * Lives in the Agents module because assigning reaches the Agent config service (the Agent's own
 * vault), whose existence check and masked read both come from there; the API layer reaches the
 * user vault through the UserVault mechanism either way.
 */
import {
  VAULT_VALUE_MAX_LENGTH,
  isValidVaultKey,
  loadUserVault,
  saveUserVault,
} from "@lmliheng/penguin-core";
import type { VaultResponse, VaultUpdateRequest } from "../api/types.js";
import { badRequest } from "../http/validate.js";
import { Component, Use } from "@lmliheng/penguin-core/kernel";
import type { Paths } from "../hmr/capabilities.js";
import type { AgentConfig } from "../mechanisms/agents.js";
import type { UserVault } from "../mechanisms/vault.js";
import { maskApiKey } from "./project-config-service.js";

/** The masked view every response carries: key names with their values masked (never plaintext). */
function maskTable(vault: Record<string, string>): VaultResponse {
  return {
    entries: Object.entries(vault).map(([key, value]) => ({ key, valueMasked: maskApiKey(value) })),
  };
}

/** The key-name rule (core's, shared with the Agent vault): a 400 that names the offending entry. */
function assertImportKey(key: string): void {
  if (!isValidVaultKey(key)) {
    throw badRequest(
      `Invalid vault key name: ${JSON.stringify(key)} (letters, digits and underscores only, and must not start with a digit).`,
    );
  }
}

/** The value rules (non-empty, and short enough for a child-process environment): a 400 that names the entry. */
function assertImportValue(key: string, value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest(`Import value for ${key} must be a non-empty string.`);
  }
  if (value.length > VAULT_VALUE_MAX_LENGTH) {
    throw badRequest(`Vault value too long: ${key} (limit ${VAULT_VALUE_MAX_LENGTH} characters).`);
  }
  return value;
}

@Component()
export class UserVaultService implements UserVault {
  @Use() private readonly paths!: Paths;
  @Use() private readonly agentConfig!: AgentConfig;
  private get root(): string {
    return this.paths.root;
  }

  /** Read the user's vault: masked values only (see the module doc). */
  async getVault(userId: string): Promise<VaultResponse> {
    return maskTable(await loadUserVault(this.root, userId));
  }

  /**
   * PUT replaces the whole user vault table: keys absent from the body are deleted; omitting a
   * value keeps the stored one (a new key must provide one). The rules are the Agent vault's
   * (services/agent-config-service.ts `updateVault`), applied to the user's own file.
   */
  async updateVault(userId: string, req: VaultUpdateRequest): Promise<VaultResponse> {
    const prev = await loadUserVault(this.root, userId);
    const seen = new Set<string>();
    const next: Record<string, string> = {};
    for (const entry of req.entries) {
      assertImportKey(entry.key);
      if (seen.has(entry.key)) throw badRequest(`entries contains a duplicate key: ${entry.key}.`);
      seen.add(entry.key);
      const prevValue = prev[entry.key];
      if (entry.value !== undefined) {
        next[entry.key] = assertImportValue(entry.key, entry.value);
      } else if (prevValue !== undefined) {
        next[entry.key] = prevValue;
      } else {
        throw badRequest(`New key ${entry.key} must provide a value.`);
      }
    }
    await saveUserVault(this.root, userId, next);
    return maskTable(next);
  }

  /**
   * Merges a whole import into the user vault: the pasted JSON object, one entry at a time
   * included. Every entry is checked BEFORE anything is written, so a rejected import changes
   * nothing (the same all-or-nothing rule the PUT has).
   */
  async importVault(userId: string, table: Record<string, unknown>): Promise<VaultResponse> {
    const entries = Object.entries(table);
    if (entries.length === 0) throw badRequest("The imported object contains no entries.");
    const checked: Record<string, string> = {};
    for (const [key, value] of entries) {
      assertImportKey(key);
      checked[key] = assertImportValue(key, value);
    }
    const prev = await loadUserVault(this.root, userId);
    const next = { ...prev, ...checked };
    await saveUserVault(this.root, userId, next);
    return maskTable(next);
  }

  /** Copy named user-level entries into one Agent's vault (see the module doc: a copy, not a link). */
  async assignToAgent(
    userId: string,
    projectId: string,
    agentId: string,
    keys: string[],
  ): Promise<VaultResponse> {
    const wanted = [...new Set(keys)];
    const userVault = await loadUserVault(this.root, userId);
    // Every named key must be in the caller's own vault: assigning a key that is not there would
    // silently write nothing, and a browser tab showing a key the server no longer has is exactly
    // the stale read this check turns into a named failure.
    const copied: { key: string; value: string }[] = [];
    const missing: string[] = [];
    for (const key of wanted) {
      const value = userVault[key];
      if (value === undefined) missing.push(key);
      else copied.push({ key, value });
    }
    if (missing.length > 0) {
      throw badRequest(`Not in your user vault: ${missing.join(", ")}.`);
    }
    // The Agent's table as its own service reports it: the key names (never the values, and none
    // are needed — an entry resent without a value keeps the stored one). That read also 404s an
    // Agent that does not exist, and the write below goes through the same service, so the Agent
    // vault file keeps one writer.
    const current = await this.agentConfig.getVault(projectId, agentId);
    const kept = current.entries
      .filter((entry) => !wanted.includes(entry.key))
      .map((entry) => ({ key: entry.key }));
    return this.agentConfig.updateVault(projectId, agentId, { entries: [...kept, ...copied] });
  }
}
