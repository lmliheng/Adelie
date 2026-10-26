/**
 * Unified HTTP error: `{error: {code, message}}` response body,
 * with message in English.
 *
 * Routes and services express business errors via throw HttpError; app-level onError
 * uniformly converges these into a JSON response, with unknown errors converged to 500
 * (never leaking internal details to the client).
 */
import type { Context } from "hono";
import { DirectoryBusyError } from "@adelie/core";
import type { ErrorBody } from "../api/types.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function errorBody(code: string, message: string): ErrorBody {
  return { error: { code, message } };
}

/**
 * Model missing a credential: the provider SDK throws this at **client-construction
 * time** (hit by both creating a Session and resuming a Session); the original message
 * is full of environment variable names, meaningless to a user — uniformly replaced
 * with a single actionable sentence. The frontend produces localized text by code
 * (message is only a fallback); see web's lib/api-error.ts.
 */
export function isMissingCredential(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /missing credentials|api[_ ]?key/i.test(message);
}

export function modelCredentialMissing(modelId: string): HttpError {
  return new HttpError(
    400,
    "model_credential_missing",
    `Model ${modelId} has no API key yet. Configure it on the Models page first.`,
  );
}

/**
 * Converges an error caught by onError into the one `handleError` and the error recorder
 * understand. Almost everything passes through untouched; a `DirectoryBusyError` — where Core
 * already exhausted its removal retries because another program (an editor, a virus scanner, a
 * process that was started inside that directory) is holding a Skill or hook directory open —
 * becomes the 409 refusal below.
 *
 * Both are needed because the raw error is handed to two consumers: the response (otherwise a
 * bare 500) and the error recorder, which classifies by `instanceof HttpError` alone — with the
 * original error the error center would show "internal / unexpected", i.e. a bug for the user to
 * report, when the fix is on their machine. Normalizing once, ahead of both, keeps the two in
 * step. Both onError funnels call this (src/app.ts and src/http/app.ts).
 */
export function normalizeError(err: Error): Error {
  if (err instanceof DirectoryBusyError) {
    return new HttpError(
      409,
      "skill_dir_busy",
      `Another program is holding this directory open: ${err.directory}. ` +
        `Close it (an editor, a scanner, a process started in that directory) and try again.`,
    );
  }
  return err;
}

/** app.onError handler: maps HttpError through as-is; everything else is logged and converged to 500. */
export function handleError(err: Error, c: Context): Response {
  if (err instanceof HttpError) {
    if (err.retryAfterSeconds !== undefined) {
      c.header("Retry-After", String(err.retryAfterSeconds));
    }
    return c.json(errorBody(err.code, err.message), err.status as 400);
  }
  // Unknown error: print the stack for diagnosis, but never expose details externally.
  console.error(`[server] Unhandled exception: ${err.stack ?? err.message}`);
  return c.json(errorBody("internal", "Internal server error."), 500);
}
