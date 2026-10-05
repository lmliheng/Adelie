/**
 * Vault environment variable routes:
 * GET|PUT /api/projects/:p/agents/:a/vault (Agent-level, agent_state/.vault.toml).
 * POST …/vault/assign-user-vault copies the caller's user-level entries into this Agent.
 * POST …/vault/template-placeholder inserts/migrates the {{VAULT}} placeholder in the
 * prompt template.
 * Any member can read (values masked); only the owner can modify; 404 if the Agent doesn't exist.
 *
 * The PUT body parser is exported for the user-level vault routes (user-vault.ts), which take
 * the same request shape for the caller's own file.
 */
import { Hono } from "hono";
import type { VaultEntryUpdate, VaultUpdateRequest } from "../../api/types.js";
import type { AppEnv } from "../../auth/middleware.js";
import { badRequest, readJson, requireString, requireValidId } from "../validate.js";
import type { SessionManager } from "../../runtime/session-manager.js";
import type { AgentConfig } from "../../mechanisms/agents.js";
import type { UserVault } from "../../mechanisms/vault.js";
import type { Access } from "../../mechanisms/projects.js";

/** What this route group reaches — bound by its module (src/modules). */
export interface VaultRouteDeps {
  agentConfigService: AgentConfig;
  manager: SessionManager;
  access: Access;
  /** The caller's own user-level vault: the source of the assign endpoint's copy. */
  userVault: UserVault;
}

/** Validate the PUT request body and shape it into a VaultUpdateRequest (semantic checks like key-name rules live in the service layer). */
export function parseVaultUpdate(body: Record<string, unknown>): VaultUpdateRequest {
  if (!Array.isArray(body.entries)) throw badRequest("entries must be an array.");
  const entries: VaultEntryUpdate[] = body.entries.map((item, i) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      throw badRequest(`entries[${i}] must be an object.`);
    }
    const e = item as Record<string, unknown>;
    const entry: VaultEntryUpdate = {
      key: requireString(e, "key", { minLen: 1, maxLen: 200, label: `entries[${i}].key` }),
    };
    if (e.value !== undefined) {
      if (typeof e.value !== "string" || e.value.length === 0) {
        throw badRequest(`entries[${i}].value must be a non-empty string.`);
      }
      entry.value = e.value;
    }
    return entry;
  });
  return { entries };
}

/**
 * Validate the assign request body: the key names to copy out of the caller's own vault. An
 * empty list is refused rather than answered with the unchanged table — the client asked for a
 * copy of nothing, which is never what its checkbox list meant to say.
 */
function parseAssignKeys(body: Record<string, unknown>): string[] {
  const raw = body.keys;
  if (!Array.isArray(raw)) throw badRequest("keys must be an array.");
  const keys = raw.map((item, i) => {
    if (typeof item !== "string" || item.length === 0) {
      throw badRequest(`keys[${i}] must be a non-empty string.`);
    }
    return item;
  });
  if (keys.length === 0) throw badRequest("keys must name at least one user-level entry.");
  return keys;
}

export function vaultRoutes(deps: VaultRouteDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    // Defensive id validation happens before any path construction: prevents agentId path traversal for cross-Project privilege escalation.
    const projectId = requireValidId(c, "projectId");
    const agentId = requireValidId(c, "agentId");
    deps.access.requireProjectAccess(c.var.user.userId, projectId);
    return c.json(await deps.agentConfigService.getVault(projectId, agentId));
  });

  app.put("/", async (c) => {
    const projectId = requireValidId(c, "projectId");
    const agentId = requireValidId(c, "agentId");
    deps.access.requireProjectOwner(c.var.user.userId, projectId);
    const req = parseVaultUpdate(await readJson(c));
    const res = await deps.agentConfigService.updateVault(projectId, agentId, req);
    // No runtime invalidation: like every Agent State change, the new values reach a
    // running Session at its next compaction (core reads the vault into each model
    // context), and a new Session immediately — the same timing the CLI has.
    return c.json(res);
  });

  // Assign user-level (global) entries to this Agent: a one-off COPY into its own vault —
  // same key overwrites, the Agent's other entries stay. Owner-level like every other write
  // here, and the source table is always the caller's own (never another account's).
  app.post("/assign-user-vault", async (c) => {
    const projectId = requireValidId(c, "projectId");
    const agentId = requireValidId(c, "agentId");
    deps.access.requireProjectOwner(c.var.user.userId, projectId);
    const keys = parseAssignKeys(await readJson(c));
    return c.json(await deps.userVault.assignToAgent(c.var.user.userId, projectId, agentId, keys));
  });

  // Insert (or migrate a legacy hardcoded # Vault section to) the {{VAULT}} placeholder —
  // the explicit adoption path mirroring memory's endpoint; idempotent config write,
  // owner-level like this router's other mutation.
  app.post("/template-placeholder", async (c) => {
    const projectId = requireValidId(c, "projectId");
    const agentId = requireValidId(c, "agentId");
    deps.access.requireProjectOwner(c.var.user.userId, projectId);
    const view = await deps.agentConfigService.insertTemplatePlaceholder(
      projectId,
      agentId,
      "vault",
    );
    return c.json(view.config.vault);
  });

  return app;
}
