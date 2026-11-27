/**
 * Composer file attachments — the `{type:"file"}` variant of TaskInputPart.
 *
 * The browser has no Session while a chat is still a draft, so there is no upload endpoint to
 * call before sending: the file rides the task request itself as a base64 `data:` URL, exactly
 * like a pasted image does. On the way in it is written to the **Session scratchpad**
 * (`<agent>/scratchpad/<sessionId>/`, deleted with the Session, so cleanup is free) and the
 * message text gains one `[attached file: <absolute path>]` line per file — the bytes never
 * enter the conversation, the model opens the file by path with its ordinary file tools.
 *
 * The line format and its placement are not defined here: they are shared with core's
 * `[attached image: …]` producer and the Web renderer that parses both
 * (`@adelie/core/markers` → attachment-lines.ts, plus `appendAttachmentLines`),
 * so the two conventions cannot drift apart.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { appendAttachmentLines, attachedFileLine, modelVisiblePath } from "@adelie/core";
import type { OmniMessage } from "@adelie/core";
import { HttpError } from "../http/errors.js";
import { badRequest } from "../http/validate.js";
import type { RecalledFile } from "../api/types.js";
import type { AttachmentLimits } from "./attachment-limits.js";

/**
 * The size limits are no longer constants here: they are admin-settable (see attachment-limits.ts
 * for the numbers and the reasoning) and are resolved per request, so a change applies to the very
 * next upload without a restart. The caps are still enforced in THIS module rather than delegated
 * to the global body cap — that cap is derived from these limits, and a validator that depends on
 * the middleware upstream of it would be silently unbounded by a caller that never passes through
 * it. Without the per-request caps a legal body fits ~350k minimal `file` parts, which is 350k
 * sequential writes into one directory and 350k marker lines on one message.
 */

/**
 * Longest stem kept on disk, measured in **UTF-8 bytes**: filesystems cap a name near 255
 * bytes, and a CJK character costs three of them — a character count would let a Chinese name
 * blow the real limit while an English one stayed far under it.
 */
const MAX_STEM_BYTES = 80;

/** Windows reserves these device names with or without an extension (`con`, `con.txt`), case-insensitively. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Format and control characters (Unicode category C) — invisible, and the vector behind right-to-left file-name spoofing. */
const INVISIBLE_CHAR = /\p{C}/u;

/**
 * True when a character must not reach a file name. ASCII keeps the long-standing whitelist:
 * a space or a shell metacharacter inside a path the model is about to paste into a command is
 * a footgun, so anything outside `[A-Za-z0-9._-]` still becomes `-` down there. Above ASCII the
 * rule inverts — the character is kept as typed, so `报告.pdf` reaches the model as `报告.pdf`
 * instead of collapsing to an anonymous `file.pdf` (CJK, accents and emoji are all harmless to
 * a shell). The exception is Unicode category C: invisible controls, and the bidi overrides
 * that let a name render as something it is not.
 */
function unsafeNameChar(ch: string): boolean {
  if (/[A-Za-z0-9._-]/.test(ch)) return false;
  return ch.codePointAt(0)! < 0x80 || INVISIBLE_CHAR.test(ch);
}

/** Replace every unsafe character with `-`, iterating code points so a surrogate pair survives intact. */
function sanitizeSegment(value: string): string {
  return Array.from(value, (ch) => (unsafeNameChar(ch) ? "-" : ch)).join("");
}

/** Truncate to a UTF-8 byte budget on character boundaries (iterating a string yields whole code points, so a surrogate pair is never split). */
function truncateBytes(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value) <= maxBytes) return value;
  let out = "";
  for (const ch of value) {
    if (Buffer.byteLength(out) + Buffer.byteLength(ch) > maxBytes) break;
    out += ch;
  }
  return out;
}

/** The 6-hex space makes a second collision negligible; the cap only guards against a filesystem stuck on EEXIST. */
const MAX_NAME_ATTEMPTS = 16;

/**
 * One validated attachment, in either of the two shapes a `{type:"file"}` part may take.
 *
 * The bytes reach the scratchpad by one of two routes, and the difference is only ever *where
 * they are when the request arrives*: `inline` means they rode this request as a base64 data
 * URL (the composer's small-file path), `uploaded` means the composer already sent them to
 * `POST /api/sessions/:id/attachments` and the part carries the path that route handed back
 * (its large-file path — a file big enough that base64-in-the-body is what breaks a browser
 * tab, see chat-input.tsx).
 */
export type TaskAttachment = InlineAttachment | UploadedAttachment;

interface InlineAttachment {
  kind: "inline";
  /** Original file name as submitted (validated: non-empty, no path separators, no `..`). */
  fileName: string;
  bytes: Buffer;
  /**
   * Media type from the submitted data URL (parameters included, e.g. `text/plain;charset=utf-8`);
   * empty when the URL carried none. Kept so a queued message's recall can re-encode the
   * on-disk bytes into the same data URL shape the composer submitted (see readRecalledFiles).
   */
  mime: string;
}

interface UploadedAttachment {
  kind: "uploaded";
  /** Original file name as submitted (same validation as an inline one; the name on disk was decided by the upload route). */
  fileName: string;
  /** Scratchpad path returned by the upload route — resolved and contained in attachFilesToInput. */
  path: string;
}

/**
 * Validate one `{type:"file"}` input part. Shape problems are 400s in the same style as the
 * neighbouring text/image checks; only the size cap answers 413 (`file_too_large`, the code
 * the Web App already has copy for). `index` is the part's position in the request array
 * named by `field` (default `input`; the steer route passes `files`), so the message points
 * at the offending item like the other input errors do.
 */
export function parseAttachmentPart(
  part: Record<string, unknown>,
  index: number,
  limits: AttachmentLimits,
  field = "input",
): TaskAttachment {
  const fileName = part.fileName;
  // Path separators and `..` are rejected rather than sanitized away: the name is the user's,
  // and a name that looks like a path means the caller is confused about the contract (the
  // write below composes the path itself, and sanitization happens there).
  if (
    typeof fileName !== "string" ||
    fileName.length === 0 ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName.includes("..") ||
    fileName.includes("\0")
  ) {
    throw badRequest(
      `${field}[${index}].fileName must be a non-empty file name without path separators or "..".`,
    );
  }
  // The direct-upload shape: the composer has already put the bytes in this Session's
  // scratchpad (POST …/attachments) and the part names that file. It carries no `dataUrl` —
  // the whole point is that the bytes never travel in this request — and the path is
  // resolved and contained where the directory is known (attachFilesToInput), not here.
  if (part.path !== undefined) {
    if (part.dataUrl !== undefined) {
      throw badRequest(`${field}[${index}] must carry either dataUrl or path, not both.`);
    }
    if (typeof part.path !== "string" || part.path.length === 0 || part.path.includes("\0")) {
      throw badRequest(`${field}[${index}].path must be a non-empty string.`);
    }
    return { kind: "uploaded", fileName, path: part.path };
  }
  const dataUrl = part.dataUrl;
  // `[^,]*` for the media type, not `[^;,]*`: a browser may hand out parameters
  // (`data:text/plain;charset=utf-8;base64,…`), and only the `;base64,` marker separates the
  // type from the payload. The payload's character class is the actual check that it IS
  // base64 (whitespace tolerated — line-wrapped encoders decode fine).
  const match =
    typeof dataUrl === "string" ? /^data:([^,]*);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl) : null;
  if (!match) {
    throw badRequest(`${field}[${index}].dataUrl must be a base64 data: URL of the file's bytes.`);
  }
  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.length === 0) {
    throw badRequest(`${field}[${index}].dataUrl decodes to an empty file.`);
  }
  if (bytes.length > limits.maxBytes) {
    throw new HttpError(
      413,
      "file_too_large",
      `Attached file exceeds the ${limits.maxBytes / (1024 * 1024)}MB limit.`,
    );
  }
  return { kind: "inline", fileName, bytes, mime: match[1]! };
}

/**
 * A queued message's file attachment as held for recall: the scratchpad path it was written
 * to, plus what is needed to rebuild the composer-shaped part — the submitted name and media
 * type (the bytes stay on disk; queued entries never hold file payloads in memory).
 */
export interface RecallableFile {
  fileName: string;
  path: string;
  mime: string;
  /** True when the composer uploaded this file itself (see TaskAttachment) — recall hands the path back rather than reading it. */
  uploaded: boolean;
}

/**
 * Read recalled attachments back into the shape the composer stages them in. A small file
 * comes back as the `{fileName, dataUrl}` it was submitted as; a direct-uploaded one comes
 * back as its scratchpad `path`, because re-encoding it would rebuild exactly the base64
 * string the upload route exists to avoid — a recalled 177MB file would blow the composer up
 * on the way back in.
 *
 * Best effort: a file that disappeared meanwhile (Session deleted from another tab, manual
 * cleanup) is omitted rather than failing the whole recall — the text and images still come
 * back. The caller deletes the inline copies afterwards (removeAttachments over the entries
 * it is told about); a path-backed one is the composer's again and must stay on disk.
 */
export async function readRecalledFiles(files: RecallableFile[]): Promise<RecalledFile[]> {
  const read = await Promise.all(
    files.map(async (f) => {
      if (f.uploaded) {
        try {
          const { size } = await fs.stat(f.path);
          return { fileName: f.fileName, path: f.path, bytes: size } satisfies RecalledFile;
        } catch {
          return null;
        }
      }
      try {
        const bytes = await fs.readFile(f.path);
        const mime = f.mime || "application/octet-stream";
        return {
          fileName: f.fileName,
          dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
        } satisfies RecalledFile;
      } catch {
        return null;
      }
    }),
  );
  return read.filter((f) => f !== null);
}

/** One file attachment in a recalled message: base64 for an inline one, a scratchpad path for a direct-uploaded one (the wire shape, see RecalledMessageResponse). */
export type { RecalledFile };

/**
 * Enforce the per-request caps against everything accepted so far. Called after **each** `file`
 * part rather than once at the end, so an oversized `input` stops at the part that crosses the
 * line instead of base64-decoding the whole array first. Both answer 413: the count reuses a
 * dedicated `too_many_files` code, the aggregate the `payload_too_large` the body cap already
 * uses — from the caller's side it is the same "this request is too big" outcome.
 *
 * Direct-uploaded parts contribute nothing to the total here: their bytes never rode this
 * request, so their size is not known until their file is stat-ed (attachFilesToInput, which
 * re-checks the same aggregate over every attachment's real size). The count is complete
 * either way.
 */
export function assertAttachmentBudget(
  attachments: TaskAttachment[],
  limits: AttachmentLimits,
): void {
  if (attachments.length > limits.maxCount) {
    throw new HttpError(
      413,
      "too_many_files",
      `A message may carry at most ${limits.maxCount} attached files.`,
    );
  }
  let total = 0;
  for (const a of attachments) total += a.kind === "inline" ? a.bytes.length : 0;
  assertTotalBytes(total, limits);
}

/** The aggregate half of the budget above, on its own so the direct-upload path can re-run it once every attachment's size is known. */
export function assertTotalBytes(total: number, limits: AttachmentLimits): void {
  if (total > limits.totalBytes) {
    throw new HttpError(
      413,
      "payload_too_large",
      `Attached files exceed the ${limits.totalBytes / (1024 * 1024)}MB total limit for one message.`,
    );
  }
}

/**
 * Map a submitted name onto a name that is safe on disk **and** still recognizably the user's
 * own: `报告 2026.pdf` becomes `报告-2026.pdf` (see unsafeNameChar — the words survive, only the
 * shell-hostile ASCII is replaced), so the model reads a meaningful path and a person looking
 * at the message recognizes what they attached.
 *
 * The rest is Windows-shaped hygiene: trailing dots and spaces are dropped (Windows silently
 * strips them, so `a.` and `a` would be the same file), a reserved device name is prefixed
 * (`con.txt` → `_con.txt`), the stem is capped by UTF-8 bytes, and a stem that sanitizes away
 * entirely falls back to `file` rather than producing a bare extension.
 */
function scratchpadName(fileName: string): string {
  const ext = sanitizeSegment(path.extname(fileName));
  const rawStem = fileName.slice(0, fileName.length - path.extname(fileName).length);
  // Trim after truncating: a cut can expose a trailing dot or space that was mid-name before.
  const stem = truncateBytes(sanitizeSegment(rawStem), MAX_STEM_BYTES).replace(/[. ]+$/, "");
  // Nothing but replacement dashes carries no more information than an empty stem did.
  if (!stem || /^-+$/.test(stem)) return `file${ext}`;
  return WINDOWS_RESERVED.test(stem) ? `_${stem}${ext}` : `${stem}${ext}`;
}

/**
 * Run `take` on the first file name in `dir` that is still free: the plain sanitized name (the
 * model — and the user reading the message — sees `report.pdf`, not an opaque id), then
 * `report-3f9a1c.pdf` and so on. "wx" makes the create exclusive, so a second upload of the
 * same name lands next to the first instead of overwriting it (same convention as core's image
 * uploads), and it is O_CREAT|O_EXCL, which also refuses to follow a symlink at the final
 * component: a link planted at `report.pdf` fails with EEXIST and the retry allocates a
 * suffixed name instead of writing through it. The containment check for the *directory* is
 * separate — see openScratchpadDir.
 *
 * `take` owns the create itself, so the same allocation serves a buffer written in one call
 * and a body streamed in (receiveAttachment below).
 */
async function withAttachmentName<T>(
  dir: string,
  fileName: string,
  take: (file: string) => Promise<T>,
): Promise<T> {
  const base = scratchpadName(fileName);
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length);
  for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
    const name = attempt === 0 ? base : `${stem}-${randomBytes(3).toString("hex")}${ext}`;
    const file = path.join(dir, name);
    try {
      return await take(file);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
  throw new Error(
    `failed to allocate a unique attachment file name under ${dir} after ${MAX_NAME_ATTEMPTS} attempts`,
  );
}

/**
 * The submitted file name's own rules, shared by the two upload routes (single-shot and chunked
 * — multipart-uploads.ts commits through this module on purpose, so both answer the same way).
 * A name is only a name: no separators, no `..`, no NUL, and not absurdly long.
 */
export function validateAttachmentName(name: string): void {
  if (
    name.length === 0 ||
    name.length > 512 ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("..") ||
    name.includes("\0")
  ) {
    throw badRequest('name must be a non-empty file name without path separators or "..".');
  }
}

/**
 * Give a file that was already written somewhere else its final scratchpad name.
 *
 * The chunked upload writes its slices into a hidden part file and only calls this once every
 * slice arrived. A hard link under a `wx`-allocated name keeps the two properties the single-shot
 * route has: a collision gets a suffixed name instead of overwriting, and the commit is atomic —
 * a reader never sees a half-linked file (the part file is the only copy in flight, and it is
 * removed after the link). Same directory either way, so the link never crosses a filesystem.
 */
export async function commitAttachmentFile(
  dir: string,
  fileName: string,
  source: string,
): Promise<string> {
  return withAttachmentName(dir, fileName, async (file) => {
    await fs.link(source, file);
    return file;
  });
}

/** Write one inline attachment into `dir` and return its absolute path. */
async function writeAttachment(dir: string, attachment: InlineAttachment): Promise<string> {
  return withAttachmentName(dir, attachment.fileName, async (file) => {
    await fs.writeFile(file, attachment.bytes, { flag: "wx" });
    return file;
  });
}

/**
 * Create (or reuse) this Session's scratchpad directory and hand back the path to write into.
 *
 * `fs.mkdir(…, {recursive:true})` succeeds silently when the directory is already a **symlink**
 * to somewhere else, and nothing downstream would notice — so the result is realpath'd and
 * required to still sit inside the Agent's scratchpad root, the same containment rule the
 * Workspace upload path applies (workspace-files-service.resolveWriteParent). Only the Agent
 * process can plant such a link and it runs as this server's uid, so this is consistency rather
 * than a privilege boundary; it costs one resolution per message that carries attachments.
 *
 * The check is on the canonical path but the write stays on the logical one: the path travels
 * into the message text, and the read/delete endpoints address a Session by its logical
 * directory, so canonicalizing here would only make those disagree on hosts where the data root
 * itself sits behind a link (macOS `/var`, a Windows 8.3 temp path).
 */
async function openScratchpadDir(root: string, sessionId: string): Promise<string> {
  const dir = path.join(root, sessionId);
  await fs.mkdir(dir, { recursive: true });
  const canonicalRoot = await fs.realpath(root);
  const rel = path.relative(canonicalRoot, await fs.realpath(dir));
  if (rel !== sessionId) {
    throw new Error(
      `session scratchpad ${dir} resolves outside the agent scratchpad root; refusing to write attachments`,
    );
  }
  return dir;
}

/** The same directory, for the upload route: it must land its bytes exactly where the parts that reference them will be resolved. */
export const openSessionScratchpad = openScratchpadDir;

/** What the direct-upload route hands back, and what a `{type:"file", path}` part then names. */
export interface ReceivedAttachment {
  /** The name the file actually got on disk (sanitized, collision-suffixed — not the submitted one). */
  fileName: string;
  path: string;
  bytes: number;
}

/**
 * Stream one uploaded file into the Session scratchpad — the large-file half of the composer's
 * attachment path (`POST /api/sessions/:id/attachments`).
 *
 * The bytes arrive as the request body, so neither side ever holds the file whole: the browser
 * streams the picked `File` straight from disk and this writes chunk by chunk, where the
 * inline route would have built a base64 string, serialized it into the task body and decoded
 * it again here. The per-file cap is measured as the bytes arrive rather than read off a
 * `content-length` claim, and a body that crosses it takes the half-written file with it.
 */
export async function receiveAttachment(
  dir: string,
  fileName: string,
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<ReceivedAttachment> {
  if (body === null) throw badRequest("the request body must carry the file's bytes.");
  const { file, handle } = await withAttachmentName(dir, fileName, async (target) => ({
    file: target,
    handle: await fs.open(target, "wx"),
  }));
  let bytes = 0;
  try {
    const reader = body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new HttpError(
          413,
          "file_too_large",
          `Attached file exceeds the ${maxBytes / (1024 * 1024)}MB limit.`,
        );
      }
      await handle.write(value);
    }
  } catch (err) {
    await handle.close().catch(() => {});
    await fs.rm(file, { force: true }).catch(() => {});
    throw err;
  }
  await handle.close();
  if (bytes === 0) {
    await fs.rm(file, { force: true }).catch(() => {});
    throw badRequest("the uploaded file is empty.");
  }
  return { fileName: path.basename(file), path: file, bytes };
}

/**
 * Resolve a `{type:"file", path}` part against the Session's scratchpad. The path must name a
 * regular file **directly inside** this Session's scratchpad directory — the only place the
 * upload route writes, and the only place such a part may point. A symlink is refused (lstat,
 * not stat): the point of the whole check is that neither a planted link nor a path from
 * somewhere else in the data root can become an `[attached file: …]` line the model then opens.
 *
 * The logical path is what comes back, matching the inline writes above, so both kinds of
 * attachment are read back and deleted by the same code.
 */
async function resolveUploadedFile(dir: string, raw: string, fileName: string): Promise<string> {
  const file = path.resolve(raw);
  let canonical: string;
  let info: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    canonical = await fs.realpath(file);
    info = await fs.lstat(canonical);
  } catch {
    throw badRequest(`attached file "${fileName}" is no longer in the Session scratchpad.`);
  }
  if (!info.isFile()) throw badRequest(`attached file "${fileName}" is not a regular file.`);
  if (path.dirname(canonical) !== (await fs.realpath(dir))) {
    throw badRequest(`attached file "${fileName}" is outside the Session scratchpad.`);
  }
  return file;
}

/** Best-effort undo of a batch of writes; errors are swallowed because every caller is already on an error path (a failed cleanup must not replace the original failure). */
export async function removeAttachments(files: string[]): Promise<void> {
  await Promise.all(files.map((f) => fs.rm(f, { force: true }).catch(() => {})));
}

/** Result of a batch: the Prompt to run, the paths **this request wrote** (the caller's undo list), and every attachment as it landed (the queue's recall). */
export interface AttachedFiles {
  input: OmniMessage[];
  written: string[];
  files: RecallableFile[];
}

/**
 * Land every attachment on the Session scratchpad under `root` and return the Prompt with one
 * `[attached file: <path>]` line appended per file. Placement follows core's shared rule
 * (after the last user text message; attachments-only input becomes a line-only text
 * message), so a Prompt carrying both images and files still ends in a single trailing block.
 * Returns `messages` untouched when there is nothing to attach — no directory is created.
 *
 * Inline attachments are written here; a direct-uploaded one is only resolved and checked (the
 * composer's upload route wrote it before this request existed). The distinction matters to
 * the caller's undo: `written` names the files this request created, and only those may be
 * removed when starting the Task fails — the uploaded ones are the composer's own, still held
 * by the chip the user is about to retry.
 *
 * All-or-nothing: a failure part-way through the batch removes what it already wrote, so a 500
 * never leaves files on disk that no message refers to. The caller owns the other half of that
 * guarantee — if starting the Task fails afterwards it must call removeAttachments(written),
 * otherwise the user's retry would land a second copy of every file.
 */
export async function attachFilesToInput(
  messages: OmniMessage[],
  attachments: TaskAttachment[],
  limits: AttachmentLimits,
  root: string,
  sessionId: string,
): Promise<AttachedFiles> {
  if (attachments.length === 0) return { input: messages, written: [], files: [] };
  const dir = await openScratchpadDir(root, sessionId);
  // Resolve and measure before anything is written: a request over the aggregate cap must not
  // leave files behind, and an uploaded part's size is only knowable by looking at the file it
  // names (which is also where its containment is checked).
  const resolved: { attachment: TaskAttachment; path: string; bytes: number }[] = [];
  let total = 0;
  for (const attachment of attachments) {
    if (attachment.kind === "uploaded") {
      const path = await resolveUploadedFile(dir, attachment.path, attachment.fileName);
      const { size } = await fs.stat(path);
      resolved.push({ attachment, path, bytes: size });
      total += size;
    } else {
      resolved.push({ attachment, path: "", bytes: attachment.bytes.length });
      total += attachment.bytes.length;
    }
  }
  assertTotalBytes(total, limits);
  const written: string[] = [];
  const files: RecallableFile[] = [];
  try {
    // Sequential on purpose: the exclusive-create retry above resolves collisions against files
    // that already exist, and writing the batch one at a time keeps two same-named uploads in
    // the same message from racing each other for the plain name.
    for (const entry of resolved) {
      const attachment = entry.attachment;
      if (attachment.kind === "uploaded") {
        files.push({
          fileName: attachment.fileName,
          path: entry.path,
          mime: "",
          uploaded: true,
        });
        continue;
      }
      const path = await writeAttachment(dir, attachment);
      written.push(path);
      files.push({ fileName: attachment.fileName, path, mime: attachment.mime, uploaded: false });
    }
  } catch (err) {
    await removeAttachments(written);
    throw err;
  }
  return {
    input: appendAttachmentLines(
      messages,
      files.map((f) => attachedFileLine(modelVisiblePath(f.path))),
    ),
    written,
    files,
  };
}
