/**
 * The vault mechanisms: what a node may require, declared apart from what implements it.
 *
 * The Agent-level vault is a method pair on {@link AgentConfig} (services/agent-config-service.ts),
 * because it is one field of that Agent's state. The user-level vault is its own mechanism here:
 * it belongs to an ACCOUNT rather than to any Agent, and the two write different files.
 */
import { Interface } from "@lmliheng/penguin-core/kernel";
import type { VaultResponse, VaultUpdateRequest } from "../api/types.js";

/** UserVault: the mechanism UserVaultService implements — the signed-in user's own secrets (`<root>/users/<userId>/.vault.toml`). */
@Interface()
export abstract class UserVault {
  abstract getVault(userId: string): Promise<VaultResponse>;
  abstract updateVault(userId: string, req: VaultUpdateRequest): Promise<VaultResponse>;
  /**
   * Merges a whole import (see UserVaultImportRequest) into the user's table: keys and values
   * are still unvalidated at this point — the semantic rules (shell-legal key names, value
   * length, non-empty string) live in the service, which is where a bad entry becomes the 400
   * that names it.
   */
  abstract importVault(userId: string, table: Record<string, unknown>): Promise<VaultResponse>;
  /**
   * Copies the named keys from the caller's own user-level vault into one Agent's vault
   * (existing Agent entries are kept, a same-named key is overwritten). Returns the Agent's
   * refreshed masked view — what the Agent settings tab shows after the copy.
   */
  abstract assignToAgent(
    userId: string,
    projectId: string,
    agentId: string,
    keys: string[],
  ): Promise<VaultResponse>;
}
