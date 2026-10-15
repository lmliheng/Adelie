/**
 * Agent-level Trace browsing routes:
 *   - GET /api/projects/:p/agents/:a/traces — Agent-level listing, served from the
 *     trace-file index (mtime-gated reconcile, then pure DB — see services/trace-index.ts).
 *     Without `limit`: the legacy full drill-down (Agent -> date -> Session -> index,
 *     reverse order), never filtered. With optional `offset`/`limit` (+ optional
 *     `category`): pages Session groups newest-first (within the category when
 *     given), stat-ing only the returned page for fresh sizes, and resolves per group a
 *     display title (sessions DB title, else the registration-time first-prompt
 *     fallback) plus its sidebar category / Workspace and per-category totals. Every
 *     Session is listed whichever client created it, but a company Session, which no category
 *     holds (company mode's own views list it).
 *     The listing consults the sessions table read-only (titles, archived, workspace,
 *     client); discovery itself still comes from the Trace directory tree via the index.
 *   - GET /api/projects/:p/agents/:a/traces/:sessionId/:index (including /analysis, /download) —
 *     read-only Trace detail endpoints: locate the Trace file directly by
 *     (projectId, agentId, sessionId), without depending on the sessions table for
 *     tracking — any entry visible in the directory tree (subagent child Sessions,
 *     CLI-created Sessions) can be opened and read; access is enforced by requireProjectAccess.
 *   - GET /api/projects/:p/agents/:a/traces/:sessionId/export — the whole Session as one
 *     migration bundle (every shard), for import on another install.
 *   - POST /api/projects/:p/agents/:a/traces/import — uploads a Trace JSONL file or a
 *     whole-Session bundle (owner only, mirroring the Agent snapshot import); the content
 *     names itself via its session_meta and always becomes a new Session (indices 1..N for
 *     a bundle) — a session id the Agent already has is rejected with 409
 *     trace_session_exists.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../auth/middleware.js";
import type { SessionCategory, TraceImportResponse } from "../../api/types.js";
import {
  badRequest,
  optionalPagingQuery,
  paginationQuery,
  positiveIntParam,
  readJson,
  requireString,
  requireValidId,
} from "../validate.js";
import type { AgentConfig } from "../../mechanisms/agents.js";
import type { Traces } from "../../mechanisms/traces.js";
import type { Access } from "../../mechanisms/projects.js";

/** What this route group reaches — bound by its module (src/modules). */
export interface AgentTracesRouteDeps {
  agentConfigService: AgentConfig;
  access: Access;
  traceService: Traces;
}

/** Import file size cap: aligned with the snapshot import (stays within the 20MB body limit after base64). */
const MAX_TRACE_BYTES = 14 * 1024 * 1024;

/**
 * Import cap for a whole-Session **bundle** — every shard of one Session in a single upload.
 * Larger than the single-file cap by design: a Session that was compacted is several files, and
 * the point of a bundle is to carry them together. It is still a ceiling, and a loud one: a
 * Session past it is refused with a message naming the limit rather than truncated — migrating
 * such a Session is simply not covered yet (a shard cannot be imported on its own either, by the
 * rule that only ever creates a Session).
 */
const MAX_TRACE_BUNDLE_BYTES = 48 * 1024 * 1024;
/** Base64 of a capped upload inflates by 4/3, plus the JSON envelope's quotes. */
const base64Cap = (bytes: number): number => Math.ceil(bytes * (4 / 3)) + 1024;

/** Accepted `category` query values of the paginated listing (SessionCategory, spelled out for validation — same as the sessions list route). */
const SESSION_CATEGORIES: readonly SessionCategory[] = ["active", "background", "archived"];

export function agentTracesRoutes(deps: AgentTracesRouteDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    // Id validation happens before any path construction: prevents agentId path traversal for cross-Project privilege escalation.
    const projectId = requireValidId(c, "projectId");
    const agentId = requireValidId(c, "agentId");
    deps.access.requireProjectAccess(c.var.user.userId, projectId);
    // Both params absent -> null -> the legacy full response, byte-for-byte as before.
    const paging = optionalPagingQuery(c);
    // Optional category filter (paging then applies within the category): only meaningful
    // on the paginated session-centric shape — the legacy full drill-down has no category
    // notion, so a filtered-but-unpaged request is a client error, not a silent no-op.
    const rawCategory = c.req.query("category");
    if (
      rawCategory !== undefined &&
      !(SESSION_CATEGORIES as readonly string[]).includes(rawCategory)
    ) {
      throw badRequest(`category must be one of ${SESSION_CATEGORIES.join(" / ")}.`);
    }
    if (rawCategory !== undefined && paging === null) throw badRequest("category requires limit.");
    return c.json(
      await deps.traceService.agentTraces(projectId, agentId, paging, {
        ...(rawCategory !== undefined ? { category: rawCategory as SessionCategory } : {}),
      }),
    );
  });

  // Whole-Session export (any member, like the per-file download): every shard of one Session
  // in a single file, so a long Session can be moved to another install in one piece. Registered
  // BEFORE the `/:sessionId/:index` routes — otherwise "export" would be read as an index.
  app.get("/:sessionId/export", async (c) => {
    const projectId = requireValidId(c, "projectId");
    const agentId = requireValidId(c, "agentId");
    const sessionId = requireValidId(c, "sessionId");
    deps.access.requireProjectAccess(c.var.user.userId, projectId);
    const bundle = await deps.traceService.exportSessionBundle(projectId, agentId, sessionId);
    const fileName = `${sessionId}.trace-bundle.json`;
    return new Response(JSON.stringify(bundle), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

  app.get("/:sessionId/:index", async (c) => {
    const projectId = requireValidId(c, "projectId");
    const agentId = requireValidId(c, "agentId");
    const sessionId = requireValidId(c, "sessionId");
    deps.access.requireProjectAccess(c.var.user.userId, projectId);
    const index = positiveIntParam(c, "index");
    const { offset, limit } = paginationQuery(c);
    return c.json(
      await deps.traceService.readEvents(projectId, agentId, sessionId, index, offset, limit),
    );
  });

  app.get("/:sessionId/:index/analysis", async (c) => {
    const projectId = requireValidId(c, "projectId");
    const agentId = requireValidId(c, "agentId");
    const sessionId = requireValidId(c, "sessionId");
    deps.access.requireProjectAccess(c.var.user.userId, projectId);
    const index = positiveIntParam(c, "index");
    return c.json(await deps.traceService.analyze(projectId, agentId, sessionId, index));
  });

  // Raw-file download (any member, like the snapshot export): the file is served verbatim
  // as an attachment, so what's downloaded can be re-imported byte-compatibly.
  app.get("/:sessionId/:index/download", async (c) => {
    const projectId = requireValidId(c, "projectId");
    const agentId = requireValidId(c, "agentId");
    const sessionId = requireValidId(c, "sessionId");
    deps.access.requireProjectAccess(c.var.user.userId, projectId);
    const index = positiveIntParam(c, "index");
    const bytes = await deps.traceService.readFileRaw(projectId, agentId, sessionId, index);
    const fileName = `${sessionId}_${String(index).padStart(3, "0")}.jsonl`;
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

  // Trace file upload (owner only, mirroring the Agent snapshot import): the route checks the
  // transport shape (base64, size); the content itself — JSONL, leading session_meta, a
  // filename-safe session_id — is validated by the service right where the path is built.
  app.post("/import", async (c) => {
    const projectId = requireValidId(c, "projectId");
    const agentId = requireValidId(c, "agentId");
    deps.access.requireProjectOwner(c.var.user.userId, projectId);
    await deps.agentConfigService.requireExists(projectId, agentId);
    const body = await readJson(c);
    const dataBase64 = requireString(body, "dataBase64", {
      minLen: 1,
      maxLen: base64Cap(MAX_TRACE_BUNDLE_BYTES),
    });
    const bytes = Buffer.from(dataBase64, "base64");
    if (bytes.byteLength === 0) throw badRequest("Import file is empty.");
    // One upload, two caps: a whole-Session bundle (the larger ceiling) is a single JSON object —
    // a Trace file is JSON Lines, whose first character is also `{` but whose only possible
    // one-line content is a bare record with no bundle marker. The shape decides the cap, and the
    // service decides the shape; a single Trace file keeps the 14MB ceiling it always had.
    const isBundle = bytes.subarray(0, 256).toString("utf8").trimStart().startsWith("{");
    const cap = isBundle ? MAX_TRACE_BUNDLE_BYTES : MAX_TRACE_BYTES;
    if (bytes.byteLength > cap) {
      throw badRequest(
        isBundle ? "Import bundle exceeds the 48MB limit." : "Import file exceeds the 14MB limit.",
      );
    }
    const res: TraceImportResponse = await deps.traceService.importTraceFile(
      projectId,
      agentId,
      bytes.toString("utf8"),
    );
    return c.json(res);
  });

  return app;
}
