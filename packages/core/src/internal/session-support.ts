/**
 * Session creation helpers (used by `agent.createSession` for assembly, not exported
 * via the barrel): Session id generation, runtime environment fields, and temp
 * Workspace creation.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

import { formatLocalDate } from "./dates.js";
import { sessionShell } from "../environment/tools/command/shell.js";
import type { SessionEnvironmentValues } from "../state/agent-state.js";
import { modelVisiblePath } from "./model-visible-path.js";
import { workspacesDir } from "../state/index.js";
import { attachedImageLine, isWholeOriginBlock, userText } from "../omnimessage/index.js";
import type { McpServerConnectResult, OmniMessage } from "../omnimessage/index.js";

/** Session runtime environment fields: the placeholder substitution values for `assembleSystemPrompt`; producer and consumer share the same type. */
export type SessionEnvironment = SessionEnvironmentValues;

/**
 * The `mcp_connect_end` arguments for a finished connect phase, from the per-server outcomes:
 * one failed server makes the phase `fatal`, with the unavailable names in the message. Shared
 * by the two places a connect phase is bracketed — the Session's first-run bootstrap and the
 * context a compaction opens — so both ends read the same.
 */
export function mcpConnectOutcome(results: McpServerConnectResult[]): {
  status: "completed" | "fatal";
  results: McpServerConnectResult[];
  errorCode?: "connect_failed";
  errorMessage?: string;
} {
  const failed = results.filter((r) => r.status !== "completed").map((r) => r.server);
  return {
    status: failed.length > 0 ? "fatal" : "completed",
    results,
    ...(failed.length > 0
      ? { errorCode: "connect_failed" as const, errorMessage: `unavailable: ${failed.join(", ")}` }
      : {}),
  };
}

/** Generate a Session id of the form `session-YYYY-MM-DD-HH-mm-ss-<8-hex>` (local timezone, zero-padded: 4-digit year, 2 digits for the rest; hex from randomUUID). */
export function formatSessionId(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const ts =
    `${formatLocalDate(date)}` +
    `-${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  const hex = randomUUID().replace(/-/g, "").slice(0, 8);
  return `session-${ts}-${hex}`;
}

/**
 * Generate this Session's runtime environment fields (injected via specific
 * placeholders in the system prompt).
 * This is system-generated runtime context, not sourced from Agent State / Workspace files.
 */
export function sessionEnvironment(
  workspaceDir: string,
  sessionId: string,
  ids: { agentId: string; projectDir: string; provider: string; modelId: string },
  date = new Date(),
): SessionEnvironment {
  return {
    sessionId,
    // Model-visible spelling (forward slashes on Windows): the model composes tool arguments
    // and shell commands from these two lines, so they must be safe in both contexts.
    cwd: modelVisiblePath(workspaceDir),
    agentId: ids.agentId,
    projectDir: modelVisiblePath(ids.projectDir),
    provider: ids.provider,
    modelId: ids.modelId,
    platform: process.platform,
    osVersion: getOsVersion(),
    // The shell exec_command actually runs, resolved once per process on every platform: the
    // model must know whether to write bash, PowerShell or plain POSIX syntax.
    shell: sessionShell().name,
    date: formatLocalDate(date),
  };
}

function getOsVersion(): string {
  // os.* is a stable built-in API that normally doesn't throw; but this function only
  // builds a single line of environment info for the system prompt, so it's not worth
  // letting an exception take down createSession — fall back to "unknown" instead.
  try {
    if (process.platform === "win32") {
      return `${os.version()} ${os.release()}`;
    }
    return `${os.type()} ${os.release()}`;
  } catch {
    return "unknown";
  }
}

/** The 8-hex space is 2^32, so the odds of consecutive collisions are negligible; the cap only guards against an infinite loop caused by an abnormal filesystem. */
const MAX_TMP_ID_ATTEMPTS = 16;

/**
 * What a temporary Workspace's directory name starts with. One definition, two readers: the
 * allocator below, and {@link isTemporaryWorkspace} — the shape a resumed Session's recorded
 * Workspace is tested against. The cleanup machinery classifies `tmp-` directories the same way.
 */
const TEMP_WORKSPACE_PREFIX = "tmp-";

/** The directory `workspaces/` a temporary Workspace lives under — the other half of that shape. */
const WORKSPACES_DIR_NAME = "workspaces";

/**
 * Create a temporary Workspace under `<agent>/workspaces/<workspace_id>`, where the
 * directory name is the workspace_id, shaped like `tmp-<8hex>`; if it collides with
 * an existing directory, regenerate the id. No symlinks are created inside the Workspace:
 * the model composes absolute paths (to Agent State, scratchpad, etc.) directly from the
 * Environment placeholders (App Data Dir / Agent ID) in the system prompt.
 */
export async function createTempWorkspace(
  root: string,
  projectId: string,
  agentId: string,
): Promise<string> {
  const base = workspacesDir(root, projectId, agentId);
  await fs.mkdir(base, { recursive: true });
  // The final directory must use a non-recursive mkdir: recursive mkdir succeeds
  // silently when the directory already exists, which would put a new Session into
  // an existing temporary workspace; EEXIST means an id collision, so retry with a new id.
  for (let attempt = 0; attempt < MAX_TMP_ID_ATTEMPTS; attempt++) {
    const dir = path.join(base, `${TEMP_WORKSPACE_PREFIX}${randomUUID().slice(0, 8)}`);
    try {
      await fs.mkdir(dir);
      return dir;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
  throw new Error(
    `failed to allocate a unique temp workspace id under ${base} after ${MAX_TMP_ID_ATTEMPTS} attempts`,
  );
}

/**
 * Whether a recorded Workspace path names a **temporary Workspace** — the `<…>/workspaces/tmp-…`
 * directory {@link createTempWorkspace} allocates for a Session that was not given one.
 *
 * Tested by shape rather than against this install's filesystem, because the path may name another
 * machine's directory: a Session migrated from another install records that install's temp
 * Workspace, which is exactly the case this answers. Both halves are checked — the parent is named
 * `workspaces` and the leaf starts with `tmp-` — so a user's own `…/tmp-build` folder inside some
 * `workspaces` directory is the only thing this can mistake, and a Session whose workspace is a
 * directory the user chose is never one of these.
 */
export function isTemporaryWorkspace(dir: string): boolean {
  return (
    path.basename(dir).startsWith(TEMP_WORKSPACE_PREFIX) &&
    path.basename(path.dirname(dir)) === WORKSPACES_DIR_NAME
  );
}

/**
 * Give a Session back a temporary Workspace this install does not have: create the recorded name
 * under **this** install's `workspaces/` and return that path, or `null` when the recorded path is
 * not a temporary Workspace — i.e. when it is a directory the user pointed the Session at, which
 * this never fabricates.
 *
 * The leaf is kept (same name, this install's root), so resuming twice lands in the same place and
 * the Session reads the same wherever it runs. `recursive` is right here where the allocator above
 * insists on non-recursive: there, an existing directory means an id collision; here it means this
 * very function ran before.
 */
export async function adoptTemporaryWorkspace(
  dir: string,
  root: string,
  projectId: string,
  agentId: string,
): Promise<string | null> {
  if (!isTemporaryWorkspace(dir)) return null;
  const base = workspacesDir(root, projectId, agentId);
  await fs.mkdir(base, { recursive: true });
  const local = path.join(base, path.basename(dir));
  await fs.mkdir(local, { recursive: true });
  return local;
}

/**
 * Stands in for a single image that could not be turned into a path line — a data URL that
 * doesn't parse. Shown to the model and the user instead of silently dropping the attachment.
 * A scratchpad that can't be written to is a different matter: the fold throws and the run
 * ends, rather than carrying on without what the sender attached.
 */
const IMAGE_DROPPED_NOTE = "[an attached image could not be saved and was dropped]";

/** Maps a data URL's mime type to a file extension on disk; unknown mimes use bin (the image-reading tool sniffs the magic bytes and doesn't rely on the extension). */
const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** An input image message — what both conversions below pull out of the input. */
const isImage = (m: OmniMessage): boolean => (m.payload as { type?: string }).type === "image_url";

/**
 * Input conversion for when the session model doesn't support images: image messages
 * in the `run` input are written to disk as files (base64 data URLs are saved to the
 * session scratchpad; http(s) URLs are referenced
 * as-is), and the path/URL is appended to the user text (an `[attached image: …]`
 * line); the image message itself is removed from the input — the model views it by
 * path via read_file (which has a vision model read it on its behalf), and images never
 * enter that session's history directly.
 * Returns the input unchanged when there are no images; an image that can't be
 * parsed is replaced with an explanatory line rather than silently dropped.
 */
export async function imagesToScratchpadPaths(
  input: OmniMessage[],
  dir: string,
): Promise<OmniMessage[]> {
  if (!input.some(isImage)) return input;

  const lines: string[] = [];
  for (const msg of input) {
    if (!isImage(msg)) continue;
    const url = (msg.payload as { image_url?: string }).image_url ?? "";
    if (/^https?:\/\//i.test(url)) {
      lines.push(attachedImageLine(url));
      continue;
    }
    const match = /^data:([^;,]+);base64,(.+)$/s.exec(url);
    if (!match) {
      lines.push(IMAGE_DROPPED_NOTE);
      continue;
    }
    await fs.mkdir(dir, { recursive: true });
    const ext = MIME_TO_EXT[match[1]!.toLowerCase()] ?? "bin";
    // Filename = upload-<8 random hex chars> (same convention as project-<8hex>; the
    // prefix distinguishes model-generated temp files).
    // "wx" flag does exclusive creation to avoid name collisions: on the rare chance of a collision, retry with a new random value.
    let file: string;
    for (;;) {
      file = path.join(dir, `upload-${randomBytes(4).toString("hex")}.${ext}`);
      try {
        await fs.writeFile(file, Buffer.from(match[2]!, "base64"), { flag: "wx" });
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      }
    }
    lines.push(attachedImageLine(modelVisiblePath(file)));
  }

  return appendAttachmentLines(
    input.filter((m) => !isImage(m)),
    lines,
  );
}

/**
 * Concatenation rule shared by every attachment-line producer (see the markers module's
 * attachment-lines.ts): the lines are appended as one block after the **last user text
 * message**; if the input carries no such message (attachments only), they become a plain
 * line-only text message of their own.
 *
 * "User text" here excludes a message that is entirely a whole-message origin block —
 * `[handoff_from]` / `[model_switch_from]` (isWholeOriginBlock). Those parsers only recognize
 * the block when it IS the whole message, so appending to one would turn a one-line banner
 * back into a raw marker in a user bubble. The Web composer reaches exactly that shape when a
 * message carries attachments, no text, and a staged handoff: its only text message is the
 * origin block. Such input therefore falls through to the line-only message, leaving the block
 * intact. Prefix blocks (`[use_skills]`, `[scheduled_task]`) are parsed at index 0 and keep
 * their own body, so they still take the lines as usual.
 *
 * Exported from the package barrel because the server writes `[attached file: …]` lines for
 * the composer's uploads and must place them exactly the same way — one rule, so a message
 * carrying both kinds of attachment still reads as a single trailing block.
 * Returns `input` unchanged when there are no lines to append.
 */
export function appendAttachmentLines(input: OmniMessage[], lines: string[]): OmniMessage[] {
  if (lines.length === 0) return input;
  const suffix = lines.join("\n");
  const lastTextIdx = input.findLastIndex((m) => {
    const p = m.payload as { type?: string; role?: string; text?: string };
    return p.type === "text" && p.role === "user" && !isWholeOriginBlock(p.text ?? "");
  });
  if (lastTextIdx === -1) return [...input, userText(suffix)];
  return input.map((m, i) => {
    if (i !== lastTextIdx) return m;
    const p = m.payload as { type: string; role: string; text: string };
    return { ...m, payload: { ...p, text: `${p.text}\n\n${suffix}` } } as OmniMessage;
  });
}
