/**
 * oauth_clients table repo: a registered EXTERNAL app (confidential client — it runs on a
 * server and can keep a secret). Its client_id/secret authenticate the introspection call, so
 * the endpoint is not a bare token-prober, an app can be cut off on its own, and the audit can
 * name who asked. Stores only sha256(client_secret); the raw secret is shown once, at
 * registration.
 */
import { Component, Use } from "@adelie/core/kernel";
import type { Db } from "../../hmr/capabilities.js";
import type { OAuthClients } from "../../mechanisms/oauth.js";

export interface OAuthClientRow {
  clientId: string;
  clientName: string;
  secretHash: string;
  secretPrefix: string;
  /** Space-separated; the most this app may ask for. */
  scopes: string;
  disabled: boolean;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export type NewOAuthClientRow = Omit<OAuthClientRow, "disabled" | "lastUsedAt">;

function clientOf(r: Record<string, unknown>): OAuthClientRow {
  return {
    clientId: r.client_id as string,
    clientName: r.client_name as string,
    secretHash: r.secret_hash as string,
    secretPrefix: r.secret_prefix as string,
    scopes: r.scopes as string,
    disabled: Number(r.disabled) === 1,
    createdBy: r.created_by as string,
    createdAt: r.created_at as string,
    lastUsedAt: (r.last_used_at as string | null) ?? null,
  };
}

@Component()
export class OAuthClientsRepo implements OAuthClients {
  @Use() private readonly db!: Db;

  insert(row: NewOAuthClientRow): void {
    this.db
      .prepare(
        `INSERT INTO oauth_clients
           (client_id, client_name, secret_hash, secret_prefix, scopes, disabled, created_by, created_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, NULL)`,
      )
      .run(
        row.clientId,
        row.clientName,
        row.secretHash,
        row.secretPrefix,
        row.scopes,
        row.createdBy,
        row.createdAt,
      );
  }

  findById(clientId: string): OAuthClientRow | null {
    const r = this.db.prepare("SELECT * FROM oauth_clients WHERE client_id = ?").get(clientId);
    return r ? clientOf(r as Record<string, unknown>) : null;
  }

  list(): OAuthClientRow[] {
    const rows = this.db
      .prepare("SELECT * FROM oauth_clients ORDER BY created_at, client_id")
      .all() as Record<string, unknown>[];
    return rows.map(clientOf);
  }

  setDisabled(clientId: string, disabled: boolean): boolean {
    const result = this.db
      .prepare("UPDATE oauth_clients SET disabled = ? WHERE client_id = ?")
      .run(disabled ? 1 : 0, clientId);
    return Number(result.changes) > 0;
  }

  touch(clientId: string, at: string): void {
    this.db
      .prepare("UPDATE oauth_clients SET last_used_at = ? WHERE client_id = ?")
      .run(at, clientId);
  }

  delete(clientId: string): boolean {
    const result = this.db.prepare("DELETE FROM oauth_clients WHERE client_id = ?").run(clientId);
    return Number(result.changes) > 0;
  }
}
