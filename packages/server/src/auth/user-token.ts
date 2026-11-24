/**
 * Program tokens (personal access tokens): the credential a person hands an external,
 * server-side app so it can ask Adelie "whose is this". Shared by the offline CLI mint
 * (`mintUserToken`, no running server needed — see auth-token.ts for the same reasoning) and the
 * server's own mint service, so a CLI-minted row cannot drift from one the server issues.
 *
 * The token is opaque (`adelie_pat_` + 32 random bytes) and the database holds only its sha256;
 * an external app pays one round trip per verification (introspection), which is what makes a
 * revocation take effect immediately instead of at a JWT's expiry.
 */
import path from "node:path";
import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { wire } from "@adelie/core/kernel";
import { openExistingDatabase } from "../db/database.js";
import { UserTokensRepo } from "../db/repos/user-tokens.js";
import { UsersRepo } from "../db/repos/users.js";

/** Identifiable prefix, so a leaked token is recognisable in a log or a secret scanner's rule. */
export const USER_TOKEN_PREFIX = "adelie_pat_";

/** Default lifetime of a program token, in days. Long — an external app's config is not a browser tab. */
export const USER_TOKEN_DEFAULT_TTL_DAYS = 90;
/** Ceiling on a caller-supplied `--ttl-days`; `0` is the only way past it, and it means "no expiry". */
export const USER_TOKEN_MAX_TTL_DAYS = 365;

/**
 * The scopes a program token may carry today. Both are identity: who the person is and how to
 * name them. Capability — reading Sessions, running an Agent — is the Agent API's, deliberately
 * not reachable from this credential, so no broader scope exists to grant.
 */
export const USER_TOKEN_SCOPES = ["openid", "profile"] as const;
export type UserTokenScope = (typeof USER_TOKEN_SCOPES)[number];

/** sha256 hex of a raw program token — the only form the database holds. */
export function userTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A fresh raw token and the row facts derived from it (id and display prefix). */
export function newUserToken(): {
  token: string;
  tokenId: string;
  prefix: string;
  tokenHash: string;
} {
  const token = `${USER_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    token: token,
    tokenId: randomBytes(12).toString("base64url"),
    prefix: token.slice(0, 16),
    tokenHash: userTokenHash(token),
  };
}

/**
 * Turns a `--scope` string ("openid,profile" or "openid profile") into the canonical
 * space-separated value stored. Unknown scopes are refused here rather than silently dropped: a
 * typo a caller believes granted something is worse than a rejected flag.
 */
export function parseUserTokenScope(raw: string | undefined): string {
  const requested = (raw ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const wanted = requested.length === 0 ? [...USER_TOKEN_SCOPES] : requested;
  for (const scope of wanted) {
    if (!(USER_TOKEN_SCOPES as readonly string[]).includes(scope)) {
      throw new Error(`unknown scope "${scope}"; allowed: ${USER_TOKEN_SCOPES.join(", ")}`);
    }
  }
  // Canonical order and no duplicates, so two spellings of the same grant store identically.
  return USER_TOKEN_SCOPES.filter((s) => wanted.includes(s)).join(" ");
}

/**
 * The expiry a `--ttl-days` value yields, or null for "never". 0 is the explicit no-expiry case;
 * anything above the cap is clamped, matching the TTL-ceiling habit of auth-token.ts.
 */
export function userTokenExpiry(now: Date, ttlDays: number | undefined): string | null {
  const days = ttlDays ?? USER_TOKEN_DEFAULT_TTL_DAYS;
  if (days === 0) return null;
  const capped = Math.min(Math.max(1, days), USER_TOKEN_MAX_TTL_DAYS);
  return new Date(now.getTime() + capped * 24 * 60 * 60_000).toISOString();
}

export type MintUserTokenResult =
  | { outcome: "minted"; token: string; tokenId: string; userId: string; expiresAt: string | null }
  /** No web.db on this root — the server has never run here, so there is no account to mint for. */
  | { outcome: "no_server" }
  | { outcome: "failed"; detail: string };

function explain(err: unknown, dbPath: string): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("no such table")) {
    return `${dbPath} predates this release — start the server once (\`penguin web\`) to upgrade it`;
  }
  if (message.includes("unable to open database")) {
    return (
      `cannot open ${dbPath} — minting needs the data root's own OS account; ` +
      "otherwise ask an admin to mint one for you"
    );
  }
  return message;
}

/** Mints a program token for `userId` against the data root at `root`, without a running server. */
export function mintUserToken(
  root: string,
  opts: {
    userId: string;
    name: string;
    scope?: string;
    ttlDays?: number;
    createdBy?: string;
    dbPath?: string;
    now?: Date;
  },
): MintUserTokenResult {
  const dbPath = opts.dbPath ?? path.join(root, "web.db");
  if (!fs.existsSync(dbPath)) return { outcome: "no_server" };

  let db: ReturnType<typeof openExistingDatabase> | null = null;
  try {
    db = openExistingDatabase(dbPath);
    if (wire(UsersRepo, { db: db }).findById(opts.userId) === null) {
      return { outcome: "failed", detail: `no such account: ${opts.userId}` };
    }
    const scope = parseUserTokenScope(opts.scope);
    const now = opts.now ?? new Date();
    const { token, tokenId, prefix, tokenHash } = newUserToken();
    const expiresAt = userTokenExpiry(now, opts.ttlDays);
    wire(UserTokensRepo, { db: db }).insert({
      tokenId,
      userId: opts.userId,
      name: opts.name,
      tokenHash,
      prefix,
      scope,
      createdBy: opts.createdBy ?? opts.userId,
      createdAt: now.toISOString(),
      expiresAt,
    });
    return { outcome: "minted", token, tokenId, userId: opts.userId, expiresAt };
  } catch (err) {
    return { outcome: "failed", detail: explain(err, dbPath) };
  } finally {
    db?.close();
  }
}
