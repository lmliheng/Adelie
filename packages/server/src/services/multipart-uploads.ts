/**
 * Chunked, parallel attachment upload — the transport behind a large composer file.
 *
 * A single raw upload (`POST /:sessionId/attachments`) streams one `File` over one TCP
 * connection. On a fast local link that is all anyone needs; across an ocean it is not, because a
 * single stream is bounded by its congestion window over a ~200ms round trip and by whatever
 * packet loss the path has — a 155MB file can crawl at a few Mbps however fat the server's pipe
 * is. Several slices in flight at once add their windows together, which is the whole point of
 * this route set: the same file, the same bytes on disk, a fraction of the wall time.
 *
 * The shape is deliberately the smallest one that gets that: the client announces name and size,
 * the server allocates the scratchpad file at that size and hands back a slice plan, the client
 * PUTs each slice (concurrently, any order, retryable) and then asks for completion. Nothing is
 * committed until completion — a half-uploaded file is a hidden `.adelie-upload-*.part` that a
 * sweep removes an hour later, never an `[attached file: …]` the model could open.
 *
 * State lives in this process because a Session's upload is a foreground, user-visible operation
 * (the composer's progress card) — a server restart drops it and the client simply uploads again.
 * The file itself is the durable half: completion is a hard link from the part file to its final
 * name, so a name collision is refused by the filesystem rather than overwritten.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { MultipartUploadStartResponse } from "../api/types.js";
import { HttpError } from "../http/errors.js";
import { badRequest } from "../http/validate.js";
import { commitAttachmentFile } from "./task-attachments.js";
import type { ReceivedAttachment } from "./task-attachments.js";

/**
 * Bytes per slice. The client never picks this: a server that honoured an arbitrary request
 * would accept a million one-byte slices, and one that used its own number keeps the cap (below)
 * meaningful. 4MiB is a compromise — large enough that per-request overhead is noise, small
 * enough that a slice of a slow link (a few Mbps) still finishes in tens of seconds and one lost
 * slice does not re-send a big fraction of the file.
 */
export const MULTIPART_CHUNK_BYTES = 4 * 1024 * 1024;

/** Hard ceiling on slice count — with the 200MB attachment cap this is 50, so it is defence, not tuning. */
export const MULTIPART_MAX_CHUNKS = 512;

/** Where a partial upload lives until it is completed or swept: hidden, prefixed, inside the scratchpad. */
const TMP_PREFIX = ".adelie-upload-";

/** An upload nobody completed in an hour is abandoned; the sweep beside the route does the rest. */
const UPLOAD_TTL_MS = 60 * 60 * 1000;
const SWEEP_EVERY_MS = 10 * 60 * 1000;

interface MultipartUpload {
  uploadId: string;
  sessionId: string;
  dir: string;
  tmpFile: string;
  /** The submitted name; sanitized and collision-suffixed only when the upload commits. */
  name: string;
  size: number;
  chunkSize: number;
  totalChunks: number;
  /** Slice index → bytes written. Presence is what "this slice arrived" means; re-PUT overwrites. */
  received: Map<number, number>;
  createdAt: number;
}

const uploads = new Map<string, MultipartUpload>();

/**
 * Allocate a scratchpad file for a chunked upload and hand back the slice plan.
 *
 * The file is created at its final size (`truncate`) so every slice writes at a computed offset
 * with no coordination between concurrent PUTs — each opens the file read-write and writes its
 * own range. A size above the admin's per-file cap is refused here, before a byte of disk is
 * reserved; an empty file is refused like the single-shot route does.
 */
export async function startMultipartUpload(
  dir: string,
  sessionId: string,
  name: string,
  size: number,
  maxBytes: number,
): Promise<MultipartUploadStartResponse> {
  if (!Number.isSafeInteger(size) || size <= 0) {
    throw badRequest("size must be a positive integer number of bytes.");
  }
  if (size > maxBytes) {
    throw new HttpError(
      413,
      "file_too_large",
      `Attached file exceeds the ${Math.floor(maxBytes / (1024 * 1024))}MB limit.`,
    );
  }
  const totalChunks = Math.ceil(size / MULTIPART_CHUNK_BYTES);
  if (totalChunks > MULTIPART_MAX_CHUNKS) throw badRequest("file is too large to slice.");
  await sweepAbandonedIn(dir);
  const uploadId = randomBytes(16).toString("hex");
  const tmpFile = path.join(dir, `${TMP_PREFIX}${uploadId}.part`);
  const handle = await fs.open(tmpFile, "wx");
  try {
    await handle.truncate(size);
  } catch (err) {
    await handle.close().catch(() => {});
    await fs.rm(tmpFile, { force: true }).catch(() => {});
    throw err;
  }
  await handle.close();
  uploads.set(uploadId, {
    uploadId,
    sessionId,
    dir,
    tmpFile,
    name,
    size,
    chunkSize: MULTIPART_CHUNK_BYTES,
    totalChunks,
    received: new Map(),
    createdAt: Date.now(),
  });
  return { uploadId, chunkSize: MULTIPART_CHUNK_BYTES, totalChunks };
}

/**
 * The upload behind `uploadId`, provided it belongs to `sessionId`. A foreign id answers 404
 * rather than 403: the two are the same fact to a caller that guessed, and the id is 128 bits.
 */
export function requireMultipartUpload(sessionId: string, uploadId: string): MultipartUpload {
  const up = uploads.get(uploadId);
  if (up === undefined || up.sessionId !== sessionId) {
    throw new HttpError(404, "upload_not_found", "That upload does not exist or has expired.");
  }
  if (Date.now() - up.createdAt > UPLOAD_TTL_MS) {
    void abortMultipartUpload(up);
    throw new HttpError(404, "upload_not_found", "That upload does not exist or has expired.");
  }
  return up;
}

/** The bytes a slice must carry: the full slice size everywhere but the last one. */
function expectedBytes(up: MultipartUpload, index: number): number {
  return index === up.totalChunks - 1 ? up.size - index * up.chunkSize : up.chunkSize;
}

/**
 * Read one slice off the request body and write it at its offset.
 *
 * The length is measured as bytes arrive, like the single-shot route: a short body is a broken
 * client (refused rather than leaving a hole the model would later read as zeroes), and an over-
 * long one is cancelled the moment it crosses its slice. Re-PUTting a slice is legal and simply
 * overwrites it, which is what makes a client-side retry safe.
 */
export async function writeMultipartChunk(
  up: MultipartUpload,
  index: number,
  body: ReadableStream<Uint8Array> | null,
): Promise<{ received: number; total: number }> {
  if (!Number.isSafeInteger(index) || index < 0 || index >= up.totalChunks) {
    throw badRequest(`index must be an integer between 0 and ${up.totalChunks - 1}.`);
  }
  if (body === null) throw badRequest("the request body must carry the chunk's bytes.");
  const expected = expectedBytes(up, index);
  const offset = index * up.chunkSize;
  const buffer = new Uint8Array(expected);
  let filled = 0;
  const reader = body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (filled + value.byteLength > expected) {
      await reader.cancel().catch(() => {});
      throw badRequest(`chunk ${index} is larger than its ${expected} bytes.`);
    }
    buffer.set(value, filled);
    filled += value.byteLength;
  }
  if (filled !== expected) {
    throw badRequest(`chunk ${index} must be exactly ${expected} bytes (got ${filled}).`);
  }
  const handle = await fs.open(up.tmpFile, "r+");
  try {
    await handle.write(buffer, 0, filled, offset);
  } finally {
    await handle.close();
  }
  up.received.set(index, filled);
  return { received: up.received.size, total: up.totalChunks };
}

/**
 * Turn a fully-sliced upload into the attachment the single-shot route would have produced.
 *
 * Every slice must be present — the scratchpad file was pre-sized, so a missing slice is a hole
 * of zeroes rather than a short file, and only the map knows the difference. The commit is a
 * hard link to a freshly allocated final name (`wx` semantics through `withAttachmentName`), so
 * two uploads of the same name still land side by side and nothing overwrites a file the model
 * may already reference.
 */
export async function finishMultipartUpload(up: MultipartUpload): Promise<ReceivedAttachment> {
  const missing: number[] = [];
  for (let i = 0; i < up.totalChunks; i++) if (!up.received.has(i)) missing.push(i);
  if (missing.length > 0) {
    throw new HttpError(
      409,
      "upload_incomplete",
      `Upload is missing ${missing.length} of ${up.totalChunks} chunks (first missing: ${missing[0]}).`,
    );
  }
  const finalFile = await commitAttachmentFile(up.dir, up.name, up.tmpFile);
  await fs.rm(up.tmpFile, { force: true }).catch(() => {});
  uploads.delete(up.uploadId);
  return { fileName: path.basename(finalFile), path: finalFile, bytes: up.size };
}

/** Drop an upload and its partial file; safe to call on anything, including twice. */
export async function abortMultipartUpload(up: MultipartUpload): Promise<void> {
  uploads.delete(up.uploadId);
  await fs.rm(up.tmpFile, { force: true }).catch(() => {});
}

/**
 * Remove part files left behind by an earlier process (a restart empties the map, so their ids
 * are gone and only the age tells them apart). Scoped to the one directory an upload is starting
 * in, so it costs a readdir on the path already hot, not a walk of the data root.
 */
async function sweepAbandonedIn(dir: string): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null);
  if (entries === null) return;
  const now = Date.now();
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile() || !entry.name.startsWith(TMP_PREFIX)) return;
      const file = path.join(dir, entry.name);
      try {
        const info = await fs.stat(file);
        if (now - info.mtimeMs > UPLOAD_TTL_MS) await fs.rm(file, { force: true });
      } catch {
        // Raced with another sweep or a just-committed upload: nothing to do.
      }
    }),
  );
}

// The in-memory half of an abandoned upload. Unref'd so a test process (or a CLI that imported
// this module) never waits on it.
const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const up of [...uploads.values()]) {
    if (now - up.createdAt > UPLOAD_TTL_MS) void abortMultipartUpload(up);
  }
}, SWEEP_EVERY_MS);
sweepTimer.unref();
