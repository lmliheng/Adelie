/**
 * The composer's pre-flight size check, kept DOM-free so it can be tested directly.
 *
 * Both composer intakes need it and they need it with *different* ceilings: a file attachment is
 * written to the Session scratchpad and read back by path, so it can be large, while an inline
 * image rides the conversation and the Trace and cannot. Sharing the partition function rather
 * than the number is what lets the two stay different without the check itself being written
 * twice.
 *
 * The ceilings themselves are not defined here. They are admin-settable and arrive from the
 * server on `/api/me` (see state/auth `uploadLimits`), because a limit the browser invented would
 * be a limit the server does not enforce — and the failure mode of that disagreement is the one
 * worth avoiding: a client that allows more than the server does turns a clear refusal into a
 * full upload that dies on a generic error.
 */

/** Bytes in one MB. Limits travel over the API in whole MB — the unit the admin form uses. */
export const MB_BYTES = 1024 * 1024;

/** The part of a `File` this check needs; keeps callers free to pass a test double. */
export interface SizedFile {
  name: string;
  size: number;
}

export interface SizeSplit<T> {
  /** Files within the ceiling, in the order they were picked. */
  accepted: T[];
  /** Files over it — refused before being read, so nothing is uploaded to earn the rejection. */
  rejected: T[];
}

/**
 * Split a picked batch against a per-file ceiling given in whole MB.
 *
 * The comparison is `>`, not `>=`: a file of exactly the limit is legal, matching the server's
 * own check (`bytes.length > limits.maxBytes`). An off-by-one in this direction would be
 * invisible in normal use and would reject exactly the file a user resized to fit.
 *
 * Order is preserved on both sides, because the accepted order decides the order of the chips
 * and therefore of the `[attached file: …]` lines the message ends up carrying.
 */
export function splitBySize<T extends SizedFile>(
  files: Iterable<T>,
  limitMb: number,
): SizeSplit<T> {
  const limitBytes = limitMb * MB_BYTES;
  const accepted: T[] = [];
  const rejected: T[] = [];
  for (const file of files) {
    if (file.size > limitBytes) rejected.push(file);
    else accepted.push(file);
  }
  return { accepted, rejected };
}

/**
 * The size at which a file attachment stops riding the message and gets uploaded on its own.
 *
 * Below it the file is read into the page as a base64 data URL and travels inside the task
 * request, exactly as it always has — one round trip, nothing to wait for, and the bytes are
 * small enough that the cost is invisible. At or above it the file goes to
 * `POST /api/sessions/:id/attachments` as raw bytes first, and the task body carries only the
 * scratchpad path that route hands back.
 *
 * The reason the line exists at all is memory, and it is the page's rather than the server's: a
 * 177MB attachment is a ~236MB request body, and building one costs the tab three copies of the
 * same file at once (the File, its base64 string, the serialized body) — which is exactly how a
 * browser dies on a large send, halfway through, with nothing on the server to show for it.
 *
 * 2MB keeps the inline path's worst case honest: a message may carry 20 files, so the largest
 * body the inline route can still produce is ~20 × 2MB of bytes, ~55MB on the wire after base64
 * — small enough that the per-request total cap (and the body cap derived from it) can never be
 * approached by accident.
 */
export const DIRECT_UPLOAD_MIN_BYTES = 2 * MB_BYTES;

export interface TransportSplit<T> {
  /** Files small enough to ride the request as base64, in the order they were picked. */
  inline: T[];
  /** Files large enough to be uploaded on their own first (see DIRECT_UPLOAD_MIN_BYTES). */
  direct: T[];
}

/**
 * Split a batch by how its bytes will travel. The comparison is `>=`: the threshold is where the
 * direct route starts, and a file of exactly that size would produce the same ~2.7MB body as any
 * other inline one. Order is preserved on both sides — it decides the order of the chips and so
 * the order of the `[attached file: …]` lines.
 */
export function splitByTransport<T extends SizedFile>(files: Iterable<T>): TransportSplit<T> {
  const inline: T[] = [];
  const direct: T[] = [];
  for (const file of files) {
    if (file.size >= DIRECT_UPLOAD_MIN_BYTES) direct.push(file);
    else inline.push(file);
  }
  return { inline, direct };
}
